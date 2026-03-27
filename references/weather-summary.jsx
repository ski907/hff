import { useState, useEffect, useRef, useMemo } from "react";

// --- Mock 72hr NWS-style forecast data ---
function generateForecast() {
  const data = [];
  const base = new Date(2025, 0, 15, 6, 0, 0);
  let temp = 28, dew = 18, wind = 8, dir = 290, sky = 30, pop = 0;
  const sunrise = 7.5, sunset = 17.25; // hours

  for (let i = 0; i < 156; i++) {
    const t = new Date(base.getTime() + i * 3600000);
    const hr = t.getHours();
    const dayFrac = hr + t.getMinutes() / 60;
    const isDay = dayFrac >= sunrise && dayFrac < sunset;

    // Diurnal temp cycle
    const diurnalTarget = isDay
      ? 28 + 10 * Math.sin(((dayFrac - sunrise) / (sunset - sunrise)) * Math.PI)
      : 22 - 5 * Math.sin(((dayFrac - sunset) / (24 - sunset + sunrise)) * Math.PI);
    temp += (diurnalTarget - temp) * 0.15 + (Math.random() - 0.5) * 1.2;

    dew = temp - 10 - Math.random() * 4;
    wind += (Math.random() - 0.48) * 1.8;
    wind = Math.max(1, Math.min(25, wind));
    dir += (Math.random() - 0.5) * 25;
    dir = ((dir % 360) + 360) % 360;

    // Sky cover: tends to build up then clear
    const skyCycle = 40 + 35 * Math.sin((i / 156) * Math.PI * 3);
    sky += (skyCycle - sky) * 0.08 + (Math.random() - 0.5) * 8;
    sky = Math.max(0, Math.min(100, sky));

    // Precip prob: correlated with high sky cover
    pop = sky > 65 ? Math.min(90, (sky - 60) * 2 + Math.random() * 15) : Math.max(0, sky - 55 + Math.random() * 5);
    pop = Math.max(0, Math.min(100, pop));

    data.push({
      time: t,
      hour: hr,
      isDay,
      temp: Math.round(temp),
      dewpoint: Math.round(dew),
      wind: Math.round(wind * 10) / 10,
      windDir: Math.round(dir),
      sky: Math.round(sky),
      pop: Math.round(pop),
    });
  }
  return data;
}

function dirLabel(deg) {
  const d = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return d[Math.round(deg / 22.5) % 16];
}

function fmtHr(date) {
  const h = date.getHours();
  return `${h % 12 || 12}${h >= 12 ? "p" : "a"}`;
}

function fmtDate(date) {
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// --- Scales ---
function makeLinearScale(domain, range) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const m = (r1 - r0) / (d1 - d0);
  const fn = (v) => r0 + (v - d0) * m;
  fn.inv = (v) => d0 + (v - r0) / m;
  return fn;
}

