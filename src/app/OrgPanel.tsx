import {
  activePeople,
  addDays,
  daysBetween,
  type Func,
  type HeadcountPoint,
  type IsoDate,
  type OrgState,
  type Person,
} from '../engine';
import { type FinanceState } from '../engine/metrics';
import { FUNC_COLORS } from './meta';
import { MetricsPanel } from './MetricsPanel';
import { PersonCard } from './PersonCard';
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
  onHire(func: Func, count: number): void;
  onDepart(personId: string): void;
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
  onHire,
  onDepart,
}: Props) {
  const people = activePeople(state);
  const total = Math.max(1, daysBetween(first, last));

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

      {people.length > 0 && (
        <MetricsPanel state={state} finance={finance} asOf={asOf} onHire={onHire} />
      )}

      {whatIfId && (
        <PersonCard
          key={whatIfId}
          state={state}
          finance={finance}
          asOf={asOf}
          personId={whatIfId}
          onClose={() => onWhatIf(null)}
          onDepart={onDepart}
        />
      )}

      <div className="org-tree">
        {roots.length === 0 ? (
          <p className="muted">Nobody here yet — scrub forward.</p>
        ) : (
          <>
            <p className="metrics-caption">Click anyone to see what they contribute.</p>
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
