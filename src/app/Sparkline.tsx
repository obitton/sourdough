import { useId } from 'react';
import { addDays, daysBetween, type HeadcountPoint, type IsoDate } from '../engine';

interface Props {
  series: HeadcountPoint[];
  first: IsoDate;
  last: IsoDate;
  asOf: IsoDate;
  today: IsoDate;
  onScrub(date: IsoDate): void;
}

const W = 600;
const H = 90;
const TOP = 8;
const BASE = H - 6;

/**
 * Headcount over the company's whole life as a step area. The part up to the
 * scrubber date renders bright, the not-yet-visited part dim; dragging on the
 * chart scrubs time directly.
 */
export function Sparkline({ series, first, last, asOf, today, onScrub }: Props) {
  const clipId = useId();
  const total = Math.max(1, daysBetween(first, last));
  const max = Math.max(1, ...series.map((p) => p.count));

  const x = (at: IsoDate) => (daysBetween(first, at) / total) * W;
  const y = (count: number) => BASE - (count / max) * (BASE - TOP);

  let line = '';
  for (const [i, point] of series.entries()) {
    line += i === 0 ? `M ${x(point.at)} ${y(point.count)}` : ` H ${x(point.at)} V ${y(point.count)}`;
  }
  line += ` H ${W}`;
  const area = `${line} V ${BASE} H ${x(series[0].at)} Z`;

  const cutX = x(asOf < first ? first : asOf > last ? last : asOf);
  const currentCount = [...series].reverse().find((p) => p.at <= asOf)?.count ?? 0;

  const scrubFromPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    onScrub(addDays(first, Math.round(fraction * total)));
  };

  return (
    <div className="sparkline">
      <span className="sparkline-peak">peak {max}</span>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`headcount over time, ${currentCount} as of ${asOf}, peak ${max}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          scrubFromPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons > 0) scrubFromPointer(e);
        }}
      >
        <clipPath id={clipId}>
          <rect x={0} y={0} width={cutX} height={H} />
        </clipPath>

        <path className="spark-area-future" d={area} />
        <path className="spark-line-future" d={line} />
        <g clipPath={`url(#${clipId})`}>
          <path className="spark-area" d={area} />
          <path className="spark-line" d={line} />
        </g>

        {today >= first && today <= last && (
          <line className="spark-today" x1={x(today)} y1={TOP} x2={x(today)} y2={BASE} />
        )}
        <line className="spark-cursor" x1={cutX} y1={TOP} x2={cutX} y2={BASE} />
        <circle className="spark-dot" cx={cutX} cy={y(currentCount)} r={3.5} />
      </svg>
    </div>
  );
}