// --- Main Component ---
export default function WeatherSummary() {
  const [data] = useState(generateForecast);
  const [hover, setHover] = useState(null);
  const containerRef = useRef(null);
  const [width, setWidth] = useState(920);

  useEffect(() => {
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(Math.max(500, e.contentRect.width));
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const H = 520;
  const pad = { top: 30, right: 25, bottom: 90, left: 50 };
  const plotW = width - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  // Regions: temp+dew top 60%, wind mid 15%, precip bottom 15%, sky strip 10%
  const tempH = plotH * 0.55;
  const windH = plotH * 0.17;
  const popH = plotH * 0.15;
  const skyH = plotH * 0.08;
  const gap = 6;

  const tempY0 = pad.top;
  const windY0 = tempY0 + tempH + gap * 2;
  const popY0 = windY0 + windH + gap * 2;
  const skyY0 = popY0 + popH + gap;

  // Scales
  const xScale = useMemo(() => makeLinearScale([0, data.length - 1], [pad.left, pad.left + plotW]), [data.length, plotW]);

  const tempMin = Math.floor(Math.min(...data.map(d => Math.min(d.temp, d.dewpoint))) / 5) * 5 - 2;
  const tempMax = Math.ceil(Math.max(...data.map(d => d.temp)) / 5) * 5 + 2;
  const yTemp = useMemo(() => makeLinearScale([tempMin, tempMax], [tempY0 + tempH, tempY0]), [tempMin, tempMax, tempH, tempY0]);

  const windMax = Math.ceil(Math.max(...data.map(d => d.wind)) / 5) * 5 + 2;
  const yWind = useMemo(() => makeLinearScale([0, windMax], [windY0 + windH, windY0]), [windMax, windH, windY0]);

  const yPop = useMemo(() => makeLinearScale([0, 100], [popY0 + popH, popY0]), [popH, popY0]);

  // Day/night bands
  const dayNightBands = useMemo(() => {
    const bands = [];
    let start = 0;
    let wasDay = data[0].isDay;
    for (let i = 1; i < data.length; i++) {
      if (data[i].isDay !== wasDay || i === data.length - 1) {
        bands.push({ from: start, to: i, isDay: wasDay });
        start = i;
        wasDay = data[i].isDay;
      }
    }
    return bands;
  }, [data]);

  // Day boundaries for date labels
  const dayBounds = useMemo(() => {
    const b = [0];
    for (let i = 1; i < data.length; i++) {
      if (data[i].time.getDate() !== data[i - 1].time.getDate()) b.push(i);
    }
    return b;
  }, [data]);

  // Paths
  const tempLine = data.map((d, i) => `${i === 0 ? "M" : "L"}${xScale(i).toFixed(1)},${yTemp(d.temp).toFixed(1)}`).join(" ");
  const dewLine = data.map((d, i) => `${i === 0 ? "M" : "L"}${xScale(i).toFixed(1)},${yTemp(d.dewpoint).toFixed(1)}`).join(" ");

  // Temp-dew spread fill
  const spreadPath = data.map((d, i) => `${i === 0 ? "M" : "L"}${xScale(i).toFixed(1)},${yTemp(d.temp).toFixed(1)}`).join(" ")
    + data.slice().reverse().map((d, i) => `L${xScale(data.length - 1 - i).toFixed(1)},${yTemp(d.dewpoint).toFixed(1)}`).join(" ")
    + " Z";

  // Wind line
  const windLine = data.map((d, i) => `${i === 0 ? "M" : "L"}${xScale(i).toFixed(1)},${yWind(d.wind).toFixed(1)}`).join(" ");
  const windArea = windLine + ` L${xScale(data.length - 1).toFixed(1)},${yWind(0).toFixed(1)} L${xScale(0).toFixed(1)},${yWind(0).toFixed(1)} Z`;

  // x ticks every 6 hours
  const xTicks = [];
  for (let i = 0; i < data.length; i += 6) xTicks.push(i);

  // temp y ticks
  const tempTicks = [];
  for (let v = Math.ceil(tempMin / 5) * 5; v <= tempMax; v += 5) tempTicks.push(v);

  // wind y ticks
  const windTicks = [];
  for (let v = 0; v <= windMax; v += 5) windTicks.push(v);

  const handleMouse = (e) => {
    const svg = containerRef.current?.querySelector("svg");
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const relX = mx - pad.left;
    if (relX < 0 || relX > plotW) { setHover(null); return; }
    const idx = Math.round((relX / plotW) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, idx)));
  };

  return (
    <div style={{
      background: "#0f1318",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "28px 12px",
      fontFamily: "'IBM Plex Mono', 'Fira Code', monospace",
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap');`}</style>

      <div ref={containerRef} style={{ width: "100%", maxWidth: 960 }}>
        {/* Header */}
        <div style={{ marginBottom: 16, padding: "0 4px" }}>
          <div style={{ color: "#f0883e", fontSize: 10, letterSpacing: 3, textTransform: "uppercase", fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace" }}>
            6.5-Day Outlook
          </div>
          <h2 style={{ color: "#e6edf3", margin: "4px 0 0", fontSize: 20, fontWeight: 400, fontFamily: "'IBM Plex Sans', sans-serif", letterSpacing: -0.3 }}>
            Weather Forecast Summary
          </h2>
        </div>

        <div style={{
          background: "#161b22",
          borderRadius: 10,
          border: "1px solid #30363d",
          padding: "12px 4px 4px",
          position: "relative",
          overflow: "hidden",
        }}>
          <svg
            width="100%"
            height={H}
            viewBox={`0 0 ${width} ${H}`}
            onMouseMove={handleMouse}
            onMouseLeave={() => setHover(null)}
            style={{ display: "block", cursor: "crosshair" }}
          >
            <defs>
              <linearGradient id="tGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f47067" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#f47067" stopOpacity="0.02" />
              </linearGradient>
              <linearGradient id="wGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#79c0ff" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#79c0ff" stopOpacity="0.01" />
              </linearGradient>
            </defs>

            {/* ====== DAY / NIGHT BANDS (temp region) ====== */}
            {dayNightBands.map((b, i) => (
              <rect
                key={`dn-${i}`}
                x={xScale(b.from)}
                y={tempY0}
                width={xScale(b.to) - xScale(b.from)}
                height={tempH}
                fill={b.isDay ? "#e3b34115" : "#0d111708"}
                rx={0}
              />
            ))}

            {/* ====== TEMPERATURE SECTION ====== */}
            {/* Grid */}
            {tempTicks.map(v => (
              <g key={`tt-${v}`}>
                <line x1={pad.left} x2={pad.left + plotW} y1={yTemp(v)} y2={yTemp(v)} stroke="#21262d" strokeWidth={0.7} />
                <text x={pad.left - 8} y={yTemp(v) + 3.5} textAnchor="end" fill="#484f58" fontSize={9.5} fontFamily="inherit">{v}°</text>
              </g>
            ))}
            <text
              transform={`translate(13, ${tempY0 + tempH / 2}) rotate(-90)`}
              textAnchor="middle" fill="#7d8590" fontSize={9} fontFamily="inherit" fontWeight={400}
            >°F</text>

            {/* Temp-Dew spread fill */}
            <path d={spreadPath} fill="#f4706712" />

            {/* Dewpoint line */}
            <path d={dewLine} fill="none" stroke="#8b949e" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.6} />

            {/* Temperature line */}
            <path d={tempLine} fill="none" stroke="#f47067" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

            {/* Section label */}
            <text x={pad.left + 6} y={tempY0 + 14} fill="#f47067" fontSize={9.5} fontFamily="inherit" fontWeight={500} opacity={0.8}>TEMP</text>
            <text x={pad.left + 46} y={tempY0 + 14} fill="#8b949e" fontSize={9.5} fontFamily="inherit" fontWeight={400} opacity={0.6}>DEW</text>

            {/* Freezing line */}
            {tempMin <= 32 && tempMax >= 32 && (
              <g>
                <line x1={pad.left} x2={pad.left + plotW} y1={yTemp(32)} y2={yTemp(32)} stroke="#79c0ff" strokeWidth={0.8} strokeDasharray="6,4" opacity={0.35} />
                <text x={pad.left + plotW + 4} y={yTemp(32) + 3} fill="#79c0ff" fontSize={8} opacity={0.5} fontFamily="inherit">32°</text>
              </g>
            )}

            {/* ====== WIND SECTION ====== */}
            {/* Background */}
            <rect x={pad.left} y={windY0} width={plotW} height={windH} fill="#0d111705" rx={2} />

            {/* Grid */}
            {windTicks.map(v => (
              <line key={`wt-${v}`} x1={pad.left} x2={pad.left + plotW} y1={yWind(v)} y2={yWind(v)} stroke="#21262d" strokeWidth={0.5} />
            ))}
            <text x={pad.left - 8} y={yWind(windMax) + 3.5} textAnchor="end" fill="#484f58" fontSize={9} fontFamily="inherit">{windMax}</text>
            <text x={pad.left - 8} y={yWind(0) + 3.5} textAnchor="end" fill="#484f58" fontSize={9} fontFamily="inherit">0</text>

            {/* Wind area + line */}
            <path d={windArea} fill="url(#wGrad)" />
            <path d={windLine} fill="none" stroke="#79c0ff" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />

            {/* Wind direction arrows every 6hr */}
            {data.map((d, i) => {
              if (i % 6 !== 0) return null;
              const cx = xScale(i);
              const cy = yWind(d.wind);
              const rad = ((d.windDir + 180) * Math.PI) / 180;
              const len = 8;
              const headLen = 3.5, headW = 2.5, shaftW = 0.8;
              const dx = Math.sin(rad), dy = -Math.cos(rad);
              const px = -dy, py = dx;
              const tipX = cx + dx * len * 0.5, tipY = cy + dy * len * 0.5;
              const tailX = cx - dx * len * 0.5, tailY = cy - dy * len * 0.5;
              const hbX = tipX - dx * headLen, hbY = tipY - dy * headLen;
              return (
                <g key={`wa-${i}`} opacity={0.75}>
                  <line x1={tailX} y1={tailY} x2={hbX} y2={hbY} stroke="#c9d1d9" strokeWidth={shaftW * 2} strokeLinecap="round" />
                  <polygon points={`${tipX},${tipY} ${hbX + px * headW},${hbY + py * headW} ${hbX - px * headW},${hbY - py * headW}`} fill="#c9d1d9" />
                </g>
              );
            })}

            <text x={pad.left + 6} y={windY0 + 12} fill="#79c0ff" fontSize={9.5} fontFamily="inherit" fontWeight={500} opacity={0.8}>WIND mph</text>

            {/* ====== PRECIP PROBABILITY BARS ====== */}
            <rect x={pad.left} y={popY0} width={plotW} height={popH} fill="#0d111705" rx={2} />
            {data.map((d, i) => {
              if (d.pop <= 0) return null;
              const barW = Math.max(1.5, plotW / data.length - 0.5);
              const barH = (d.pop / 100) * popH;
              const alpha = 0.25 + (d.pop / 100) * 0.55;
              return (
                <rect
                  key={`pop-${i}`}
                  x={xScale(i) - barW / 2}
                  y={popY0 + popH - barH}
                  width={barW}
                  height={barH}
                  fill={`rgba(56, 173, 169, ${alpha})`}
                  rx={0.5}
                />
              );
            })}
            <line x1={pad.left} x2={pad.left + plotW} y1={popY0 + popH} y2={popY0 + popH} stroke="#21262d" strokeWidth={0.5} />
            <text x={pad.left + 6} y={popY0 + 12} fill="#38ada9" fontSize={9.5} fontFamily="inherit" fontWeight={500} opacity={0.8}>PRECIP %</text>
            <text x={pad.left - 8} y={popY0 + 4} textAnchor="end" fill="#484f58" fontSize={8.5} fontFamily="inherit">100</text>
            <text x={pad.left - 8} y={popY0 + popH + 3} textAnchor="end" fill="#484f58" fontSize={8.5} fontFamily="inherit">0</text>

            {/* ====== SKY COVER STRIP ====== */}
            {data.map((d, i) => {
              const barW = Math.max(2, plotW / data.length);
              const grey = Math.round(255 - (d.sky / 100) * 200);
              return (
                <rect
                  key={`sky-${i}`}
                  x={xScale(i) - barW / 2}
                  y={skyY0}
                  width={barW + 0.5}
                  height={skyH}
                  fill={`rgb(${grey}, ${grey + 5}, ${grey + 12})`}
                  opacity={0.7}
                />
              );
            })}
            <rect x={pad.left} y={skyY0} width={plotW} height={skyH} fill="none" stroke="#30363d" strokeWidth={0.5} rx={2} />
            <text x={pad.left + 6} y={skyY0 + skyH + 12} fill="#7d8590" fontSize={8.5} fontFamily="inherit" fontWeight={400}>
              SKY ◻ clear → ◼ overcast
            </text>

            {/* ====== X AXIS ====== */}
            {xTicks.map(i => (
              <text key={`xt-${i}`} x={xScale(i)} y={skyY0 + skyH + 28} textAnchor="middle" fill="#484f58" fontSize={9} fontFamily="inherit">
                {fmtHr(data[i].time)}
              </text>
            ))}
            {dayBounds.map((startIdx, di) => {
              const endIdx = di < dayBounds.length - 1 ? dayBounds[di + 1] : data.length - 1;
              const midX = (xScale(startIdx) + xScale(endIdx)) / 2;
              return (
                <text key={`dl-${di}`} x={midX} y={skyY0 + skyH + 43} textAnchor="middle" fill="#8b949e" fontSize={10} fontFamily="'IBM Plex Sans', sans-serif" fontWeight={500}>
                  {fmtDate(data[startIdx].time)}
                </text>
              );
            })}

            {/* Day boundary lines */}
            {dayBounds.slice(1).map(i => (
              <line key={`db-${i}`} x1={xScale(i)} x2={xScale(i)} y1={pad.top} y2={skyY0 + skyH} stroke="#30363d" strokeWidth={0.8} strokeDasharray="3,4" />
            ))}

            {/* ====== HOVER CROSSHAIR ====== */}
            {hover !== null && (
              <g>
                <line x1={xScale(hover)} x2={xScale(hover)} y1={tempY0} y2={skyY0 + skyH} stroke="#e6edf3" strokeWidth={0.7} opacity={0.25} />
                <circle cx={xScale(hover)} cy={yTemp(data[hover].temp)} r={4} fill="#0f1318" stroke="#f47067" strokeWidth={2} />
                <circle cx={xScale(hover)} cy={yTemp(data[hover].dewpoint)} r={3} fill="#0f1318" stroke="#8b949e" strokeWidth={1.5} />
                <circle cx={xScale(hover)} cy={yWind(data[hover].wind)} r={3} fill="#0f1318" stroke="#79c0ff" strokeWidth={1.5} />
              </g>
            )}
          </svg>

          {/* ====== TOOLTIP ====== */}
          {hover !== null && (() => {
            const d = data[hover];
            const tx = xScale(hover);
            const flipLeft = tx > pad.left + plotW * 0.7;
            return (
              <div style={{
                position: "absolute",
                [flipLeft ? "right" : "left"]: flipLeft ? width - tx + 12 : tx + 12,
                top: tempY0 + 8,
                background: "#0d1117ee",
                border: "1px solid #30363d",
                borderRadius: 8,
                padding: "10px 14px",
                pointerEvents: "none",
                zIndex: 10,
                minWidth: 140,
                fontFamily: "'IBM Plex Mono', monospace",
                backdropFilter: "blur(8px)",
              }}>
                <div style={{ color: "#7d8590", fontSize: 10, marginBottom: 6 }}>
                  {d.time.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}{" "}
                  {d.time.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 10px", fontSize: 12 }}>
                  <span style={{ color: "#f47067" }}>Temp</span>
                  <span style={{ color: "#e6edf3", fontWeight: 600 }}>{d.temp}°F</span>
                  <span style={{ color: "#8b949e" }}>Dew</span>
                  <span style={{ color: "#c9d1d9" }}>{d.dewpoint}°F</span>
                  <span style={{ color: "#79c0ff" }}>Wind</span>
                  <span style={{ color: "#c9d1d9" }}>{d.wind} mph {dirLabel(d.windDir)}</span>
                  <span style={{ color: "#7d8590" }}>Sky</span>
                  <span style={{ color: "#c9d1d9" }}>{d.sky}%</span>
                  <span style={{ color: "#38ada9" }}>Precip</span>
                  <span style={{ color: "#c9d1d9" }}>{d.pop}%</span>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Legend */}
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "6px 18px",
          marginTop: 10,
          padding: "0 6px",
          alignItems: "center",
          fontFamily: "'IBM Plex Mono', monospace",
        }}>
          {[
            { color: "#f47067", label: "Temperature", type: "line" },
            { color: "#8b949e", label: "Dewpoint", type: "dash" },
            { color: "#79c0ff", label: "Wind speed", type: "line" },
            { color: "#c9d1d9", label: "Wind dir", type: "arrow" },
            { color: "#38ada9", label: "Precip prob", type: "bar" },
            { color: "#888", label: "Sky cover", type: "strip" },
          ].map(({ color, label, type }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              {type === "line" && <div style={{ width: 16, height: 2.5, background: color, borderRadius: 1 }} />}
              {type === "dash" && <div style={{ width: 16, height: 0, borderTop: `2px dashed ${color}` }} />}
              {type === "arrow" && (
                <svg width={14} height={10} viewBox="0 0 14 10">
                  <line x1="1" y1="5" x2="9" y2="5" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
                  <polygon points="13,5 9,2.5 9,7.5" fill={color} />
                </svg>
              )}
              {type === "bar" && <div style={{ width: 8, height: 10, background: color, borderRadius: 1, opacity: 0.65 }} />}
              {type === "strip" && <div style={{ width: 16, height: 6, background: `linear-gradient(to right, #f0f0f0, #333)`, borderRadius: 1 }} />}
              <span style={{ color: "#7d8590", fontSize: 10.5 }}>{label}</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: 4 }}>
            <div style={{ width: 16, height: 10, background: "#e3b34115", border: "1px solid #e3b34130", borderRadius: 1 }} />
            <span style={{ color: "#7d8590", fontSize: 10.5 }}>Daylight</span>
          </div>
        </div>
      </div>
    </div>
  );
}
