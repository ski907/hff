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
# Updated:      27 December 2024 -  Move plotting functions to separate file 
#                                   Modify plots to use plotly for interactive visualization
#
# -------------------------------------------------------------------------------

import numpy as np
import pandas as pd
from pvlib.location import Location

import pytz


import datetime
import streamlit as st
import requests


def get_elevation(lat, lon):
    url = f'https://api.opentopodata.org/v1/ned10m?locations={lat},{lon}'
    result = requests.get(url)
    return result.json()['results'][0]['elevation']


def get_48h_hourly_forecast(lat, lon, ahead_hour=0):
    url = rf'https://forecast.weather.gov/MapClick.php?w0=t&w1=td&w2=wc&w3=sfcwind&w3u=1&w4=sky&w5=pop&w6=rh&w7=rain&w8=thunder&w9=snow&w10=fzg&w11=sleet&w13u=0&w16u=1&w17u=1&AheadHour={ahead_hour}&Submit=Submit&FcstType=digital&textField1={lat}&textField2={lon}&site=all&unit=0&dd=&bw='

    pd_tables = pd.read_html(url)
    table1 = pd_tables[4].iloc[1:17] #20241206 NWS appears to have changed their page a bit, new index is 4 not 7
    table2 = pd_tables[4].iloc[18:35]
    # table1 = pd_tables[7].iloc[1:17]
    # table2 = pd_tables[7].iloc[18:35]
    table1.set_index(0, inplace=True)
    table2.set_index(0, inplace=True)
    df = pd.merge(table1, table2, left_index=True, right_index=True)
    df = df.T

    # generalize the hour column and extract timezone
    hours_col = df.columns[1]
    timezone = hours_col[5:].strip('()')
    gmt_tz = tz_to_gmt_offset(timezone)
    pytz_gmt_tz = pytz.timezone(gmt_tz)
    df = df.rename(columns={hours_col: "hour"})

    # make datetime index
    df.Date = df.Date.fillna(method='ffill')
    df[["month", "day"]] = df["Date"].str.split("/", expand=True).astype(int)
    # figure out if the data spans one year to the next and correct
    current_year = datetime.datetime.now(tz=pytz_gmt_tz).year
    current_month = datetime.datetime.now(tz=pytz_gmt_tz).month
    df['year'] = np.where(df['month'] >= current_month, current_year, current_year + 1)
    df['date'] = pd.to_datetime(df[['year', 'month', 'day']]) + pd.to_timedelta(df['hour'].astype(int), unit="h")
    df = df.set_index('date').drop(['Date', 'hour', 'month', 'day', 'year'], axis=1)

    df.index = df.index.tz_localize(tz=gmt_tz)
    return df


@st.cache_data
def get_full_forecast(lat, lon):
    aheadhours = [48, 96, 107]
    df = get_48h_hourly_forecast(lat, lon, 0)
    for aheadhour in aheadhours:
        df2 = get_48h_hourly_forecast(lat, lon, aheadhour)
        df = pd.concat([df, df2], axis=0)
    df = df[~df.index.duplicated(keep='first')]
    df = df.apply(pd.to_numeric, errors='coerce')
    return df


def get_solar(lat, lon, elevation, site_name, times, tz):
    site = Location(lat, lon, tz, elevation, site_name)
    cs = site.get_clearsky(times)
    return cs


def calc_solar(q0_a_t, R, Cl):
    # function to calculate solar net solar radition into water using attenuated solar if available
    # R is water reflectivity
    # Cl is cloudiness %
    q_sw = q0_a_t * (1 - R) * (1 - 0.65 * Cl ** 2)
    return q_sw


def calc_downwelling_LW(T_air, Cl):
    Tak = T_air + 273.15
    sbc = 5.670374419 * 10 ** -8  # W m-2 K-4
    # emissivity from Zhang and Johnson 2016
    # Zhang, Z. and Johnson, B.E., 2016. Aquatic nutrient simulation modules (NSMs) developed for hydrologic and hydraulic models.
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
    rho_w = 1000  # kg/m3
    # saturated vapor pressure at water temperature (mb), which is a function of water temperature from Zhang and Johnson 2016
    # Zhang, Z. and Johnson, B.E., 2016. Aquatic nutrient simulation modules (NSMs) developed for hydrologic and hydraulic models.
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
    # calc solar input
    times = pd.date_range(start=df.index.min(), end=df.index.max(), freq='1H')

    elevation = get_elevation(lat, lon)

    site_name = 'general location'
    tz = df.index.tz
    ghi = get_solar(lat, lon, elevation, site_name, times, tz).ghi

    # calculate effects of clouds on shortwave
    R = 0.15  # Maidment et al. (1996) Handbook of Hydrology
    Cl = df['Sky Cover (%)'].astype(int) / 100
    q_sw = calc_solar(ghi, R, Cl)

    # calc longwave down
    T_air_C = (df['Temperature (°F)'].astype(int) - 32) * (5 / 9)
    q_atm = calc_downwelling_LW(T_air_C, Cl)

    # calc longwave up
    q_b = calc_upwelling_LW(T_water_C)

    # calc wind function
    a = 10 ** -6
    b = 10 ** -6
    c = 1
    R = 1

    U = df['Surface Wind (mph)'].astype(int) * 0.44704
    f_U = calc_wind_function(a, b, c, R, U)

    # calc latent heat
    T_dewpoint_C = (df['Dewpoint (°F)'].astype(int) - 32) * (5 / 9)
    P = 1000  # mb don't have a forecast for this, but heat flux not that sensitive to it
    ea = calc_vapor_pressure(T_dewpoint_C)
    q_l = calc_latent_heat(P, T_water_C, ea, f_U)

    # calc sensible heat
    q_h = calc_sensible_heat(T_air_C, f_U, T_water_C)

    # calculate net heat flux
    q_net = q_sw + q_atm - q_b + q_h - q_l

    return q_sw, q_atm, q_b, q_l, q_h, q_net


def calc_cooling_rate(q_net, D):
    pw = 1000  # kg/m^3 density of water
    cpw = 4182  # J/kg-K specific heat of water
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
    # time zone mappings in pytz uses the tz database and the signs are flipped for GMT
    # https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
    # Standard times are in the db, but daylight times are not for some reason
    # NOAA reports the time in both standard and daylight so they need to be mapped to something in the tz database
    # Using US/Mountain wouldn't work I don't think because Arizona is in Standard time during Daylight time (ahh!!!)
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
    return tz_map[tz_string]
