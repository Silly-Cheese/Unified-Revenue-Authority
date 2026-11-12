**Generation 5 is implemented in the current feature branch.** See [Generation 5 — Simulation Engine](docs/GENERATION_5.md) for scope, permissions, gameplay and testing instructions. Firebase/hosting deployment is intentionally deferred.

# Unified Revenue Authority — Generations 1–5 (Generation 5 branch)

**Status:** Source code for Generations 1–4 is assembled in GitHub. No Firebase Functions, Firestore Rules or GitHub Pages deployment has been performed. The owner will complete deployment after all six generations.

## Generation 4: Compliance Operations & Administrative Casework

The Unified Revenue Authority now contains a case-management system for:
- **Examinations & audits:** open examination files, assign officers, request information, document findings, propose fictional tax reassessments and issue determinations.
- **Administrative appeals:** citizen appeal submissions against assessed tax accounts, evidence statements, correspondence, examiner handling and formal decisions.
- **Collections:** collection case files for accounts with outstanding tax, official-looking RP correspondence, payment-plan follow-ups and case resolutions after payment clearance.
- **Special investigations:** restricted internal investigations available only to auditor/supervisor/commissioner roles; simulated evidence logs and referrals, not actual criminal investigations.

### Available administrative actions

| Action | Eligibility | Result |
| --- | --- | --- |
| Open audit, collection or investigation | Authorized staff; investigations require auditor/supervisor/Commissioner | Agency case with reference ID and timeline |
| File taxpayer appeal | Citizen for their own assessed account; staff can create for accounts they manage | Formal submitted appeal |
| Assign staff officer | Supervisor/Commissioner | Protected case assignment and event |
| Record case correspondence | Staff or citizen in own active appeal | Timestamped event with visibility control |
| Progress case stage | Authorized staff | Validated transition with reasoning |
| Issue formal notice | Authorized staff | Fictional notice stored in Firestore and visible through case portal |
| Propose tax adjustment | Auditors, supervisors or Commissioner | Pending proposal, no immediate balance changes |
| Determine tax adjustment | Supervisor/Commissioner, with separation of duties | Approval or denial, determination notice and, on approval, a balanced Treasury journal |

The **tax adjustment** is a genuine server-side transaction that updates the existing Treasury tax account and posts a balanced general-ledger journal. It verifies the original proposed assessment against the current amount and refuses stale proposals. Reserved refunds can block incompatible adjustments; the reviewer can now cancel an authorized but unpaid refund to release its reserve. All amounts remain simulated and no actual money is handled.

### Generation 4 Firestore collections

- agencyCases
- agencyCaseEvents
- agencyNotices
- agencyCaseAdjustments

Direct browser reads/writes to these collections are denied; Functions filter by account ownership and staff role. Internal investigation cases and internal correspondence are excluded from citizen views.

### Additional Firebase callable Functions

- listAgencyCases
- getAgencyCase
- createAgencyCase
- addAgencyCaseNote
- assignAgencyCase
- advanceAgencyCase
- issueAgencyNotice
- proposeAgencyAdjustment
- determineAgencyAdjustment
- listAgencyOfficers
- cancelTreasuryRefund (reserved-credit release for treasury authorization corrections)

### Verification without deployment

In PowerShell from your repository root (Node.js 22):

    npm.cmd install --prefix functions
    npm.cmd test --prefix functions
    node.exe --check functions/cases.js
    node.exe --check assets/cases.js

The GitHub Actions workflow checks all modules and financial/case-flow unit tests. End-to-end Firebase integration remains unverified until final deployment.

## Upcoming generations

- **Generation 5:** automated fictional taxpayers/businesses, economic scenarios, case workloads and adjustable simulated time.
- **Generation 6:** institutional reporting, printed document improvements, executive analytics, user experience refinements, performance and security hardening.

## Important boundaries

This is a **fictional roleplay simulation**, not a government tax administration or legal enforcement service. All documents include a fictional disclaimer, do not have legal effect, and must not contain real SSNs, real financial credentials or real confidential taxpayer details.

