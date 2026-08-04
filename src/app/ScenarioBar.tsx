import type { Func, Intervention, IsoDate, OrgState } from '../engine';
import { FUNC_COLORS } from './meta';

interface Props {
  scenario: Intervention[];
  state: OrgState;
  asOf: IsoDate;
  onClear(): void;
  onRemove(index: number): void;
}

const FUNC_LABELS: Record<Func, string> = {
  engineering: 'engineering',
  design: 'design',
  gtm: 'GTM',
  operations: 'operations',
};

function label(plan: Intervention, state: OrgState): string {
  if (plan.kind === 'hire') {
    return `+${plan.count} ${FUNC_LABELS[plan.func]}`;
  }
  return `− ${state.people[plan.personId]?.name ?? plan.personId}`;
}

/**
 * Staged decisions, not a preview. Each one is replayed into the simulation at
 * its date, so what the timeline shows below the branch is the model's actual
 * answer — hiring changes burn, burn changes runway, runway changes who gets
 * hired next.
 */
export function ScenarioBar({ scenario, state, asOf, onClear, onRemove }: Props) {
  if (scenario.length === 0) return null;

  return (
    <div className="scenario-bar">
      <span className="scenario-title">⑂ scenario from {asOf}</span>
      <ul>
        {scenario.map((plan, index) => (
          <li key={`${plan.at}-${index}`}>
            {plan.kind === 'hire' && (
              <span className="dot" style={{ background: FUNC_COLORS[plan.func] }} aria-hidden />
            )}
            {label(plan, state)}
            <button
              type="button"
              onClick={() => onRemove(index)}
              aria-label={`remove ${label(plan, state)}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="linkish" onClick={onClear}>
        reset to baseline
      </button>
    </div>
  );
}
