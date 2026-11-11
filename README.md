# Unified Revenue Authority (URA)

**Generation 1 of 6 — Institutional Foundation**

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

## Roadmap: the next five generations

1. **Generation 2 — Taxation & Filing:** comprehensive individual and business filing forms, configurable tax rules, calculations, and review queues.
2. **Generation 3 — Treasury & Accounting:** journal-based financial ledgers, assessments, payments, refund authorizations, and reconciliation.
3. **Generation 4 — Audits & Resolution:** examinations, collections, installment arrangements, correspondence, appeals and determinations.
4. **Generation 5 — RP Simulation:** generated citizens, fictional businesses, simulated economic activity, case scenarios and controlled time progression.
5. **Generation 6 — Enterprise Edition:** complex reports, document templates, administrative intelligence, API integrations, security and accessibility hardening.

## Generation 1 limitations

There is no real payment processing, tax calculation engine, audit workflow, password recovery, or file upload in this generation. Tax amounts on the dashboard stay zero until the treasury is implemented. Account names are unique. Real-world tax identifiers and private medical or financial data should never be used. Test with fictional profiles only.
