import {
  activePeople,
  addDays,
  daysBetween,
  type HeadcountPoint,
  type IsoDate,
  type OrgState,
  type Person,
} from '../engine';
import { formatMoney } from '../engine/describe';
import { departureImpact, type FinanceState } from '../engine/metrics';
import { FUNC_COLORS, formatMonths } from './meta';
import { MetricsPanel } from './MetricsPanel';
import { Sparkline } from './Sparkline';

interface Props {
  state: OrgState;
  series: HeadcountPoint[];
  finance: FinanceState;
  asOf: IsoDate;
  first: IsoDate;
  last: IsoDate;
  today: IsoDate;
  whatIfId: string | null;
  onScrub(date: IsoDate): void;
  onWhatIf(personId: string | null): void;
}

const ROUND_LABELS: Record<string, string> = {
  'pre-seed': 'Pre-seed',
  seed: 'Seed',
  'series-a': 'Series A',
  'series-b': 'Series B',
};

export function OrgPanel({
  state,
  series,
  finance,
  asOf,
  first,
  last,
  today,
  whatIfId,
  onScrub,
  onWhatIf,
}: Props) {
  const people = activePeople(state);
  const total = Math.max(1, daysBetween(first, last));
  const impact = whatIfId ? departureImpact(state, asOf, whatIfId, finance) : null;

  const byManager = new Map<string, Person[]>();
  for (const person of people) {
    if (person.managerId === null) continue;
    const list = byManager.get(person.managerId) ?? [];
    list.push(person);
    byManager.set(person.managerId, list);
  }
  for (const list of byManager.values()) list.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const roots = people.filter((p) => p.isFounder);

  const teamCounts = Object.values(state.teams)
    .map((team) => ({ team, count: people.filter((p) => p.teamId === team.id).length }))
    .filter(({ count }) => count > 0);

  const ended = state.endedAt !== null && state.endedAt <= asOf;

  return (
    <aside className="org-panel" aria-label="organization as of selected date">
      <div className="asof-row">
        <label htmlFor="scrubber">
          org as of <strong>{asOf}</strong>
        </label>
        {today >= first && today <= last && asOf !== today && (
          <button type="button" className="linkish" onClick={() => onScrub(today)}>
            jump to today
          </button>
        )}
      </div>
      <input
        id="scrubber"
        type="range"
        min={0}
        max={total}
        value={daysBetween(first, asOf)}
        onChange={(e) => onScrub(addDays(first, Number(e.target.value)))}
      />
      <Sparkline series={series} first={first} last={last} asOf={asOf} today={today} onScrub={onScrub} />

      <div className="stats">
        <div className="stat-hero">
          <span className="stat-number">{people.length}</span>
          <span className="stat-label">{people.length === 1 ? 'person' : 'people'}</span>
        </div>
        <dl className="stat-facts">
          <div><dt>stage</dt><dd>{state.latestRound ? ROUND_LABELS[state.latestRound] : 'Bootstrapped'}</dd></div>
          <div><dt>office</dt><dd>{state.city ?? '—'}</dd></div>
          <div><dt>status</dt><dd>{ended ? state.status : 'operating'}</dd></div>
        </dl>
      </div>

      {ended && state.status === 'shut-down' && (
        <p className="banner banner-end">🕯️ Shut down on {state.endedAt}. The log above is its complete history.</p>
      )}
      {ended && state.status === 'acquired' && (
        <p className="banner banner-exit">🎉 Acquired on {state.endedAt} — the team carries on under new ownership.</p>
      )}

      {teamCounts.length > 0 && (
        <ul className="team-chips">
          {teamCounts.map(({ team, count }) => (
            <li key={team.id}>
              <span className="dot" style={{ background: FUNC_COLORS[team.func] }} aria-hidden />
              {team.name} · {count}
            </li>
          ))}
        </ul>
      )}

      {people.length > 0 && <MetricsPanel state={state} finance={finance} asOf={asOf} />}

      {impact && (
        <div className="whatif" role="status">
          <div className="whatif-head">
            <strong>If {impact.name} left today</strong>
            <button type="button" className="linkish" onClick={() => onWhatIf(null)}>
              clear
            </button>
          </div>
          <ul>
            <li>
              <span>{impact.func === 'leadership' ? 'company' : impact.func} load</span>
              <strong>
                {Math.round(impact.loadBefore * 100)}% → {Math.round(impact.loadAfter * 100)}%
              </strong>
            </li>
            <li>
              <span>capacity lost</span>
              <strong>{impact.capacityLost.toFixed(2)} people</strong>
            </li>
            {impact.reportsMoved > 0 && (
              <li>
                <span>reports reassigned</span>
                <strong>
                  {impact.reportsMoved} → {impact.newManagerName ?? 'nobody'}
                </strong>
              </li>
            )}
            <li>
              <span>payroll saved</span>
              <strong>{formatMoney(impact.monthlySavingUsd)}/mo</strong>
            </li>
            <li>
              <span>runway</span>
              <strong>
                {formatMonths(impact.runwayMonthsBefore)} → {formatMonths(impact.runwayMonthsAfter)} mo
              </strong>
            </li>
          </ul>
        </div>
      )}

      <div className="org-tree">
        {roots.length === 0 ? (
          <p className="muted">Nobody here yet — scrub forward.</p>
        ) : (
          <>
            <p className="metrics-caption">Click anyone to model their departure.</p>
            <ul>
              {roots.map((person) => (
                <TreeNode
                  key={person.id}
                  person={person}
                  byManager={byManager}
                  whatIfId={whatIfId}
                  onWhatIf={onWhatIf}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
}

function TreeNode({
  person,
  byManager,
  whatIfId,
  onWhatIf,
}: {
  person: Person;
  byManager: Map<string, Person[]>;
  whatIfId: string | null;
  onWhatIf(personId: string | null): void;
}) {
  const reports = byManager.get(person.id) ?? [];
  const selected = whatIfId === person.id;
  return (
    <li>
      <button
        type="button"
        className={`node ${selected ? 'node-selected' : ''}`}
        aria-pressed={selected}
        onClick={() => onWhatIf(selected ? null : person.id)}
      >
        <span className="dot" style={{ background: FUNC_COLORS[person.func] }} aria-hidden />
        <span className="node-name">{person.name}</span>
        <span className="node-title">{person.title}</span>
        {person.employment !== 'full-time' && <span className="badge">{person.employment}</span>}
        {reports.length > 0 && <span className="badge badge-count">{reports.length} ↓</span>}
      </button>
      {reports.length > 0 && (
        <ul>
          {reports.map((report) => (
            <TreeNode
              key={report.id}
              person={report}
              byManager={byManager}
              whatIfId={whatIfId}
              onWhatIf={onWhatIf}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
