import { useEffect, useRef } from 'react';
import { formatMonth, type IsoDate, type OrgEvent } from '../engine';
import { describe, type NameIndex } from '../engine/describe';
import { ICONS } from './meta';

interface Props {
  events: readonly OrgEvent[];
  names: NameIndex;
  asOf: IsoDate;
  playing: boolean;
  /** Date the staged scenario diverges from the baseline run, if any. */
  branchAt: IsoDate | null;
  onJump(date: IsoDate): void;
}

interface MonthGroup {
  month: string;
  firstAt: IsoDate;
  events: OrgEvent[];
}

function groupByMonth(events: readonly OrgEvent[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const event of events) {
    const month = formatMonth(event.at);
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.events.push(event);
    else groups.push({ month, firstAt: event.at, events: [event] });
  }
  return groups;
}

export function Timeline({ events, names, asOf, playing, branchAt, onJump }: Props) {
  const groups = groupByMonth(events);
  const monthRefs = useRef(new Map<string, HTMLElement>());
  // The first event the staged scenario could have touched — everything from
  // here down was re-simulated rather than carried over from the baseline.
  const branchSeq = branchAt === null ? null : (events.find((e) => e.at >= branchAt)?.seq ?? null);

  // Follow the playhead while playing; never hijack scroll while the user reads.
  const activeMonth = [...groups].reverse().find((g) => g.firstAt <= asOf)?.month;
  useEffect(() => {
    if (!playing || !activeMonth) return;
    monthRefs.current.get(activeMonth)?.scrollIntoView({ block: 'nearest' });
  }, [playing, activeMonth]);

  return (
    <section className="timeline" aria-label="event timeline">
      {groups.map((group) => (
        <section
          key={group.month}
          ref={(el) => {
            if (el) monthRefs.current.set(group.month, el);
            else monthRefs.current.delete(group.month);
          }}
        >
          <h2 className={`month ${group.firstAt > asOf ? 'future' : ''}`}>{group.month}</h2>
          <ol className="events">
            {group.events.map((event) => (
              <li key={event.seq}>
                {event.seq === branchSeq && (
                  <p className="branch-marker">⑂ scenario — re-simulated from here</p>
                )}
                <button
                  type="button"
                  className={`event ${event.at > asOf ? 'future' : ''} kind-${event.type}`}
                  onClick={() => onJump(event.at)}
                  title={`jump the org view to ${event.at}`}
                >
                  <span className="event-icon" aria-hidden>{ICONS[event.type]}</span>
                  <span className="event-text">{describe(event, names)}</span>
                  <time className="event-date" dateTime={event.at}>{event.at.slice(8)}</time>
                </button>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </section>
  );
}
