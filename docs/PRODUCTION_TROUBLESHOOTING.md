# Production diagnostics: GitHub Pages callable functions

This project uses GitHub Pages at https://silly-cheese.github.io/Unified-Revenue-Authority/ and Firebase callable HTTPS functions in us-central1. It is a fictional roleplay system; no real money or government records.

## Why the browser may say "CORS" for getOverview

Firebase's onCall SDK automatically handles CORS preflight. When Chrome says the Cloud Function response has **no Access-Control-Allow-Origin** even though the function code uses \`cors: true\`, the request may have been rejected before reaching the handler (e.g., by the Cloud Run Invoker IAM requirement). A browser preflight request has no authorization token.

All exported callable functions now declare:

    { cors: true, invoker: "public" }

The HTTP endpoint is therefore invocable from the public internet, while *actual application authorization* still comes from Firebase ID-token verification and the in-handler active-role checks. Do **not** remove the application's UID or role checks, and do not publish Admin SDK credentials.

The front end now calls the command-center overview only when the Dashboard is open, so a failing overview request no longer drowns out errors from unrelated modules.

### After merging the fix

From the repository root in PowerShell:

    git pull origin main
    npm.cmd install --prefix functions
    npm.cmd test --prefix functions
    firebase.cmd deploy --only "functions:getOverview,functions:getExecutiveReport" --project unified-revenue-authority

The redeployment updates the callable configuration for the two endpoints shown in the browser screenshot. To apply the same explicit public Invoker setting to other already deployed callables, deploy all Functions as a separate step, preferably in small batches if Firebase quotas or API rate limits are encountered:

    firebase.cmd deploy --only functions --project unified-revenue-authority

If deployment fails to grant public invocation permission, check the specific function's Cloud Run service **Security / Authentication** setting and your deployment account's Cloud Run IAM permissions. Do not confuse Cloud Run *Invoker* IAM with Firebase Authentication. CORS should not be worked around with \`mode: "no-cors"\`.

### Check browser preflight without sending any credentials

    curl.exe -i -X OPTIONS "https://us-central1-unified-revenue-authority.cloudfunctions.net/getOverview" -H "Origin: https://silly-cheese.github.io" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization,content-type"

A successful callable preflight normally returns a 2xx status and an Access-Control-Allow-Origin response matching the GitHub Pages origin. A 403 without CORS headers suggests Cloud Run IAM has blocked the request.

## Why getExecutiveReport may return HTTP 500

A Firebase callable HTTP 500 typically means an unhandled server-side exception (not a Firestore Rules permission denial in the browser). Exact root cause cannot be determined from Chrome Console alone; inspect the deployed function's Cloud Logging errors.

The latest handler logs a structured error tagged **URA executive reporting failed** with error code, summary and stack, without including taxpayer records or private financial details. The browser receives only a generic error; full diagnostics remain server-side.

### Get targeted logs

    firebase.cmd functions:log --only getExecutiveReport --project unified-revenue-authority
    firebase.cmd functions:log --only getOverview --project unified-revenue-authority

You can also inspect the functions' Logs panels in Firebase Console / Google Cloud Console. Identify **Permission denied**, **NOT_FOUND**, **Index required**, **RESOURCE_EXHAUSTED**, **DEADLINE_EXCEEDED**, etc. Resolve the real logged error, instead of inventing database records or returning zero-filled reports.

After applying this patch and confirming the public Invoker setting, refresh the website with Ctrl+Shift+R and revisit the Executive Intelligence dashboard.

If getExecutiveReport still returns 500, capture the *server-side error message and stack* from its logs (redact any user information); this is necessary to identify and fix the remaining Firestore or runtime failure.

## Deployment safety

- Only the GitHub repository source was changed. No live Firebase deployment or database modification occurred in this patch.
- Do not put service-account JSON credentials, bootstrap passwords or private keys in GitHub or a chat.
- App Firestore Rules and role checks still deny direct client access to confidential records.
- A passing Node unit test does not replace a live Firebase integration smoke test.
