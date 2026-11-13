# Converting an existing RP taxpayer into a portal account

This feature permits the founding **Commissioner** to give an existing NPC or agency-created fictional taxpayer a real URA portal login while keeping the taxpayer's identity and recorded financial/case history.

## How it works

1. Sign in as the Commissioner.
2. Open **Enterprise Registry** or **Taxpayer Registry** (or an unlinked taxpayer dossier).
3. Choose a taxpayer with **active** status and no existing portal owner.
4. Select **Create portal** / **Create portal login**.
5. Enter a **unique fictional login name** and a **new password** (10–128 characters), and confirm it.
6. Submit. The system creates a Firebase Auth account via an authorized callable Function, then connects that UID to the **existing taxpayer record**. The player can sign in from the normal URA website using the provided name and password.

**Business accounts:** The registered taxpayer name (for example, "Silvercrest Manufacturing") does not have to be the portal login name. You may select a fictional character login such as "Jordan Vale"; the business taxpayer's original registered name remains unchanged.

## What is preserved

- Original taxpayer ID and taxpayer reference number.
- Original name, classification, region, and NPC/agency-origin flags.
- Tax returns and formal assessments.
- Double-entry Treasury balance and all existing posted journals.
- Receipts, refunds, payment plans, and authorized administrative cases.
- Audit logs and case activity timelines.

Previous records can have \`ownerUid: null\`; these are intentionally **not rewritten**. Citizen-facing Functions now check the logged-in user's trusted server-created \`taxpayerId\` against each record's \`taxpayerId\`, while rejecting records that are owned by a *different* UID. Investigations stay restricted.

Future actions on a converted taxpayer may store the new user UID; both historic and new records appear in the appropriate portal screens.

## Access and security

- **Only active Commissioner accounts** can call \`activateTaxpayerPortal\`.
- Only active, unlinked taxpayer records can be converted.
- The new user receives a **citizen** role, not Commissioner/staff privileges.
- A generated NPC gets a Firebase Authentication login *only after* conversion.
- Portal login names use the existing synthetic internal address derivation. **Real email addresses are not required.**
- Login names are unique and the founding Commissioner name is reserved.
- Passwords are sent over Firebase's HTTPS callable connection and passed to Firebase Authentication. They are **never stored in Firestore or logged** by this feature.
- Conversion is audited, and the target taxpayer record is transactionally checked before linking.
- If a new Auth user was created but linking fails, the Function attempts to delete the new Auth user. If an uncertain network failure occurs, check Firestore ownership and Auth status before retrying.
- Sharing the chosen credentials with the intended RP player is a Commissioner responsibility. Do not post passwords publicly.

**This is a fictional simulation, never a real tax system.**

## Password management

The Commissioner can find the login name in the registry and choose **Reset portal password** in the taxpayer record or dossier. This action applies to active citizen portals created through conversion. It uses the same login name and taxpayer record. The audit log records the reset request.

Signed-in users can choose **My account → Change password** and confirm their current password before setting a new one.

## Merge and deploy

After merging, from your Windows PowerShell project folder:

    git pull origin main
    npm.cmd install --prefix functions
    npm.cmd test --prefix functions
    firebase.cmd deploy --only functions --project unified-revenue-authority

Deploy the Functions before using the new dashboard and password management actions.

The website is hosted with GitHub Pages. It updates from \`main\` after the merge (provided GitHub Pages is configured to deploy from \`main\`). **No Firebase Storage, Firestore Rules, or Firebase Hosting changes are required.**

### Live testing checklist

1. Create a fictional NPC with the simulation engine, or agency-register a taxpayer.
2. Open the taxpayer from Registry; create a password-protected portal login.
3. Verify the Commissioner stays logged in during conversion.
4. Sign out and log in using the new character name and password.
5. Verify the existing taxpayer reference and records are present; login does **not** create a duplicate taxpayer.
6. Verify NPC-submitted filings, any accepted assessments, payments, refunds, and applicable case notices display for the citizen.
7. Verify the citizen cannot view a *different* taxpayer's data or any special-investigation case.
8. Confirm another portal cannot be activated against the same record.
9. Confirm a duplicate fictional login name is rejected.
10. Confirm user cannot call activation as a citizen or staff member.
11. Reset the converted citizen's password from their dossier and verify sign-in with the new password.
12. From **My account**, verify that changing a password requires the current password.
13. Verify that the citizen homepage shows the taxpayer reference, outstanding balance, and disbursed refunds.
14. Run a simulation scenario and confirm the converted taxpayer is excluded from generated workload.