The casework and Treasury currently use capped lists of up to 200 records in each relevant collection. Production-scale pagination and more advanced analytics should be addressed in Generation 6.

### GitHub branch order

1. Generation 1 PR was merged to \`main\`.
2. Generation 2 PR was accidentally merged into Generation 1's feature branch rather than \`main\`.
3. Generation 3's cumulative PR therefore includes **both Generations 2 and 3** and targets \`main\`.
4. Generation 4 is based on the Generation 3 branch; merge the cumulative Generation 3 PR to \`main\` first, then retarget Generation 4 PR to \`main\` and merge.

No deployment is needed until all generations are complete.

---

# Generation 3 reference

## Treasury & Financial Operations (code complete; not deployed)

Generation 3 adds a transactional, fictional Treasury across income tax cases, with an agency command center, interactive payment desk, refund review, payment-plan workflow, chart of accounts and ledger reconciliation.

**Key gameplay**
- Accepted returns automatically create and update a Treasury tax account.
- Declared withholding and estimated payments are posted as simulated prepayments.
- Staff and taxpayer players may record *fictional* payments up to the remaining assessed balance.
- Refund requests require available credit. Supervisor/Commissioner authorization reserves the amount; an additional controlled step disburses it.
- Installment applications generate a 2–24 month schedule, require approval, and track payments.
- All assessment, remittance and refund transactions post balanced double-entry journals.
- Account balances are derived server-side; arbitrary direct Firestore updates are denied.
- Treasury oversight shows aggregate debits, credits, outstanding receivables and control reconciliation.

**No real money, payment processor, government affiliation or real personal data.**

## Deployment status

The owner will deploy *all* Firebase Functions, Firestore Rules and GitHub Pages changes after completing six generations. Do not treat the code as deployed. Nothing in this branch adds Firebase Storage or Firebase Hosting.

### Financial account rules

| Ledger code | Fictional classification |
| --- | --- |
| 1000 | Treasury cash asset |
| 1100 | Tax receivables asset |
| 2100 | Taxpayer credit liability |
| 4100 | Assessed tax revenue |

Stored balances use integer cents. Refund reservations prevent over-disbursement; tax amendments retain their differential accounting entries. Journals are append-only through trusted Functions.

## How to validate locally without deployment

```powershell
npm.cmd install --prefix functions
npm.cmd test --prefix functions
node.exe --check assets/treasury.js
node.exe --check functions/treasury.js
```

## Generations 4–6 ahead

- **Generation 4:** audit/examination case management, collections, appeals and investigation workflow with formal notices.
- **Generation 5:** simulated taxpayers, businesses, tax-filing season and workload scenarios.
- **Generation 6:** polished enterprise reporting, generated documents, administrative intelligence and testing.

---

# Background: Generations 1–2

**Generation 2 of 6 — Tax Filing, Calculations & Assessments is implemented in the Generation 2 feature branch.** The repository is being developed through stacked GitHub pull requests; **Generation 1 must be merged before Generation 2**. Firebase/backend deployment and GitHub Pages publication are intentionally deferred at the owner's request.

## Generation 2: what's included

- Individual income tax and business income tax return creation
- Premium four-step wizard: filing identity, income, deductions/payments, declaration
- Draft save and reopen; corrected returns can be revised and resubmitted
- Signed (fictional) submission, read-only accepted returns, and policy snapshots
- Server-side integer-cent calculations (not client-trusted financial results)
- Progressive individual tax brackets with filing-status scaling, standard vs. itemized deduction, dependent credits, withholding, estimated payments and nonrefundable credits
- Business gross receipts, income, cost of goods, payroll, operating expenses, allowances and corporate-rate calculation
- Examiner docket with discrepancy flags, request-for-information, rejection for correction, acceptance and a required decision rationale
- Formal assessed tax, refund claims and balances; **no money is collected/disbursed yet** (Treasury arrives in Generation 3)
- Amendment drafts tied to accepted original filings and amendment assessment deltas
- Commissioner tax policy settings by year and return type. Policy automatically locks on the first submission, so earlier filings cannot be silently recalculated under changed rules
- Role-based access: citizens manage their own returns; employees review agency cases; only the Commissioner edits tax policies
- Deny-by-default Rules for taxReturns, taxAssessments and taxPolicies; all access passes through authenticated Firebase Functions
- JavaScript syntax and tax-engine test workflow through GitHub Actions (no deployment)

**Simulation boundaries:** all rates and forms are invented for gameplay, not real tax law. Never enter real tax identifiers or sensitive financial data. Form and assessment screens use roleplay-only figures.

### Core tax collections

| Firestore collection | Purpose |
|---|---|
| taxReturns | Drafts, submissions, status changes, calculation snapshots, and case decisions |
| taxAssessments | Approved initial and amended assessments |
| taxPolicies | Year-specific policy configuration and first-submission locks |
| taxpayers / auditLogs | Existing Generation 1 linked taxpayer registry and immutable operation events |

Tax data is stored directly as structured Firestore documents. Firebase Storage is **not used**.

### API functions added

- getTaxCatalog, setTaxPolicy
- previewTaxReturn, saveTaxDraft, submitTaxReturn, listTaxReturns
- reviewTaxReturn, beginTaxAmendment, listTaxAssessments

All monetary inputs are validated and calculated on the backend. Rates are stored as basis points and amounts as integer cents. Accepting a return creates a simulated assessment record, not a Treasury journal entry.

### Run checks locally (no Firebase deployment required)

Use Node.js 22 from the repository root:

    npm.cmd install --prefix functions
    npm.cmd test --prefix functions
    node.exe --check assets/tax.js
    node.exe --check functions/tax.js

The GitHub workflow also executes these tests for the feature branch and pull requests. Cloud Functions and Firestore integration must still be checked after final deployment. Generation 2 is not live until all code is merged and the backend is deployed.

### Key gameplay rules

- New citizen accounts automatically have their own linked taxpayer record through Generation 1.
- A taxpayer can have one original return per year and type, plus sequential amendments.
- Drafts may be edited; submitted returns are locked awaiting an examiner.
- A staff examiner must give a written rationale for acceptance, correction requests, or rejection.
- Staff cannot accept their **own personal** taxpayer return.
- Approval records formal tax liability and refund claims, but no cash movements occur until Generation 3.
- The currently loaded case lists are capped at 250 records; pagination and large-scale workloads are reserved for later scaling.

---

**Generation 1 of 6 — Institutional Foundation (prerequisite)**

A fictional taxation, treasury and revenue administration roleplay platform. **Not a real government agency. Never use real taxpayer data, SSNs or actual financial transfers.**

## Implemented in Generation 1

- Premium responsive navy, ivory and gold agency interface
- GitHub Pages static frontend, without Firebase Hosting
- **Fictional full name + password** registration and login; no real email requested
- Firebase Authentication password verification using internally generated sign-in addresses
- Role-aware dashboards for citizens, staff and the Commissioner
- Taxpayer record registration, directory, details and Commissioner-only archival
- Commissioner personnel management: citizen, staff, auditor and supervisor
- Agency activity/audit events and live registry totals
- Firebase Functions for privileged mutations; deny-by-default Firestore Rules
- One-time local Commissioner bootstrap for **Christopher Shelley**
- No Firebase Storage

## Repository layout

| Location | Purpose |
|---|---|
| index.html | GitHub Pages entry |
| assets/ | Client UI, styles, Firebase settings and login |
| functions/index.js | Callable server-side operations |
| functions/lib/identity.js | Consistent fictional identity derivation |
| functions/scripts/bootstrap.js | Local, one-time founding Commissioner setup |
| functions/test/ | Identity normalization tests |
| firestore.rules | Database authorization |
| firebase.json / .firebaserc | Project configuration, no Hosting |

## Name-only login with passwords

A fictional full name is normalized, lowercased and SHA-256 hashed into an unmonitored internal Firebase sign-in address under accounts.ura.invalid. Firebase Authentication checks the password. **The app does not collect or send an actual email address.** Names are case-insensitively unique. No email-based account recovery exists in Generation 1; administrator-assisted recovery should be built later. Your Commissioner account is tied to its Firebase UID, not the display name.

## Deploy the Firebase backend (Windows PowerShell)

1. Open the Firebase Console and select **unified-revenue-authority**.
2. Enable **Authentication → Sign-in method → Email/Password**. Although the provider is called Email/Password, players only enter their fictional name and password on this app.
3. Under **Authentication → Settings → Authorized domains**, add **silly-cheese.github.io**. Add any custom domain you later use.
4. Create the Cloud Firestore database. Enable the Blaze plan if Firebase requires it to deploy Functions.
5. Install Node.js 22. From the repository root, use:

    npm.cmd install --global firebase-tools
    npm.cmd install --prefix functions
    npm.cmd test --prefix functions
    firebase.cmd login
    firebase.cmd use unified-revenue-authority
    firebase.cmd deploy --only firestore:rules,functions --project unified-revenue-authority

Firebase Hosting is deliberately absent. Do not deploy Storage.

## Secure Commissioner bootstrap — perform before opening public registration

Run the bootstrap **locally**, from a trusted computer, with Google Application Default Credentials capable of managing Firebase Auth users and writing Firestore documents. Store any service account JSON **outside this repository**. Alternatively, configure Google Cloud application-default login with adequate project permissions.

In PowerShell from the repository root:

    $env:GOOGLE_APPLICATION_CREDENTIALS="C:\secure-location\ura-service-account.json"
    $env:URA_COMMISSIONER_PASSWORD=[System.Net.NetworkCredential]::new("",(Read-Host "New Commissioner password" -AsSecureString)).Password
    npm.cmd run bootstrap --prefix functions
    Remove-Item Env:\URA_COMMISSIONER_PASSWORD

The script creates the founding Firebase Auth account with display name **Christopher Shelley** and assigns its immutable UID the **commissioner** role. Login with this name and your chosen password.

**The script must not be placed in the public website, deployed as a callable Function, or run from a public CI job.** It exits if the project has already been bootstrapped or if a user has registered the Commissioner's synthetic sign-in address. If it fails after creating the Auth account, investigate the partial setup rather than promoting an existing account.

## Publish the website through GitHub Pages

After merging the Generation 1 pull request:

1. In GitHub open the repository **Settings → Pages**.
2. Set **Source: Deploy from a branch**.
3. Choose branch **main**, folder **/(root)**, and save.
4. The expected site URL is:

    https://silly-cheese.github.io/Unified-Revenue-Authority/

The URL becomes active when GitHub completes publication. Firebase Functions and Rules are deployed separately using the commands above.

## Security boundaries

The web browser cannot directly create, edit or delete user roles, taxpayer records, system configuration or audit events. Callable Functions authenticate the request, check the Firestore role, validate data and record operations. Firestore Rules deny direct writes to those collections. The founding Commissioner cannot be assigned by the public registration form. No database secrets or Administrator credentials belong in this public repository.

## Original six-generation roadmap

1. **Generation 2 — Taxation & Filing (implemented):** comprehensive individual and business filing forms, configurable tax rules, calculations, and review queues.
2. **Generation 3 — Treasury & Accounting:** journal-based financial ledgers, assessments, payments, refund authorizations, and reconciliation.
3. **Generation 4 — Audits & Resolution:** examinations, collections, installment arrangements, correspondence, appeals and determinations.
4. **Generation 5 — RP Simulation:** generated citizens, fictional businesses, simulated economic activity, case scenarios and controlled time progression.
5. **Generation 6 — Enterprise Edition:** complex reports, document templates, administrative intelligence, API integrations, security and accessibility hardening.

## Generation 1 limitations

Generation 1 does not implement filing, tax calculation or review. Generation 2 adds fictional filings, calculations and review, but **not real payments**, audit investigations, password recovery or file uploads. Tax amounts on the dashboard stay zero until the treasury is implemented. Account names are unique. Real-world tax identifiers and private medical or financial data should never be used. Test with fictional profiles only.
