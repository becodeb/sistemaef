// Gráfico de línea de una sola serie. Si menos es mejor (tiempos), el eje se da vuelta: arriba siempre es mejor resultado.
import { useEffect, useRef, useState } from "react";

export type ChartPoint = { label: string; value: number; detail?: string };

function niceStep(range: number) {
  const raw = range / 4 || 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

export function LineChart({ points, fmt, invert, title, height = 240 }: { points: ChartPoint[]; fmt: (v: number) => string; invert?: boolean; title: string; height?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pad = { top: 14, right: 18, bottom: 26, left: 56 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const step = niceStep(max - min || Math.abs(max) * 0.1 || 1);
  const lo = Math.floor(min / step - 1e-9) * step;
  const hi = Math.max(Math.ceil(max / step + 1e-9) * step, lo + step);
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(t);
  const x = (i: number) => (points.length === 1 ? pad.left + w / 2 : pad.left + (w * i) / (points.length - 1));
  const y = (v: number) => {
    const ratio = (v - lo) / (hi - lo);
    return pad.top + h * (invert ? ratio : 1 - ratio);
  };
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const base = pad.top + h;
  const area = points.length > 1 ? `${line} L${x(points.length - 1).toFixed(1)} ${base} L${x(0).toFixed(1)} ${base} Z` : "";
  // Las etiquetas del eje se saltean si no entran.
  const every = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(w / 64))));

  const onMove = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    points.forEach((_, i) => {
      if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    });
    setHover(best);
  };
  const active = hover != null ? points[hover] : null;

  return (
    <div className="chart" ref={box}>
      <svg width={width} height={height} role="img" aria-label={title} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" className="chart-text">{fmt(t)}</text>
          </g>
        ))}
        {points.map((p, i) => (i % every === 0 || i === points.length - 1) && (i === points.length - 1 || points.length - 1 - i >= every) ? (
          <text key={i} x={x(i)} y={height - 8} textAnchor={points.length === 1 ? "middle" : i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} className="chart-text">{p.label}</text>
        ) : null)}
        {area && <path d={area} className="chart-area" />}
        <path d={line} className="chart-line" />
        {active && hover != null && <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={base} className="chart-cross" />}
        {points.map((p, i) => {
          const last = i === points.length - 1;
          return <circle key={i} cx={x(i)} cy={y(p.value)} r={hover === i || last ? 5.5 : 4} className={hover === i || last ? "chart-dot strong" : "chart-dot"} />;
        })}
      </svg>
      {active && hover != null && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(x(hover), 70), width - 70), top: Math.max(y(active.value) - 12, 0) }}>
          <b className="num">{fmt(active.value)}</b>
          <span>{active.label}{active.detail ? ` · ${active.detail}` : ""}</span>
        </div>
      )}
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>{points.map((p, i) => <tr key={i}><th>{p.label}</th><td>{fmt(p.value)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
