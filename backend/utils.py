# -------------------------------------------------------------------------------
# Name          Heat Flux Utilities
# Description:  Collection of utilities to calculate heat fluxes on
#               the surface of a water body. Calculations are based
#               on 6.5 day forecast of weather from forecast.weather.gov
#               Methods are primarily based on the heat flux calculations
#               documented in the HEC-RAS 5.0 Users Manual (2016)
# Author:       Chandler Engel
#               US Army Corps of Engineers
#               Cold Regions Research and Engineering Laboratory (CRREL)
#               Chandler.S.Engel@usace.army.mil
# Created:      20 December 2022
# Updated:      27 March 2025 - Remove Streamlit dependency, add FastAPI backend
#
# -------------------------------------------------------------------------------

import numpy as np
import pandas as pd
from pvlib.location import Location
import pytz
import datetime
import requests


def get_elevation(lat, lon):
    try:
        url = f'https://api.opentopodata.org/v1/ned10m?locations={lat},{lon}'
        result = requests.get(url, timeout=10)
        result.raise_for_status()
        return result.json()['results'][0]['elevation']
    except Exception as e:
        raise RuntimeError(f"Failed to fetch elevation for ({lat}, {lon}): {e}")


def get_48h_hourly_forecast(lat, lon, ahead_hour=0):
    url = (
        rf'https://forecast.weather.gov/MapClick.php'
        rf'?w0=t&w1=td&w2=wc&w3=sfcwind&w3u=1&w4=sky&w5=pop&w6=rh'
        rf'&w7=rain&w8=thunder&w9=snow&w10=fzg&w11=sleet'
        rf'&w13u=0&w16u=1&w17u=1&AheadHour={ahead_hour}&Submit=Submit'
        rf'&FcstType=digital&textField1={lat}&textField2={lon}'
        rf'&site=all&unit=0&dd=&bw='
    )

    try:
        pd_tables = pd.read_html(url)
    except Exception as e:
        raise RuntimeError(
            f"Failed to fetch NOAA forecast (AheadHour={ahead_hour}): {e}\n"
            f"URL: {url}"
        )

    try:
        table1 = pd_tables[4].iloc[1:17]
        table2 = pd_tables[4].iloc[18:35]
        table1.set_index(0, inplace=True)
        table2.set_index(0, inplace=True)
        df = pd.merge(table1, table2, left_index=True, right_index=True)
        df = df.T
    except (IndexError, KeyError) as e:
        raise RuntimeError(
            f"NOAA forecast table structure changed — could not parse data: {e}"
        )

    # Generalize the hour column and extract timezone
    hours_col = df.columns[1]
    timezone = hours_col[5:].strip('()')
    gmt_tz = tz_to_gmt_offset(timezone)
    pytz_gmt_tz = pytz.timezone(gmt_tz)
    df = df.rename(columns={hours_col: "hour"})

    # Make datetime index
    df.Date = df.Date.ffill()
    df[["month", "day"]] = df["Date"].str.split("/", expand=True).astype(int)
    current_year = datetime.datetime.now(tz=pytz_gmt_tz).year
    current_month = datetime.datetime.now(tz=pytz_gmt_tz).month
    df['year'] = np.where(df['month'] >= current_month, current_year, current_year + 1)
    df['date'] = pd.to_datetime(df[['year', 'month', 'day']]) + pd.to_timedelta(df['hour'].astype(int), unit="h")
    df = df.set_index('date').drop(['Date', 'hour', 'month', 'day', 'year'], axis=1)

    df.index = df.index.tz_localize(tz=gmt_tz)
    return df


def get_full_forecast(lat, lon):
    aheadhours = [48, 96, 107]
    df = get_48h_hourly_forecast(lat, lon, 0)
    for aheadhour in aheadhours:
        df2 = get_48h_hourly_forecast(lat, lon, aheadhour)
        df = pd.concat([df, df2], axis=0)
    df = df[~df.index.duplicated(keep='first')]

    # Wind direction is compass text (e.g. "NW") — preserve it before numeric coercion
    wind_dir_col = next((c for c in df.columns if 'Wind Dir' in c), None)
    wind_dir_saved = df[wind_dir_col].copy() if wind_dir_col else None

    df = df.apply(pd.to_numeric, errors='coerce')

    # Restore the text wind direction column
    if wind_dir_col and wind_dir_saved is not None:
        df[wind_dir_col] = wind_dir_saved

    return df


def get_is_day(index, lat, lon):
    """Return bool list: True when sun is above horizon."""
    try:
        site = Location(lat, lon)
        solar = site.get_solarposition(index)
        return (solar['elevation'] > 0).tolist()
    except Exception:
        return [(6 <= t.hour < 20) for t in index]


