# Org Realism Benchmarks for the Organization Simulator

Research compiled 2026-08-03. Primary sources: Carta (Peter Walker / Kevin Dowd data posts), SaaStr (Jason Lemkin), First Round Review, BLS-derived stats, layoff trackers (Layoffs.fyi via TechCrunch/Crunchbase), and recruiting/HR benchmark publishers. Where sources disagree, a range is given plus a recommended value. All figures are US-centric, VC-backed-software-centric — which is the right reference class for a synthetic startup sim.

---

## TL;DR

- Teams are smaller than folklore suggests: median seed company has ~4–6 employees, Series A ~15–17, Series B ~40–50, Series C ~85–130. Rounds are ~20–28 months apart (post-2022; it was ~12–14 months in 2021).
- Engineering is ~40–50% of early headcount, peaking at 35–45% at Series B, then diluting as GTM scales. First sales hire ~$1–2M ARR, first designer within the first ~10 hires, first recruiter/HR at ~40–50 employees.
- Executives arrive in a strict sequence (CTO is a founder at day 0; VP Sales ~Series A; VP Eng ~Series B; CFO ~Series B/C; COO ~Series C or never) and there is exactly ONE of each at a time — a new one implies the old one left.
- Annual voluntary attrition at startups: ~15–20% (Carta median 17.5%); median tenure just 2.0–2.2 years; hazard spikes at the 12-month equity cliff and stays high through month 24. ~25–40% of founding teams lose a co-founder within 4–8 years.
- Layoffs cut 10–30% (median ~15%); companies that lay off once usually do it again — ~70% of repeat layoffs come within 12 months.
- Only ~15–30% of seed companies reach Series A within 2 years (~45–50% eventually); ~50% of startups are dead by year 5; shutdown typically comes 2–3 years after the last raise, often after 1–2 layoff rounds.
- Span of control 5–8; first engineering manager appears at ~6–8 engineers; median time-to-promotion ~24–30 months; early teams lean heavily on contractors/fractional roles.

---

## 1. Headcount by stage and time between rounds

**Headcount (US, Carta data, 2024–2025):**

| Stage | Median/typical | Range (reasonable sim bounds) | Notes |
|---|---|---|---|
| Pre-seed | 2–4 total | 1–5 | Mostly just founders (+0–2 helpers); 35% of new startups are solo-founded, but only ~17% of VC-funded ones |
| Seed | ~4 employees (excl. founders); avg 6.2 | 3–15 | Down from avg 10.3 in 2021 — AI-era compression |
| Series A | ~15–17 (avg 16.8) | 10–30 | Down from 25.9 in 2021 |
| Series B | ~48 (avg 48.2) | 40–80 | Down from 72.3 in 2022 |
| Series C | ~86 (median 86.5, 2024) | 80–150 | Down from 131.7 in 2022 — a 34.5% compression |

Median time from incorporation to **first hire**: 284 days (2024, up from 214 in 2019).

**Time between rounds (Carta, Q4 2024 / 2025):**

| Interval | Median | Spread | Notes |
|---|---|---|---|
| Seed → A | 616–774 days (~20–25 mo; "2.1 years") | 25th pct ~13 mo, 75th pct ~37–41 mo | Was ~420 days (~14 mo) in Q4 2021. 39% of Q3 2025 Series A raisers took 3+ years. AI startups slightly faster (~1.9 yrs) |
| A → B | ~712–732 days (~23–24 mo) | wide; SaaS ~26% shorter, fintech 919 days | 97% longer than Q4 2021 |
| B → C | ~805–856 days (~26–28 mo) | — | Up 31% vs. two years prior |

**Recommendation:** stage-up delay of 18–30 months (median ~24), drawn from a right-skewed distribution (lognormal works well: some companies sprint in 12 months, a long tail takes 3–4 years).

## 2. Functional mix over time

