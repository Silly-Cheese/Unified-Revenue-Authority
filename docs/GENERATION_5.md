# Generation 5 — Fictional Economy & Population Simulation

This generation adds a deliberately controlled, non-autonomous roleplay world with generated taxpayers, businesses, submitted tax returns, fictional economic conditions, and genuine casework integration.

**Deployment is intentionally deferred:** Firebase Functions, Firestore Rules and GitHub Pages are not deployed. Firebase Storage and Firebase Hosting are not part of the project.

## Simulation experience

1. **Initialize**: The founding Commissioner initializes the world with a fictional date of November 1, 2026 and a deterministic world seed.
2. **Configure**: Select one of four economic climates (steady, expansion, recession, volatile). These affect future synthetic wage and business-receipt distributions; existing returns and assessments are not rewritten.
3. **Generate population**: Create 1–12 fictional individuals and businesses per batch. Every NPC has a taxpayer registry record and a *submitted* individual/business return, including authentic server-calculated, invented tax figures. Generated identities do not have Firebase Auth credentials or passwords.
4. **Review filings**: Staff may examine NPC returns in the Generation 2 Return Processing Center. Formal acceptance posts a simulated assessment through the Generation 3 Treasury general ledger.
5. **Generate cases**: With assessed NPC accounts, a Commissioner or supervisor can spawn up to six new audit cases, collection cases, administrative appeals, or pending refund requests. Existing examination, Treasury and casework workflows handle these cases normally.
6. **Advance time**: Move the fictional date 1–90 days per action. Generate market/fiscal-calendar events and record actions in the simulation history. This is a manually controlled clock, not an autonomous scheduler.

The interface includes a premium responsive Simulation Command page, population directory, economic controls, scenario forms, event feed and run history.

## Security

- Only the Commissioner can initialize, configure, advance time or generate new NPC populations.
- Only Commissioner/supervisor can generate scenario workload.
- All staff may view the simulated population and activity log.
- All NPCs have ownerUid=null; no actual player is impersonated, no real login/email is generated.
- New simulationRuns and simulationEvents collections and system/simulation are server-only; clients cannot write them directly.
- Generated return submission uses the same immutable policy snapshot and lock behavior as normal filings.
- Case workloads only target actually assessed simulated Treasury accounts. They do not automatically approve returns or send real money.
- The simulated calendar never silently creates payment transactions or changes existing financial entries.

All names, institutions, taxes, transactions and economic events are fictional; never use real personal information, tax identifiers, passwords or payment credentials.

## Firebase Functions added

- getSimulationOverview
- initializeSimulation
- configureSimulation
- generateSimulationPopulation
- advanceSimulationClock
- runSimulationScenario

## Verification without deploying

From PowerShell in the repository root with Node.js 22:

    npm.cmd install --prefix functions
    npm.cmd test --prefix functions
    node.exe --check functions/simulation.js
    node.exe --check assets/simulation.js

GitHub Actions also checks module syntax and the pure, deterministic simulation tests. Firebase integration testing remains pending until final deployment.

## Generation 6

Institutional dashboards, official document formatting, advanced reports, searches/pagination, usability and accessibility improvements, security hardening, and final deployment instructions.

## Merge sequence

Generation 5 branch builds on Generation 4. If prior PRs remain open, merge the Generation 3 cumulative PR (#3) first, retarget/merge Generation 4 PR (#4) to main, then retarget/merge Generation 5 to main. Source deployment remains postponed until all six generations are completed.