def get_solar(lat, lon, elevation, site_name, times, tz):
    site = Location(lat, lon, tz, elevation, site_name)
    cs = site.get_clearsky(times)
    return cs


def calc_solar(q0_a_t, R, Cl):
    q_sw = q0_a_t * (1 - R) * (1 - 0.65 * Cl ** 2)
    return q_sw


def calc_downwelling_LW(T_air, Cl):
    Tak = T_air + 273.15
    sbc = 5.670374419 * 10 ** -8  # W m-2 K-4
    emissivity = 0.937 * 10 ** -5 * (1 + 0.17 * Cl ** 2) * Tak ** 2
    q_atm = emissivity * sbc * Tak ** 4
    return q_atm


def calc_upwelling_LW(T_water):
    Twk = T_water + 273.15
    sbc = 5.670374419 * 10 ** -8  # W m-2 K-4
    emissivity = 0.97
    q_b = emissivity * sbc * Twk ** 4
    return q_b


def calc_wind_function(a, b, c, R, U):
    return R * (a + b * U ** c)


def calc_vapor_pressure(T_dewpoint):
    return 6.11 * 10 ** (7.5 * T_dewpoint / (237.3 + T_dewpoint))


def calc_latent_heat(P, T_water, ea, f_U):
    Twk = T_water + 273.15
    Lv = 2.500 * 10 ** 6 - 2.386 * 10 ** 3 * (T_water)
    rho_w = 1000
    es = 6984.505294 + Twk * (-188.903931 + Twk * (2.133357675 + Twk * (-1.28858097 * 10 ** -2 + Twk * (
            4.393587233 * 10 ** -5 + Twk * (-8.023923082 * 10 ** -8 + Twk * 6.136820929 * 10 ** -11)))))
    ql = 0.622 / P * Lv * rho_w * (es - ea) * f_U
    return ql


def calc_sensible_heat(T_air, f_U, T_water):
    Cp = 1.006 * 10 ** 3  # J/kg-K
    rho_w = 1000
    qh = Cp * rho_w * (T_air - T_water) * f_U
    return qh


def calc_fluxes(df, T_water_C, lat, lon):
    times = pd.date_range(start=df.index.min(), end=df.index.max(), freq='1h')

    elevation = get_elevation(lat, lon)

    site_name = 'general location'
    tz = df.index.tz
    ghi = get_solar(lat, lon, elevation, site_name, times, tz).ghi

    R = 0.15
    Cl = df['Sky Cover (%)'].astype(int) / 100
    q_sw = calc_solar(ghi, R, Cl)

    T_air_C = (df['Temperature (°F)'].astype(int) - 32) * (5 / 9)
    q_atm = calc_downwelling_LW(T_air_C, Cl)

    q_b = calc_upwelling_LW(T_water_C)

    a = 10 ** -6
    b = 10 ** -6
    c = 1
    R = 1

    U = df['Surface Wind (mph)'].astype(int) * 0.44704
    f_U = calc_wind_function(a, b, c, R, U)

    T_dewpoint_C = (df['Dewpoint (°F)'].astype(int) - 32) * (5 / 9)
    P = 1000
    ea = calc_vapor_pressure(T_dewpoint_C)
    q_l = calc_latent_heat(P, T_water_C, ea, f_U)

    q_h = calc_sensible_heat(T_air_C, f_U, T_water_C)

    q_net = q_sw + q_atm - q_b + q_h - q_l

    return q_sw, q_atm, q_b, q_l, q_h, q_net


def calc_cooling_rate(q_net, D):
    pw = 1000
    cpw = 4182
    cooling_rate = q_net / (pw * cpw * D) * 60  # C/min
    return cooling_rate


def build_energy_df(q_sw, q_atm, q_b, q_l, q_h):
    energy_df = pd.DataFrame(
        {
            'downwelling SW': q_sw,
            'downwelling LW': q_atm,
            'upwelling LW': -q_b,
            'sensible heat': q_h,
            'latent heat': -q_l
        }
    )
    energy_df['net flux'] = energy_df.sum(axis=1)
    return energy_df


def tz_to_gmt_offset(tz_string):
    tz_map = {
        'AKST': 'Etc/GMT+9',
        'AKDT': 'Etc/GMT+8',
        'PST': 'Etc/GMT+8',
        'PDT': 'Etc/GMT+7',
        'MST': 'Etc/GMT+7',
        'MDT': 'Etc/GMT+6',
        'CST': 'Etc/GMT+6',
        'CDT': 'Etc/GMT+5',
        'EST': 'Etc/GMT+5',
        'EDT': 'Etc/GMT+4'
    }
    if tz_string not in tz_map:
        raise ValueError(f"Unrecognized timezone abbreviation from NOAA: '{tz_string}'")
    return tz_map[tz_string]
