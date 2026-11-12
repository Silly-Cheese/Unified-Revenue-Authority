# Generation 6 — Enterprise Expansion & Final Handoff

**The sixth and final generation of the Unified Revenue Authority (URA) roleplay system.**

The complete application is a *fictional* government revenue RP system. It is not a government service, does not process real funds, and must never be used with real tax identifiers, medical data, bank credentials or taxpayer information.

**Deployment status: NOT DEPLOYED.** Firebase Functions, Firestore Rules, and GitHub Pages publication remain deferred at the owner's direction. A green GitHub Actions run verifies source syntax/unit tests, not a live Firebase integration test.

## What's new in Generation 6

### Executive Intelligence
- Fiscal-year switching (2025–2035).
- Four financial KPIs: current assessed liability, outstanding receivables, simulated payments and taxpayer credit.
- Operational KPIs: fiscal tax accounts, returns and case counts, and all-years journal activity.
- Twelve-month receipt visualization for the selected year.
- Audit trail and ledger integrity control (balanced debits/credits and chart of accounts).
- Workflow breakdowns for tax returns and examinations, collections, appeals and investigation case types.
- **Explicit source coverage** for every sampled financial total; no fabricated complete results when limits are exceeded.
- Save immutable historical executive reporting memoranda with user-authored findings and Commissioner/supervisor sign-off.
- Export fiscal-year report to CSV with spreadsheet-formula injection protection.
- Print executive reports as clearly marked fictional RP memoranda.

### Enterprise Registry
- Authorized staff can alphabetically browse taxpayer records in pages of 30.
- Case-sensitive name-prefix query for indexed browsing.
- Next/previous page navigation and clear search.
- Distinguishes player-linked, agency-created and automatically generated NPC records.
- Open an integrated taxpayer dossier without leaving the application.

### Unified Taxpayer Dossiers
- Personal records available to the taxpayer account owner, and institutional dossiers to authorized agency staff.
- Live connected data from **taxpayers, taxReturns, taxAssessments, treasuryAccounts, treasuryReceipts, treasuryRefunds, treasuryPlans, agencyCases**.
- Multi-year tax liability, receipt, balance, credit and refund totals.
- Connected filing/assessment/collection/appeal summaries and record coverage disclosures.
- Investigations excluded from unauthorized or citizen access; staff must have appropriate permissions.
- The dossier limits each collection to 100 returned records and marks collections at that limit.

### Document Studio
- Printable taxpayer statements, tax-filing summaries, assessment notices, simulated payment receipts, refund case notices, installment agreements and case summaries.
- Letter-size print styles, simulation seal, reference number, documented preparation date, structured fields and signature lines.
- Large **FICTIONAL ROLEPLAY DOCUMENT** marking on every page, and no claim of government authority or legal effect.
- Print to paper or save a PDF through the **browser's print command**. No PDF generation service, Firebase Storage, or uploads are required.

### Navigation & UX
- New role-aware global module finder, activated by top bar or **Ctrl / ⌘ + K**.
- Search modules by name and jump immediately between different agency departments.
- Expanded and responsive premium navy/gold enterprise UI.
- Dedicated citizen-facing My Tax Dossier and Document Studio modules.
- Generation 6 status appears in the agency module directory.

### Server and security
- Six new server-only callable Functions:
  - getExecutiveReport
  - issueExecutiveReport
  - listExecutiveReports
  - getIssuedExecutiveReport
  - listAgencyRegistryPage
  - getTaxpayerDossier
- All agency-wide reporting requires an active authorized employee account.
- Issuing executive memoranda requires Commissioner or supervisor authority; reports are immutable.
- Citizen account dossier access checks both Firebase UID ownership and the linked taxpayer ID.
- No direct client reads or writes to the executiveReports collection: Firestore Rules deny all.
- No Storage or Firebase Hosting added.

## Implementation dependencies and constraints

Generations 2–5 have stacked pull requests from earlier development. **Do not merge Generation 6 out of order.** Current expected merge order:

1. Merge PR #3 (contains Gen 2 + Gen 3) into main.
2. Retarget PR #4 to main and merge.
3. Retarget PR #5 to main and merge.
4. Retarget PR #6 to main and merge.

This avoids repeating a prior error where one completed generation was merged only into an earlier feature branch.

## Validate code without Firebase deployment

