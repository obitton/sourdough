import { useMemo, useState } from 'react';
import type { IsoDate, OrgState } from '../engine';
import { formatMoney } from '../engine/describe';
import {
  capacitySnapshot,
  hiringScenario,
  orgStats,
  runwayMonths,
  type FinanceState,
} from '../engine/metrics';
import { FUNC_COLORS, formatLoad, formatMonths } from './meta';

interface Props {
  state: OrgState;
  finance: FinanceState;
  asOf: IsoDate;
}

const FUNC_LABELS = {
  engineering: 'Engineering',
  design: 'Design',
  gtm: 'GTM',
  operations: 'Operations',
} as const;

/** Load is the headline number, so it gets a state, not just a value. */
function loadTone(load: number): 'ok' | 'warn' | 'over' {
  if (load > 1.25) return 'over';
  if (load > 1) return 'warn';
  return 'ok';
}

const months = formatMonths;

export function MetricsPanel({ state, finance, asOf }: Props) {
  const [multiplier, setMultiplier] = useState(1);

  const capacity = useMemo(() => capacitySnapshot(state, asOf), [state, asOf]);
  const stats = useMemo(() => orgStats(state, asOf), [state, asOf]);
  const engineering = capacity.byFunc.find((f) => f.func === 'engineering')!;
  const target = Math.max(1, Math.round(engineering.headcount * multiplier));
  const scenario = useMemo(
    () => hiringScenario(state, finance, asOf, target),
    [state, finance, asOf, target],
  );
  const runway = runwayMonths(finance);

  // Runway and burn describe a going concern; after the company ends they are
  // just the last reading before the lights went out.
  const ended = state.endedAt !== null && state.endedAt <= asOf;

  return (
    <section className="metrics" aria-label="capacity and finances">
      <dl className="money">
        {!ended && (
          <div>
            <dt>runway</dt>
            <dd className={runway !== Infinity && runway < 9 ? 'danger' : ''}>
              {months(runway)}
              <span className="unit">{runway === Infinity ? '' : ' mo'}</span>
            </dd>
          </div>
        )}
        <div>
          <dt>ARR</dt>
          <dd>{formatMoney(finance.arrUsd)}</dd>
        </div>
        <div>
          <dt>in bank</dt>
          <dd>{formatMoney(Math.max(0, finance.capitalUsd))}</dd>
        </div>
        {!ended && (
          <div>
            <dt>{finance.netBurnWeeklyUsd > 0 ? 'net burn' : 'net margin'}</dt>
            <dd>
              {formatMoney(Math.abs(finance.netBurnWeeklyUsd) * 4.345)}
              <span className="unit"> /mo</span>
            </dd>
          </div>
        )}
      </dl>

      <h3 className="metrics-heading">
        Bandwidth
        <span className="metrics-note">
          {capacity.totalCapacity.toFixed(1)} of {capacity.totalHeadcount} heads
        </span>
      </h3>
      <ul className="bandwidth">
        {capacity.byFunc
          .filter((f) => f.headcount > 0 || f.demand > 0)
          .map((f) => {
            const tone = loadTone(f.load);
            return (
              <li key={f.func}>
                <span className="bw-name">
                  <span className="dot" style={{ background: FUNC_COLORS[f.func] }} aria-hidden />
                  {FUNC_LABELS[f.func]}
                </span>
                <span className="bw-track" aria-hidden>
                  {/* Fill is utilisation: a fuller bar is a busier team, and a
                      team past its capacity pins at full width in red. An
                      unstaffed function has no utilisation to show — its load
                      is infinite, which would otherwise read as "maxed out". */}
                  <span
                    className={`bw-fill tone-${tone}`}
                    style={{
                      width: f.headcount === 0 ? '0%' : `${Math.min(100, Math.max(2, f.load * 100))}%`,
                    }}
                  />
                </span>
                <span className={f.headcount === 0 ? 'bw-load muted' : `bw-load tone-${tone}`}>
                  {formatLoad(f.load, f.headcount)}
                </span>
              </li>
            );
          })}
      </ul>
      <p className="metrics-caption">
        Work waiting versus capacity available. Above 100% the team is carrying more than it can
        hold — which is what a departure does to everyone left.
      </p>

      {engineering.headcount > 0 && (
        <>
          <h3 className="metrics-heading">What if engineering were bigger?</h3>
          <input
            type="range"
            min={1}
            max={5}
            step={0.5}
            value={multiplier}
            onChange={(e) => setMultiplier(Number(e.target.value))}
            aria-label="engineering headcount multiplier"
          />
          <div className="scenario">
            <div>
              <span className="scenario-value">{target}</span>
              <span className="scenario-label">engineers</span>
            </div>
            <div>
              <span className="scenario-value">{scenario.capacity.toFixed(1)}</span>
              <span className="scenario-label">capacity</span>
            </div>
            <div>
              <span className={`scenario-value ${scenario.runwayMonths < 9 ? 'danger' : ''}`}>
                {months(scenario.runwayMonths)}
              </span>
              <span className="scenario-label">runway mo</span>
            </div>
            <div>
              <span className="scenario-value">{formatMoney(scenario.monthlyBurnUsd)}</span>
              <span className="scenario-label">burn /mo</span>
            </div>
          </div>
          <p className="metrics-caption">
            Priced at this team's own average of {scenario.capacityPerEngineer.toFixed(2)} effective
            output per engineer — ramp-up and management overhead already included.
          </p>
        </>
      )}

      {stats.largestTeam && (
        <ul className="org-stats">
          <li>
            <span>biggest team</span>
            <strong>
              {stats.largestTeam.name} · {stats.largestTeam.count}
            </strong>
          </li>
          {stats.widestSpan && (
            <li>
              <span>widest span</span>
              <strong>
                {stats.widestSpan.name} · {stats.widestSpan.reports}
              </strong>
            </li>
          )}
          <li>
            <span>median tenure</span>
            <strong>{(stats.medianTenureWeeks / 52).toFixed(1)} yrs</strong>
          </li>
          <li>
            <span>contract or part-time</span>
            <strong>{Math.round(stats.contingentShare * 100)}%</strong>
          </li>
        </ul>
      )}
    </section>
  );
}
