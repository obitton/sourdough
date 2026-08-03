/**
 * Terminal timeline viewer — the no-UI way to run the simulator:
 *
 *   npm run peek                  # the real Crouton prologue + a simulated future
 *   npm run peek -- rye-7         # a fully synthetic company from seed "rye-7"
 *   npm run peek -- rye-7 2035-01-01
 */
import { buildNameIndex, describe } from '../src/engine/describe';
import { formatMonth } from '../src/engine/dates';
import { croutonConfig, randomConfig } from '../src/engine/presets';
import { activePeople, headcount, project } from '../src/engine/project';
import { simulate } from '../src/engine/simulate';
import { validateEvents } from '../src/engine/validate';

const [seed = 'crouton', until = '2031-12-31'] = process.argv.slice(2);
const config = seed === 'crouton' ? croutonConfig(until) : randomConfig(seed, until);
const events = simulate(config);
const names = buildNameIndex(events);

let month = '';
for (const event of events) {
  const eventMonth = formatMonth(event.at);
  if (eventMonth !== month) {
    month = eventMonth;
    console.log(`\n— ${month} —`);
  }
  console.log(`  ${event.at}  ${describe(event, names)}`);
}

const final = project(events);
const problems = validateEvents(events);
console.log('\n============================================');
console.log(`seed "${config.seed}" → ${events.length} events`);
console.log(`status: ${final.status} | headcount: ${headcount(final)} | round: ${final.latestRound ?? 'bootstrapped'} | city: ${final.city}`);
console.log(`teams: ${Object.values(final.teams).map((t) => t.name).join(', ') || 'none'}`);
console.log(`active leadership: ${activePeople(final).filter((p) => p.isFounder || p.title.match(/CTO|VP|CFO|Head/)).map((p) => `${p.name} (${p.title})`).join(', ')}`);
console.log(`invariant violations: ${problems.length === 0 ? 'none' : problems.join('; ')}`);