- **Seed (first ~10 hires):** engineering-dominant. Typical: 3–5 engineers (~40–50%), 1 product-minded builder, 1 founding designer, 1 first commercial/GTM hire, 1 CS/support, 1 ops/finance generalist (Initialized, CRV, Amplify Partners guidance). Engineering mix is backend/infra-heavy with 1–2 product/frontend engineers.
- **Series B:** engineering peaks at **35–45% of headcount** — the highest share of any stage.
- **Series C:** engineering falls to **25–35%** as sales/CS/marketing scale.
- **At ~$10M ARR / ~100 employees** (SaaStr's canonical "first 100 hires"): ~40 sales+sales ops, ~20 customer success, 4–8 marketing, 5–6 support, ~40 product & engineering (20–25 devs, 6–7 DevOps, 4–5 QA, 4 product, 2 designers). i.e. GTM overtakes R&D somewhere between Series B and C.
- **First designer:** within the first 5–10 hires for product-led companies (a "founding designer"); nearly always present by Series A.
- **First sales hire:** at ~$1–2M ARR or when founder-led sales saturates — Figma's first sales hire came at $2M ARR (First Round Review). Roughly late seed / Series A.
- **First recruiter / HR person:** ~40–50 employees (late Series A / Series B), often fractional before that. Trigger: planning 15–20 hires/year.

## 3. Executive sequencing (and the "exactly one" rule)

Observed sequence (SaaStr ARR benchmarks; map ARR→stage roughly as A≈$1–5M, B≈$5–20M, C≈$20M+):

| Role | Typical arrival | Trigger |
|---|---|---|
| CEO, CTO | Day 0 | Founders. CTO is a co-founder in the vast majority of funded startups |
| First non-founder exec | Series A, 30–50 employees | Usually a GTM leader for technical founders (or vice versa) |
| VP Sales / Head of Sales | ~$1M ARR (Series A) | Seed wants "senior doers, not executives" |
| VP Engineering | ~$5–6M ARR (Series B), eng team ~15–30 | CTO stays on architecture/vision; VP Eng runs delivery |
| Controller / part-time finance | ~$2M ARR | Often fractional |
| CFO | ~$10–20M ARR (Series B/C) | Before that, a controller + outsourced accounting |
| COO | ~$20M ARR (Series C) | Many startups never hire one |
| CMO / other CXOs | ~$15–20M ARR | Late B / C |

**Uniqueness rule (the "seven CTOs" bug):** these are singleton roles. At any time a company has 0 or 1 CTO, 0 or 1 CFO, 0 or 1 COO, 0 or 1 VP Eng, 0 or 1 Head of Sales. A new hire into the role must be preceded by the incumbent's departure or retitling (e.g., CTO → "Chief Architect", VP Sales → replaced; exec churn IS realistic — roughly half of first VP Sales hires fail within ~18 months per SaaStr lore — but they are replaced, not accumulated). CTO and VP Eng legitimately coexist; two CTOs never do.

## 4. Attrition

- **Annual voluntary turnover:** Carta median for startup employees with equity was **17.5%** (Q2 2023–Q1 2024). Tech industry averages 13–21%; overall US voluntary ~13%. Recommended sim value: 15–18%/yr voluntary + 3–6%/yr involuntary (performance terminations, not layoffs).
- **Tenure curve (Carta, 185k employees):** median startup tenure **2.0–2.2 years** (vs. 4.1–4.2 economy-wide). 25% probability an employee is gone by month 15; 50% gone by month 37. Hazard is low in months 0–11, **jumps discontinuously at month 12** (the 1-year vesting cliff), stays elevated through year 2, then declines. Voluntary exceeds involuntary at every tenure: cumulative by year 4, 44.4% voluntary vs. 12.3% involuntary.
- **Regretted vs. non-regretted:** regretted departures are typically **15–35% of voluntary exits** (tech-heavy firms 10–25%; 1–3% of total headcount/yr). Recommend ~25% of quits flagged "regretted".
- **Founder breakups (Carta):** ~**24% of founding teams lose a co-founder by year 4**; ~30% by year 5; ~40% by year 8. Other data: 35% of funded founding teams see a founder leave, mostly within the first two years. (Wasserman's famous "65% of startups fail due to team conflict" is about failure causes, not departure rates.)

## 5. Layoffs (post-2022 norms)

- **Typical cut size:** 10–20% of workforce is the mode; observed range ~5–38% (TechCrunch 2023–24 archives). A ">30% cut" reads as a crisis/pre-shutdown event. Recommend drawing from 10–30%, centered ~15%.
- **Repeat rounds are the norm for struggling companies:** ~**70% of repeat layoffs occur within 12 months** of the first (Zety Repeat Layoff Index); ~8 in 10 HR leaders oversaw 2+ rounds in two years, usually <6 months apart (Careerminds); nearly **half of all tech layoffs come from repeat-layoff companies**; share of companies doing 3+ rounds tripled 2023→2025 (1.8%→5.1%).
- Aftermath effects worth simulating: morale drop (70% of companies report it), ~20% productivity decline, elevated voluntary attrition in the 2 quarters after a layoff.

## 6. Mortality: graduation, shutdown, acquisition

- **Seed → Series A graduation:** in a normal year ~25–30% graduate within 24 months (2018 cohort: 30.6%); the 2022 cohort managed only ~15%. Eventually (**by year 4**) ~**45–50%** of seed companies raise an A (2019 Q1 cohort: 49.1%). So: roughly half of seeded startups never see Series A.
- **Overall mortality:** ~21.5% of new businesses fail in year 1; ~48–50% dead by year 5 (BLS). Venture-backed: ~75% never return capital; ~67% never achieve an exit or up-round.
- **Shutdown volume (Carta):** 769 shutdowns (2023) → 966 (2024), +25.6%; Q1 2024 alone had 254. Shutdowns up at every stage (seed +102%, A +61%, B +133% YoY).
- **Timeline to death:** shutdowns cluster **2–3 years after the last raise** (companies raise 24–30 months of runway; when re-raising fails, they cut once or twice, then dissolve). Carta explicitly ties the shutdown wave to "somewhere between two and three years is a typical interval between new venture rounds."
- **Acquisition:** M&A is ~74% of successful VC exits (2023–25), but most companies never exit at all. Across a 30k-company historical dataset, post-first-round outcomes split roughly: ~equal thirds still-private/zombie, shut down, acquired-eventually — with acquisition probability over a company's life plausibly 15–30%, much of it acqui-hire/soft-landing. Recommend: conditional on "failing to raise", ~25–35% get acquired (often for little) and the rest shut down.

## 7. Structure: managers, spans, promotions, contractors

- **Span of control:** 7±2 is the classic benchmark; tech norm **5–8** direct reports (Amazon 6–8, Google 7–10). Early-stage player-coach managers have an effective span of only 3–4. Engineering managers run ~1 report wider than other functions. CEO direct reports: ~5 at 100 employees (SaaStr).
- **When the first manager appears:** at **6–8 engineers**, the CTO/founding engineer stops scaling and the first EM is hired or promoted; above ~9 engineers, split into teams of 5–8 each with a lead/manager per team. Common failure modes: promoting too early (<5 reports) or CTO managing 12 directly.
- **Promotion cadence:** average time-to-promotion ~**30.4 months** (~2.5 yrs); ~2 years typical in tech. Annual promotion rate: ~4–10% of employees promoted per year (early-stage startups just 4.1% in 2025, ~5.4% 2024, higher in boom years). Promotion raise ~22%.
- **Contractors/part-time:** heavy usage pre-Series B: ~61% of startups describe themselves as "reliant" on contract talent; fractional CFOs, recruiters, and designers are standard before the corresponding full-time hire triggers above are met.

---

## Recommended simulation parameters

| Parameter | Recommended value | Range / distribution | Basis |
|---|---|---|---|
| `preSeedHeadcount` | 3 | 2–5 (founders + 0–2) | Storm2, Capvisory, YC |
| `seedHeadcountTarget` | 8 | 5–15 | Carta median 4 excl. founders, avg 6.2 |
| `seriesAHeadcountTarget` | 17 | 12–30 | Carta avg 16.8 |
| `seriesBHeadcountTarget` | 50 | 40–80 | Carta avg 48.2; Storm2 |
| `seriesCHeadcountTarget` | 100 | 80–150 | Carta median 86.5 (2024) |
| `preSeedToSeed_months` | 12 | 9–18 | Derived (first hire at ~9.5 mo) |
| `seedToA_months` | 24 | 18–36, lognormal (25th pct 13, 75th pct 38) | Carta 616–774 days |
| `AtoB_months` | 24 | 20–30 | Carta ~712–732 days |
| `BtoC_months` | 27 | 24–34 | Carta 805–856 days |
| `advanceProb_seedToA` | 0.45 eventually (0.25 within 24 mo) | 0.15 (bear) – 0.30 (bull) within 24 mo; ~0.5 by yr 4 | Carta cohorts 2018–2022 |
| `advanceProb_AtoB` | 0.55 | 0.45–0.65 | Derived from graduation-rate trackers (weaker sourcing; flag as estimate) |
| `advanceProb_BtoC` | 0.55 | 0.45–0.65 | Same caveat |
| `engineeringShare` | seed 0.50 → A 0.45 → B 0.40 → C 0.30 | B peak 0.35–0.45; C 0.25–0.35 | Foundry CRO, SaaStr first-100 |
| `firstDesignerHireIndex` | hire #6 | #4–#10 (by Series A at latest) | Initialized, Twine |
| `firstSalesHire` | at ~seed+12mo / ~$1–2M ARR, headcount ~8–12 | — | First Round Review (Figma at $2M ARR) |
| `firstRecruiterHeadcount` | 45 | 40–50 employees | Paraform, Glozo, Sifted |
| `execArrival` | VP Sales @ Series A; VP Eng @ Series B (eng≥15); CFO @ Series B/C; COO @ Series C or never; CTO = founder @ day 0 | ±1 stage | SaaStr ARR benchmarks mapped to stage |
| `execUniqueness` | hard constraint: ≤1 of each C-level/VP title concurrently; new hire requires prior departure | invariant | Structural rule |
| `execReplacementProb` | ~0.4–0.5 chance first VP Sales/VP Eng is replaced within 18–24 mo | — | SaaStr (directional) |
| `annualVoluntaryAttrition` | 0.17 | 0.12–0.22 | Carta 17.5% median |
| `annualInvoluntaryAttrition` (non-layoff) | 0.04 | 0.03–0.06 | Carta voluntary:involuntary ~3:1 |
| `weeklyAttritionHazard` (steady-state) | ~0.4% | 0.3–0.5%/wk aggregate | 21%/yr total ≈ 0.4%/wk |
| `attritionTenureCurve` | multiplier: 0.5× months 0–11, 1.8× spike at month 12, 1.4× months 13–24, 1.0× yr 3, 0.7× yr 4+ | median tenure should emerge ≈ 24–30 mo; 50% survival at ~37 mo | Carta tenure study |
| `regrettedShareOfQuits` | 0.25 | 0.15–0.35 | Umbrex, Pin |
| `founderAnnualDepartureHazard` | ~6%/founder-team-year, years 1–4, declining after | cumulative 24% by yr 4, 30% by yr 5, 40% by yr 8 | Carta co-founder data |
| `layoffCutPct` | 15% | 10–30% (tail to 40% in crisis) | TechCrunch/Layoffs.fyi archives |
| `repeatLayoffProb` | 0.5 within 12 months of a first layoff (struggling firms) | 0.4–0.6; median gap <6 mo | Zety, Careerminds |
| `postLayoffAttritionBoost` | +50% voluntary hazard for 2 quarters | — | Culture Amp / Marketplace (directional) |
| `deathBy5yrProb` (all startups) | 0.50 | 0.48–0.55 | BLS |
| `shutdownDelayAfterLastRaise_months` | 30 | 24–42; usually 1–2 layoff rounds first | Carta shutdown analysis |
| `acquisitionShareOfExits` | 0.74 | 0.70–0.80 | 2023–25 US VC exits |
| `acquiredVsShutdownWhenFailing` | 0.3 acquired / 0.7 shutdown | 0.25–0.35 acquired | Derived from outcome datasets |
| `spanOfControl` | 6 | 5–8 (eng +1; player-coach effective 3–4) | Gallup, CPO HQ, Amazon/Google norms |
| `addManagerAtTeamSize` | 7 | 6–9 (first EM at 6–8 engineers) | Unicorn CTO, emplaybook |
| `promotionMedianMonths` | 27 | 24–30 | Standout-CV 30.4 mo; tech ~24 mo |
| `annualPromotionRate` | 0.06 of headcount | 0.04 (lean yrs) – 0.10 (boom) | Ravio, Carta comp reports |
| `contractorShareEarly` | 0.2 of workforce pre-Series A, declining to <0.05 by C | fractional CFO/recruiter/designer before FT triggers | Mercury, Dover, ISL |

**Realism invariants worth asserting in the sim:** exactly one holder per exec title; no VP Eng before ~15 engineers; no CFO at seed; layoffs never exceed ~40%; headcount at raise-time within ~2× of stage medians; median employee tenure in output ≈ 2–2.5 years; attrition histogram shows the 12-month cliff spike; roughly half of seeded companies never reach A; a shutdown is preceded by ≥6 months of no-raise plus usually a layoff.

---

## Sources

- Carta — Time between VC rounds (2024): https://carta.com/data/time-between-VC-rounds-2024/
- Carta — Series A fundraising Q2 2025: https://carta.com/data/series-a-fundraising-q2-2025/
- Carta — Seed→A graduation rate newsletter: https://carta.com/data/newsletter-graduation-rate-from-seed-to-series-a/
- Carta — Employment tenure at startups (185k employees): https://carta.com/data/employment-tenure-startups/
- Carta — Employee attrition trends: https://carta.com/learn/startups/compensation/employee-attrition/
- Carta — Startup shutdowns Q1 2024: https://carta.com/data/startup-shutdowns-q1-2024/
- Carta — State of Startup Compensation H2 2025: https://carta.com/data/startup-compensation-h2-2025/
- SaaStr — State of Seed: 10 learnings from Carta data: https://www.saastr.com/the-state-of-seed-today-10-key-learnings-from-cartas-latest-data/
- SaaStr — Seed→A now 2.2 years: https://www.saastr.com/carta-the-average-time-from-seed-to-series-a-has-hit-2-2-years-and-longer-from-series-a-to-series-b
- SaaStr — What your first 100 hires will look like: https://www.saastr.com/what-your-first-100-hires-will-look-like/
- SaaStr — When to hire CFO/COO/CMO: https://www.saastr.com/dear-saastr-when-should-a-bootstrapped-startup-hire-a-cfo-coo-cmo
- SaaStr — CEO span of control data: https://www.saastr.com/how-many-direct-reports-do-most-ceos-have-5-if-youre-100-employees-the-data-and-more
- SaaStr — Startup shutdowns up 237%: https://www.saastr.com/carta-startup-shutdowns-are-up-237
- First Round Review — First sales hire: https://review.firstround.com/0-5m-first-sales-hire/
- Initialized — Your first 10 hires: https://blog.initialized.com/2024/08/your-first-10-hires-building-a-strong-foundation-for-your-startup/
- Amplify Partners — Early-stage hiring plan: https://www.amplifypartners.com/blog-posts/how-to-build-your-early-stage-hiring-plan
- CRV — Founding engineer: https://www.crv.com/content/founding-engineer
- Foundry CRO — Series B vs C benchmarks (eng % of headcount): https://foundrycro.com/blog/series-b-vs-series-c-saas-benchmarks-2026/
- Storm2 — Team sizes at pre-seed / Series B: https://storm2.com/resources/team-sizes/
- Chronograph — Series A crunch / seed graduation: https://www.chronograph.pe/current-trends-in-the-series-a-and-seed-venture-markets/
- Incisive Ventures — Venture graduation rates: https://incisive.vc/2025/06/10/update-on-venture-graduation-rates/
- TechCrunch — 2023/2024 tech layoff archives: https://techcrunch.com/2024/12/31/a-comprehensive-archive-of-2024-tech-layoffs/
- Crunchbase News — Tech layoffs tracker: https://news.crunchbase.com/startups/tech-layoffs/
- Zety — Repeat Layoff Index: https://zety.com/blog/repeat-layoff-index
- Careerminds — Layoff loops survey: https://careerminds.com/blog/repeat-job-cuts
- BLS-derived failure stats: https://www.demandsage.com/startup-failure-rate/ and https://www.llc.org/startup-failure-rate-statistics/
- Entrepreneur — Wasserman 65% team-conflict failure: https://www.entrepreneur.com/leadership/harvard-business-school-professor-says-65-of-startups-fail/370367
- Unicorn CTO — First engineering manager: https://www.unicorn-cto.com/when-to-hire-your-first-engineering-manager/
- EM Playbook — First EM: https://emplaybook.com/expectations/first_em
- Gallup — Span of control: https://www.gallup.com/workplace/700718/span-control-optimal-team-size-managers.aspx
- CPO HQ — Span of control benchmarks: https://www.cpohq.com/blog/span-of-control-benchmarks
- Ravio — Average promotion rate: https://ravio.com/blog/average-promotion-rate
- Standout-CV — Time to promotion (30.4 months): https://standout-cv.com/stats/time-to-promotion
- Paraform — First in-house recruiter: https://www.paraform.com/blog/when-to-hire-first-in-house-recruiter
- Sifted — Scaling 5→50 employees: https://sifted.eu/articles/scaling-to-50-employees-startups-hiring
- Umbrex — Regretted attrition benchmarks: https://umbrex.com/resources/company-analysis/human-resources/regretted-attrition-rate/
- Pin — Attrition rate guide: https://www.pin.com/blog/attrition-rate-guide/
- Mercury — Employee vs contractor: https://mercury.com/blog/employee-vs-independent-contractor-startups
- Alumni Ventures — How venture investments exit: https://www.av.vc/blog/av-academy-vc-201-class-3-how-venture-investments-exit
- Forbes — The new venture playbook (Carta data): https://www.forbes.com/sites/kylewestaway/2025/02/24/the-new-venture-playbook-the-data-every-founder-needs-to-know/
