import { useState, useEffect, useRef } from "react";

const HOURS = 72;

function generateWindData() {
  const data = [];
  const baseDate = new Date(2025, 0, 15, 0, 0, 0);
  let speed = 8;
  let dir = 270;

  for (let i = 0; i < HOURS; i++) {
    const t = new Date(baseDate.getTime() + i * 3600000);
    speed += (Math.random() - 0.48) * 2.5;
    speed = Math.max(1, Math.min(28, speed));
    dir += (Math.random() - 0.5) * 30;
    if (dir < 0) dir += 360;
    if (dir >= 360) dir -= 360;

    data.push({
      time: t,
      speed: Math.round(speed * 10) / 10,
      direction: Math.round(dir),
    });
  }
  return data;
}

function dirLabel(deg) {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

function formatHour(date) {
  const h = date.getHours();
  const ampm = h >= 12 ? "p" : "a";
  const hr = h % 12 || 12;
  return `${hr}${ampm}`;
}

function formatDate(date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function WindArrowPlot() {
  const [data] = useState(generateWindData);
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);
  const [dims, setDims] = useState({ w: 800, h: 380 });

  useEffect(() => {
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = Math.max(400, e.contentRect.width);
        setDims({ w, h: 380 });
      }
    });
    if (svgRef.current?.parentElement) obs.observe(svgRef.current.parentElement);
    return () => obs.disconnect();
  }, []);

  const pad = { top: 40, right: 30, bottom: 55, left: 55 };
  const plotW = dims.w - pad.left - pad.right;
  const plotH = dims.h - pad.top - pad.bottom;

  const maxSpeed = Math.ceil(Math.max(...data.map((d) => d.speed)) / 5) * 5;
  const minSpeed = 0;

  const xScale = (i) => pad.left + (i / (data.length - 1)) * plotW;
  const yScale = (v) => pad.top + plotH - ((v - minSpeed) / (maxSpeed - minSpeed)) * plotH;

  // Build the line path
  const linePath = data
    .map((d, i) => `${i === 0 ? "M" : "L"}${xScale(i).toFixed(1)},${yScale(d.speed).toFixed(1)}`)
    .join(" ");

  // Area fill path
  const areaPath = linePath + ` L${xScale(data.length - 1).toFixed(1)},${yScale(0).toFixed(1)} L${xScale(0).toFixed(1)},${yScale(0).toFixed(1)} Z`;

  // Arrow placement every 4 hours
  const arrowInterval = 4;
  const arrowSize = 13;

  // Y-axis ticks
  const yTicks = [];
  for (let v = minSpeed; v <= maxSpeed; v += 5) yTicks.push(v);

  // X-axis ticks — every 12 hours
  const xTicks = [];
  for (let i = 0; i < data.length; i += 12) xTicks.push(i);

  // Day boundaries
  const dayBounds = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i].time.getDate() !== data[i - 1].time.getDate()) dayBounds.push(i);
  }

  const handleMouseMove = (e) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const relX = mx - pad.left;
    if (relX < 0 || relX > plotW) { setHover(null); return; }
    const idx = Math.round((relX / plotW) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, idx)));
  };

  return (
    <div
      style={{
        background: "#0c1117",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 16px",
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600&display=swap');
      `}</style>

      <div style={{ width: "100%", maxWidth: 900 }}>
        <div style={{ marginBottom: 20, padding: "0 8px" }}>
          <div style={{ color: "#7ee787", fontSize: 11, letterSpacing: 3, textTransform: "uppercase", marginBottom: 6, fontWeight: 500 }}>
            Forecast
          </div>
          <h2 style={{ color: "#e6edf3", margin: 0, fontSize: 22, fontWeight: 300, letterSpacing: -0.5 }}>
            Wind Speed & Direction
          </h2>
          <p style={{ color: "#7d8590", margin: "4px 0 0", fontSize: 12, fontWeight: 300 }}>
            72-hour forecast — arrows show wind direction (where wind is blowing <em>from</em>)
          </p>
        </div>

        <div
          style={{
            background: "#161b22",
            borderRadius: 12,
            border: "1px solid #30363d",
            padding: "16px 8px 8px",
            position: "relative",
          }}
        >
          <svg
            ref={svgRef}
            width="100%"
            height={dims.h}
            viewBox={`0 0 ${dims.w} ${dims.h}`}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHover(null)}
            style={{ display: "block", cursor: "crosshair" }}
          >
            <defs>
              <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7ee787" />
                <stop offset="100%" stopColor="#238636" />
              </linearGradient>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7ee787" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#7ee787" stopOpacity="0.01" />
              </linearGradient>
            </defs>

            {/* Grid lines */}
            {yTicks.map((v) => (
              <g key={`yt-${v}`}>
                <line
                  x1={pad.left} x2={pad.left + plotW}
                  y1={yScale(v)} y2={yScale(v)}
                  stroke="#21262d" strokeWidth={1}
                />
                <text
                  x={pad.left - 10} y={yScale(v) + 4}
                  textAnchor="end" fill="#484f58" fontSize={11}
                  fontFamily="inherit"
                >
                  {v}
                </text>
              </g>
            ))}

            {/* Y axis label */}
            <text
              transform={`translate(14, ${pad.top + plotH / 2}) rotate(-90)`}
              textAnchor="middle" fill="#7d8590" fontSize={11}
              fontFamily="inherit" fontWeight={300}
            >
              mph
            </text>

            {/* Day boundary lines */}
            {dayBounds.map((i) => (
              <line
                key={`db-${i}`}
                x1={xScale(i)} x2={xScale(i)}
                y1={pad.top} y2={pad.top + plotH}
                stroke="#30363d" strokeWidth={1} strokeDasharray="4,4"
              />
            ))}

            {/* X axis labels */}
            {xTicks.map((i) => (
              <text
                key={`xt-${i}`}
                x={xScale(i)} y={pad.top + plotH + 18}
                textAnchor="middle" fill="#484f58" fontSize={10}
                fontFamily="inherit"
              >
                {formatHour(data[i].time)}
              </text>
            ))}

            {/* Date labels */}
            {[0, ...dayBounds].map((startIdx, di) => {
              const endIdx = di < dayBounds.length ? dayBounds[di] : data.length - 1;
              const midX = (xScale(startIdx) + xScale(endIdx)) / 2;
              return (
                <text
                  key={`dl-${di}`}
                  x={midX} y={pad.top + plotH + 38}
                  textAnchor="middle" fill="#7d8590" fontSize={11}
                  fontFamily="inherit" fontWeight={400}
                >
                  {formatDate(data[startIdx].time)}
                </text>
              );
            })}

            {/* Area fill */}
            <path d={areaPath} fill="url(#areaGrad)" />

            {/* Line */}
            <path d={linePath} fill="none" stroke="url(#lineGrad)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

            {/* Direction arrows every N hours */}
            {data.map((d, i) => {
              if (i % arrowInterval !== 0) return null;
              const cx = xScale(i);
              const cy = yScale(d.speed);
              // Arrow points in direction wind is blowing TO
              // Meteorological convention: direction is where wind comes FROM
              const rad = ((d.direction + 180) * Math.PI) / 180;
              const len = arrowSize * 1.4;
              const headLen = 5;
              const headW = 3.5;
              const shaftW = 1.2;

              // Tip and tail of the arrow
              const tipX = cx + Math.sin(rad) * len * 0.5;
              const tipY = cy - Math.cos(rad) * len * 0.5;
              const tailX = cx - Math.sin(rad) * len * 0.5;
              const tailY = cy + Math.cos(rad) * len * 0.5;

              // Direction unit vectors
              const dx = Math.sin(rad);
              const dy = -Math.cos(rad);
              // Perpendicular
              const px = -dy;
              const py = dx;

              // Arrowhead base point (where head meets shaft)
              const hbX = tipX - dx * headLen;
              const hbY = tipY - dy * headLen;

              // Shaft: rectangle from tail to arrowhead base
              const s1x = tailX + px * shaftW;
              const s1y = tailY + py * shaftW;
              const s2x = hbX + px * shaftW;
              const s2y = hbY + py * shaftW;
              const s3x = hbX - px * shaftW;
              const s3y = hbY - py * shaftW;
              const s4x = tailX - px * shaftW;
              const s4y = tailY - py * shaftW;

              // Arrowhead: triangle
              const h1x = hbX + px * headW;
              const h1y = hbY + py * headW;
              const h2x = hbX - px * headW;
              const h2y = hbY - py * headW;

              return (
                <g key={`arr-${i}`} opacity={0.9}>
                  <polygon
                    points={`${s1x},${s1y} ${s2x},${s2y} ${s3x},${s3y} ${s4x},${s4y}`}
                    fill="#e6edf3"
                  />
                  <polygon
                    points={`${tipX},${tipY} ${h1x},${h1y} ${h2x},${h2y}`}
                    fill="#e6edf3"
                  />
                </g>
              );
            })}

            {/* Hover crosshair & tooltip */}
            {hover !== null && (
              <g>
                <line
                  x1={xScale(hover)} x2={xScale(hover)}
                  y1={pad.top} y2={pad.top + plotH}
                  stroke="#7ee787" strokeWidth={1} opacity={0.4}
                />
                <circle
                  cx={xScale(hover)} cy={yScale(data[hover].speed)}
                  r={5} fill="#0c1117" stroke="#7ee787" strokeWidth={2}
                />
              </g>
            )}
          </svg>

          {/* Tooltip card */}
          {hover !== null && (
            <div
              style={{
                position: "absolute",
                left: Math.min(xScale(hover) + 16, dims.w - 160),
                top: Math.max(yScale(data[hover].speed) - 20, 8),
                background: "#0d1117",
                border: "1px solid #30363d",
                borderRadius: 8,
                padding: "8px 12px",
                pointerEvents: "none",
                zIndex: 10,
              }}
            >
              <div style={{ color: "#7d8590", fontSize: 10, marginBottom: 4 }}>
                {data[hover].time.toLocaleDateString("en-US", { month: "short", day: "numeric" })}{" "}
                {data[hover].time.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </div>
              <div style={{ color: "#7ee787", fontSize: 16, fontWeight: 600 }}>
                {data[hover].speed} mph
              </div>
              <div style={{ color: "#e6edf3", fontSize: 12, marginTop: 2 }}>
                {dirLabel(data[hover].direction)} ({data[hover].direction}°)
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 20, marginTop: 12, padding: "0 8px", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 20, height: 2, background: "#7ee787", borderRadius: 1 }} />
            <span style={{ color: "#7d8590", fontSize: 11 }}>Wind speed</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width={18} height={14} viewBox="0 0 18 14">
              <rect x="2" y="5.5" width="9" height="3" rx="0.5" fill="#e6edf3" opacity={0.9} />
              <polygon points="16,7 11,3 11,11" fill="#e6edf3" opacity={0.9} />
            </svg>
            <span style={{ color: "#7d8590", fontSize: 11 }}>Direction (from)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