Node.js 22 and dependencies:

    npm.cmd install --prefix functions
    npm.cmd test --prefix functions
    node.exe --check assets/app.js
    node.exe --check assets/enterprise.js
    node.exe --check assets/documents.js
    node.exe --check functions/enterprise.js
    node.exe --check functions/lib/reporting.js

GitHub Actions runs source syntax checks and automated tests for identity, tax calculation, treasury accounting, workflow transitions, simulation engine, financial reporting and document escaping. **It does not prove the UI works against a live Firebase project.**

## Final deployment — only when you choose

### 1. Firebase configuration

In Firebase Console for project **unified-revenue-authority**:

- Enable **Authentication → Email/Password**. The website internally uses a deterministic fictional-name sign-in ID; players enter only a character name and password, never a real email.
- In Authentication authorized domains, include **silly-cheese.github.io** and any future custom domain.
- Create a Firestore database and use Blaze billing if required for deployed Firebase Functions.
- Ensure your account has authority to deploy Functions and Firestore Rules.

### 2. Git pull and PowerShell commands

From the repository folder after all six generations are on main:

    git pull origin main
    npm.cmd install --global firebase-tools
    npm.cmd install --prefix functions
    npm.cmd test --prefix functions
    firebase.cmd login
    firebase.cmd use unified-revenue-authority
    firebase.cmd deploy --only firestore:rules,functions --project unified-revenue-authority

There is **no** Firebase Hosting or Storage deployment.

### 3. Founding Commissioner bootstrap

Provision the fictional name **Christopher Shelley** by running the trusted bootstrap script **locally**, before opening public registration. Keep any service account file outside your public repository. It is a one-time setup that refuses to promote an existing public account sharing the Commissioner's name.

    $env:GOOGLE_APPLICATION_CREDENTIALS="C:\secure-location\ura-service-account.json"
    $env:URA_COMMISSIONER_PASSWORD=[System.Net.NetworkCredential]::new("",(Read-Host "Create Commissioner password" -AsSecureString)).Password
    npm.cmd run bootstrap --prefix functions
    Remove-Item Env:\URA_COMMISSIONER_PASSWORD

The service account must have required project permissions for Firebase Authentication user creation and Firestore writes. Don't paste this credential or the new password into GitHub or the website.

### 4. GitHub Pages

In the GitHub repo go to **Settings → Pages → Deploy from a branch**, choose **main** and **/(root)**, and save.

The expected public URL after GitHub publishes is:

    https://silly-cheese.github.io/Unified-Revenue-Authority/

### 5. End-to-end smoke test

After deployment (not before), verify all of the following manually:

1. Bootstrap Commissioner signs in with only the fictional name and password.
2. New character name/password registration creates citizen and taxpayer record.
3. Commissioner grants/revokes staff access; citizen cannot access staff functions.
4. Citizen saves and submits a tax filing; examiner accepts it and produces Treasury account.
5. Treasury remittance updates balances and posts balanced journal entries.
6. Refund reservation, authorization, payment arrangement and review actions work.
7. Citizen appeal and officer audit adjustments create timeline, notices and Treasury updates.
8. Commissioner initializes the simulation, generates NPC filings, accepts them and runs scenarios.
9. Enterprise fiscal reports show source coverage and ledger balance correctly.
10. Staff dossier lookup works by name prefix across pages; citizens can read only their own dossier.
11. Print/export each document type and confirm all pages are marked as fictional.
12. Test desktop/mobile responsive navigation and Ctrl/⌘+K module search.
13. Review Firebase billing, function logs, rules indexes, and client console errors.

If a Firestore query requests a composite index, create the index shown by Firebase and retest the operation before opening the app to roleplay users.

## Known limitations / planned hardening

- Firebase Authentication synthetic-name accounts cannot be reset by email; a secure administrator-assisted account recovery flow is needed before a public release.
- Names must be unique for RP sign-in; display names/handles cannot yet be independently edited.
- Fiscal account, filing, case and receipt summaries are capped at 400 documents per collection. The interface clearly labels incomplete samples instead of presenting those totals as complete.
- Dossiers return up to 100 per related collection; registry pages return up to 30.
- CSV and print outputs are generated in the user's browser. There is no automatic PDF archival, upload or digital signature.
- Full browser/device accessibility audits and Firebase emulator tests are still recommended after deployment.
- The RP calendar does not run in the background, and no simulation transactions move real money.

For code deployment details, also see the root README and earlier generation documents. Keep the institution fictional throughout.
