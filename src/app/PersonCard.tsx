import { useState } from 'react';
import type { Func, IsoDate, OrgState } from '../engine';
import { formatMoney } from '../engine/describe';
import {
  capacitySnapshot,
  departureImpact,
  personAnnualCost,
  personCapacityBreakdown,
  reportCountsOf,
  type FinanceState,
} from '../engine/metrics';
import { FUNC_COLORS, RUNWAY_CAP_MONTHS, formatLoad, formatMonths } from './meta';

interface Props {
  state: OrgState;
  finance: FinanceState;
  asOf: IsoDate;
  personId: string;
  onClose(): void;
  onDepart(personId: string): void;
}

/** Only the factors that actually cost something are worth showing. */
function factorRows(
  breakdown: ReturnType<typeof personCapacityBreakdown>,
  reports: number,
): Array<{ label: string; value: number }> {
  const rows: Array<{ label: string; value: number }> = [];
  if (breakdown.employment !== 1) rows.push({ label: 'employment', value: breakdown.employment });
  if (breakdown.ramp < 1) {
    rows.push({
      label: `ramping — full in ${breakdown.rampWeeksLeft} wk${breakdown.rampWeeksLeft === 1 ? '' : 's'}`,
      value: breakdown.ramp,
    });
  }
  if (breakdown.management < 1) {
    rows.push({ label: `managing ${reports} report${reports === 1 ? '' : 's'}`, value: breakdown.management });
  }
  if (breakdown.ic !== 1) rows.push({ label: 'leadership', value: breakdown.ic });
  return rows;
}

export function PersonCard({ state, finance, asOf, personId, onClose, onDepart }: Props) {
  const [showDeparture, setShowDeparture] = useState(false);

  const person = state.people[personId];
  if (!person || person.endedAt !== null) return null;

  const reports = reportCountsOf(state).get(personId) ?? 0;
  const breakdown = personCapacityBreakdown(person, asOf, reports);
  const cost = personAnnualCost(person, state);
  const team = person.teamId ? state.teams[person.teamId]?.name : null;
  const manager = person.managerId ? state.people[person.managerId]?.name : null;

  const snapshot = capacitySnapshot(state, asOf);
  const ownFunc =
    person.func === 'leadership'
      ? null
      : snapshot.byFunc.find((f) => f.func === (person.func as Func))!;
  const share = ownFunc && ownFunc.capacity > 0 ? breakdown.total / ownFunc.capacity : null;

  const impact = showDeparture ? departureImpact(state, asOf, personId, finance) : null;
  const runwayRow =
    impact &&
    !(impact.runwayMonthsBefore > RUNWAY_CAP_MONTHS && impact.runwayMonthsAfter > RUNWAY_CAP_MONTHS);

  return (
    <div className="person-card">
      <div className="whatif-head">
        <strong>{person.name}</strong>
        <button type="button" className="linkish" onClick={onClose}>
          close
        </button>
      </div>

      <p className="person-meta">
        <span className="dot" style={{ background: FUNC_COLORS[person.func] }} aria-hidden />
        {person.title}
        {team && ` · ${team}`}
        {person.employment !== 'full-time' && ` · ${person.employment}`}
      </p>

      <ul className="person-facts">
        <li>
          <span>tenure</span>
          <strong>
            {breakdown.tenureWeeks < 52
              ? `${breakdown.tenureWeeks} wks`
              : `${(breakdown.tenureWeeks / 52).toFixed(1)} yrs`}
          </strong>
        </li>
        <li>
          <span>reports to</span>
          <strong>{manager ?? '—'}</strong>
        </li>
        <li>
          <span>direct reports</span>
          <strong>{reports}</strong>
        </li>
        <li>
          <span>cost</span>
          <strong>{cost === 0 ? 'unpaid' : `${formatMoney(cost)}/yr`}</strong>
        </li>
      </ul>

      <div className="contribution">
        <div className="contribution-head">
          <span className="contribution-value">{breakdown.total.toFixed(2)}</span>
          <span className="contribution-label">
            of 1.0 effective
            {share !== null && ` · ${Math.round(share * 100)}% of ${person.func}`}
          </span>
        </div>
        {factorRows(breakdown, reports).length === 0 ? (
          <p className="metrics-caption">Fully ramped, full-time, no management overhead.</p>
        ) : (
          <>
            <ul className="factors">
              {factorRows(breakdown, reports).map((row) => (
                <li key={row.label}>
                  <span>{row.label}</span>
                  <strong>×{row.value.toFixed(2)}</strong>
                </li>
              ))}
            </ul>
            {/* The factors multiply — without this line the total reads as
                unexplained ("where does 0.35 come from?"). */}
            {factorRows(breakdown, reports).length >= 2 && (
              <p className="factors-math">
                {factorRows(breakdown, reports)
                  .map((row) => row.value.toFixed(2))
                  .join(' × ')}{' '}
                = {breakdown.total.toFixed(2)}
              </p>
            )}
          </>
        )}
      </div>

      {person.isFounder ? (
        <p className="metrics-caption">
          The founder never leaves in this model — see the known simplifications in the spec.
        </p>
      ) : (
        <>
          <button
            type="button"
            className="departure-toggle"
            aria-expanded={showDeparture}
            onClick={() => setShowDeparture(!showDeparture)}
          >
            {showDeparture ? 'Hide departure impact' : 'Model their departure'}
          </button>
          {showDeparture && (
            <button type="button" className="departure-commit" onClick={() => onDepart(personId)}>
              Let them go from {asOf} →
            </button>
          )}
        </>
      )}

      {impact && (
        <ul className="whatif-rows" role="status">
          {impact.loadBefore !== null && impact.loadAfter !== null && (
            <li>
              <span>{impact.func} load</span>
              <strong>
                {formatLoad(impact.loadBefore, impact.headcountBefore ?? 0)} →{' '}
                {formatLoad(impact.loadAfter, impact.headcountAfter ?? 0)}
              </strong>
            </li>
          )}
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
          {runwayRow && (
            <li>
              <span>runway</span>
              <strong>
                {impact.runwayMonthsAfter === Infinity
                  ? `${formatMonths(impact.runwayMonthsBefore)} mo → profitable`
                  : `${formatMonths(impact.runwayMonthsBefore)} → ${formatMonths(impact.runwayMonthsAfter)} mo`}
              </strong>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
