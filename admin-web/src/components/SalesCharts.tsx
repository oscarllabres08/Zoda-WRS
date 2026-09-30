import { useEffect, useRef } from 'react';



import { money } from '../lib/format';

import type { TimelinePoint } from '../lib/salesReportData';

import { SALES_CATEGORY_LABELS, type SalesCategoryKey } from '../lib/productCategory';



const DEFAULT_SLOT_WIDTH = 44;



export function SalesLineChart({

  points,

  slotWidth = DEFAULT_SLOT_WIDTH,

}: {

  points: TimelinePoint[];

  slotWidth?: number;

}) {

  const scrollRef = useRef<HTMLDivElement>(null);

  const h = 220;

  const pad = { l: 48, r: 16, t: 16, b: 36 };

  const innerH = h - pad.t - pad.b;

  const n = Math.max(1, points.length);

  const plotW = n * slotWidth;

  const w = pad.l + plotW + pad.r;

  const maxY = Math.max(1, ...points.map((p) => Math.max(p.total, p.online, p.walkIn)));



  const toX = (i: number) => pad.l + (i + 0.5) * slotWidth;

  const toY = (v: number) => pad.t + innerH - (v / maxY) * innerH;



  const line = (key: 'online' | 'walkIn' | 'total') => {

    if (points.length === 0) return '';

    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(p[key]).toFixed(1)}`).join(' ');

  };



  const yTicks = 4;

  const yLines = Array.from({ length: yTicks + 1 }, (_, i) => {

    const v = (maxY / yTicks) * i;

    return { v, y: toY(v) };

  });



  useEffect(() => {

    const el = scrollRef.current;

    if (!el || points.length === 0) return;

    let peakIdx = 0;

    for (let i = 1; i < points.length; i++) {

      if (points[i].total > points[peakIdx].total) peakIdx = i;

    }

    if (points[peakIdx].total <= 0) return;

    const x = pad.l + (peakIdx + 0.5) * slotWidth;

    el.scrollLeft = Math.max(0, x - el.clientWidth / 2);

  }, [points, slotWidth]);



  if (points.length === 0) {

    return <p className="muted-block">No chart data for this period.</p>;

  }



  return (

    <div className="sales-line-chart-wrap">

      <div

        ref={scrollRef}

        className="sales-line-chart-scroll"

        tabIndex={0}

        role="region"

        aria-label="Sales timeline (scroll horizontally)"

      >

        <svg

          className="sales-chart-svg sales-chart-svg--scroll"

          viewBox={`0 0 ${w} ${h}`}

          width={w}

          height={h}

          preserveAspectRatio="xMinYMin meet"

          role="img"

          aria-label="Sales overview line chart"

        >

          {yLines.map((t) => (

            <g key={t.v}>

              <line x1={pad.l} y1={t.y} x2={w - pad.r} y2={t.y} stroke="rgba(18,101,214,0.12)" />

              <text x={pad.l - 8} y={t.y + 4} textAnchor="end" className="sales-chart-axis">

                {t.v >= 1000 ? `${Math.round(t.v / 1000)}k` : Math.round(t.v)}

              </text>

            </g>

          ))}

          <path d={line('total')} fill="none" stroke="#1265d6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          <path d={line('online')} fill="none" stroke="#3ab1ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 3" />

          <path d={line('walkIn')} fill="none" stroke="#2ecc71" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 3" />

          {points.map((p, i) => {

            if (p.total <= 0) return null;

            return (

              <g key={`pt-${p.key}`}>

                <circle cx={toX(i)} cy={toY(p.total)} r={4.5} fill="#1265d6" stroke="#fff" strokeWidth="1.5" />

              </g>

            );

          })}

          {points.map((p, i) => (

            <text key={p.key} x={toX(i)} y={h - 10} textAnchor="middle" className="sales-chart-axis">

              {p.label}

            </text>

          ))}

        </svg>

      </div>

    </div>

  );

}



export function SalesDonutChart({

  online,

  walkIn,

  total,

}: {

  online: number;

  walkIn: number;

  total: number;

}) {

  const sum = online + walkIn || 1;

  const onlinePct = (online / sum) * 100;



  return (

    <div className="sales-donut-wrap">

      <div

        className="sales-donut"

        style={{

          background: `conic-gradient(#1265d6 0 ${onlinePct}%, #2ecc71 ${onlinePct}% 100%)`,

        }}

      >

        <div className="sales-donut-hole">

          <span className="sales-donut-label">Total Sales</span>

          <strong>{money(total)}</strong>

        </div>

      </div>

      <ul className="sales-donut-legend">

        <li>

          <span className="dot online" /> Online Sales ({onlinePct.toFixed(0)}%)

        </li>

        <li>

          <span className="dot walk" /> Walk-in Sales ({(100 - onlinePct).toFixed(0)}%)

        </li>

      </ul>

    </div>

  );

}



export function CategoryBarChart({ totals }: { totals: Record<SalesCategoryKey, number> }) {

  const keys: SalesCategoryKey[] = ['water', 'containers', 'others', 'accessories'];

  const max = Math.max(1, ...keys.map((k) => totals[k]));



  return (

    <div className="sales-category-bars">

      {keys.map((k) => (

        <div key={k} className="sales-category-bar-row">

          <span className="sales-category-bar-label">{SALES_CATEGORY_LABELS[k]}</span>

          <div className="sales-category-bar-track">

            <div className="sales-category-bar-fill" style={{ width: `${(totals[k] / max) * 100}%` }} />

          </div>

          <span className="sales-category-bar-value">{money(totals[k])}</span>

        </div>

      ))}

    </div>

  );

}

