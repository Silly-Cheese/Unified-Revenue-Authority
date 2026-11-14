import {onCall} from "firebase-functions/v2/https";
import {FieldPath} from "firebase-admin/firestore";
import {canAccessTaxpayerRecord} from "./lib/portal-access.js";
import {calculateReturn, dollars, MONEY_FIELDS, moneyCents} from "./lib/tax-engine.js";
import {BUSINESS_TAXES, calculateBusinessTax, validDate} from "./lib/filing-calendar.js";
import {deriveAccount} from "./lib/treasury-engine.js";
import {postCaseAdjustmentInTx} from "./treasury.js";
import {activeUser, assertOwnership, audit, auditorRoles, callable, db, fail, isStaff, permit, recordId, requiredText, simulationDate, staffRoles, supervisorRoles, time, timestamp} from "./lib/agency-access.js";

const requests = () => db().collection("informationRequests");
const cases = () => db().collection("agencyCases");
const relief = () => db().collection("collectionRelief");
const caseRef = id => cases().doc(recordId(id));
const plain = doc => ({...doc.data(), id: doc.id, createdAt: time(doc.data().createdAt), updatedAt: time(doc.data().updatedAt)});
function event(tx, user, id, kind, body, visibility = "taxpayer") {
 tx.create(db().collection("agencyCaseEvents").doc(), {caseId: id, kind, body, visibility,
  actorUid: user.uid, actorName: user.displayName, createdAt: timestamp()});
}
function readCase(snap, user, kinds) {
 const entry = snap.data();
 if (!entry || !kinds.includes(entry.kind)) fail("not-found", "Case unavailable for this action.");
 assertOwnership(user, entry);
 if (entry.kind === "investigation") permit(user, auditorRoles);
 return entry;
}
function liveCase(entry) {
 if (["closed", "resolved"].includes(entry.status)) fail("failed-precondition", "This case has been resolved or closed.");
}
export const createInformationRequest = onCall(callable, async request => {
 const user = await activeUser(request);
 permit(user, staffRoles);
 const parent = caseRef(request.data?.caseId);
 const title = requiredText(request.data?.title, "Request title", 5, 120);
 const fields = request.data?.items;
 const due = request.data?.due;
 if (!Array.isArray(fields) || !fields.length || fields.length > 12 || !validDate(due))
  fail("invalid-argument", "Provide a deadline and between 1 and 12 requested items.");
 const items = fields.map((field, i) => ({id: i + 1, prompt: requiredText(field, "Requested item", 5, 400), status: "awaiting_response", thread: []}));
 const ref = requests().doc();
 await db().runTransaction(async tx => {
  const [snap, date] = await Promise.all([tx.get(parent), simulationDate(tx)]);
  const c = readCase(snap, user, ["audit", "appeal", "collection"]);
  liveCase(c);
  if (due < date) fail("invalid-argument", "The response deadline cannot be in the past.");
  tx.create(ref, {caseId: parent.id, caseNumber: c.caseNumber, taxpayerId: c.taxpayerId, ownerUid: c.ownerUid || null,
   taxpayerName: c.taxpayerName, title, due, status: "open", items, requestedByName: user.displayName,
   createdAt: timestamp(), updatedAt: timestamp()});
  if(["audit","appeal"].includes(c.kind)&&["open","submitted","under_review"].includes(c.status))tx.update(parent,{status:"information_requested",updatedAt:timestamp()});
  event(tx, user, parent.id, "information_request", `Requested information: ${title}. Due ${due}.`);
  audit(tx, user, "Information request issued", title, ref.id);
 });
 return {ok: true, id: ref.id};
});
export const updateInformationRequest = onCall(callable, async request => {
 const user = await activeUser(request);
 const ref = requests().doc(recordId(request.data?.id));
 const itemId = Number(request.data?.itemId);
 const action = request.data?.action;
 if (!["reply", "accept", "follow_up"].includes(action)) fail("invalid-argument", "Choose a response or review action.");
 if (action !== "reply") permit(user, staffRoles);
 const message = requiredText(request.data?.message, "Correspondence", action === "accept" ? 2 : 5, 1600);
 await db().runTransaction(async tx => {
  const entry = (await tx.get(ref)).data();
  if (!entry) fail("not-found", "Information request not found.");
  const parent = (await tx.get(cases().doc(entry.caseId))).data();
  if (!parent || ["closed","resolved"].includes(parent.status)) fail("failed-precondition", "This case has been resolved or closed.");
  if (action === "reply") {
   if (!canAccessTaxpayerRecord(user, entry)) fail("permission-denied", "Only the linked taxpayer can respond.");
  } else assertOwnership(user, entry);
  const selected = entry.items.find(item => item.id === itemId);
  if (!selected || selected.status !== (action === "reply" ? "awaiting_response" : "submitted"))
   fail("failed-precondition", "The item changed. Reload the request before continuing.");
  if (selected.thread.length >= 24 && action !== "accept") fail("failed-precondition", "Use a new request for further correspondence.");
  const status = {reply: "submitted", accept: "accepted", follow_up: "awaiting_response"}[action];
  const items = entry.items.map(item => item.id === itemId ? {...item, status,
   thread: [...item.thread, {action, message, by: user.displayName, at: new Date().toISOString()}]} : item);
  const complete=items.every(item => item.status === "accepted");
  if (complete&&parent.status==="information_requested") {
   const related=await tx.get(requests().where("caseId","==",entry.caseId));
   if(!related.docs.some(doc=>doc.id!==ref.id&&doc.data().status==="open"))
    tx.update(cases().doc(entry.caseId),{status:"under_review",updatedAt:timestamp()});
  }
  tx.update(ref, {items, status: complete ? "complete" : "open", updatedAt: timestamp()});
  event(tx, user, entry.caseId, "information_request_update", `${entry.title} · item ${itemId} · ${action.replaceAll("_", " ")}`);
  audit(tx, user, "Information request item updated", `${action} · ${itemId}`, ref.id);
 });
 return {ok: true};
});
export const listInformationRequests = onCall(callable, async request => {
 const user = await activeUser(request);
 const suppliedCase = request.data?.caseId;
 let query = requests();
 if (suppliedCase) {
  const parent = caseRef(suppliedCase);
  readCase(await parent.get(), user, ["audit", "appeal", "collection"]);
  query = query.where("caseId", "==", parent.id);
 } else if (!isStaff(user)) query = query.where("taxpayerId", "==", user.taxpayerId || "");
 if (request.data?.openOnly && !suppliedCase && isStaff(user)) query = query.where("status", "==", "open");
 query = query.orderBy(FieldPath.documentId());
 if (request.data?.cursor) query = query.startAfter(recordId(request.data.cursor));
 const result = await query.limit(51).get();
 const page = result.docs.slice(0, 50);
 const items = page.map(plain).filter(item => isStaff(user) || canAccessTaxpayerRecord(user, item));
 return {items, next: result.size > 50 ? page.at(-1).id : null};
});
function fieldsFor(type) {return MONEY_FIELDS[type] || Object.keys(BUSINESS_TAXES[type]?.fields || {});}
function periodMatches(c, r) {
 return c.taxpayerId === r.taxpayerId && c.taxYear === r.taxYear && c.returnType === r.returnType && (c.period || null) === (r.period || null);
}
export const saveExaminationWorkpaper = onCall(callable, async request => {
 const user = await activeUser(request);
 permit(user, auditorRoles);
 const parent = caseRef(request.data?.caseId);
 const filingRef = db().collection("taxReturns").doc(recordId(request.data?.returnId));
 const field = String(request.data?.field || "");
 const note = requiredText(request.data?.note, "Workpaper finding", 12);
 let verified;
 try { verified = moneyCents(request.data?.verified, "Verified amount"); }
 catch (error) { fail("invalid-argument", error.message); }
 await db().runTransaction(async tx => {
  const [caseDoc, filing] = await Promise.all([tx.get(parent), tx.get(filingRef)]);
  const c = readCase(caseDoc, user, ["audit", "investigation"]);
  liveCase(c);
  const r = filing.data();
  if (!r || r.status !== "accepted" || !periodMatches(c, r) || !fieldsFor(r.returnType).includes(field) || r.data?.[field] == null)
   fail("failed-precondition", "Choose a monetary line from an accepted filing for this case's period.");
  const ref = parent.collection("workpapers").doc(`${filingRef.id}_${field}`);
  tx.set(ref, {filingId: filingRef.id, filingReference: r.caseNumber, field, reportedCents: moneyCents(r.data[field]),
   verifiedCents: verified, note, officer: user.displayName, updatedAt: timestamp()});
  event(tx, user, parent.id, "workpaper", `Recorded finding for ${r.caseNumber} · ${field}.`, "internal");
  audit(tx, user, "Workpaper updated", `${r.caseNumber} · ${field}`, parent.id);
 });
 return {ok: true};
});
export const getExaminationWorkpapers = onCall(callable, async request => {
 const user = await activeUser(request);
 permit(user, auditorRoles);
 const parent = caseRef(request.data?.caseId);
 const c = readCase(await parent.get(), user, ["audit", "investigation"]);
 const [records, account] = await Promise.all([parent.collection("workpapers").get(), db().collection("treasuryAccounts").doc(c.taxAccountId).get()]);
 return {items: records.docs.map(doc => ({id: doc.id, ...doc.data(), updatedAt: time(doc.data().updatedAt)})),
  assessedCents: account.data()?.assessedCents ?? null, latestReturnId: account.data()?.latestReturnId ?? null};
});
export async function calculateWorkpaperProposal(tx, caseDoc, account, sourceCaseId) {
 const id=recordId(sourceCaseId);
 const matches=id.startsWith("URA-INV-")||id.startsWith("URA-AUD-")?await tx.get(cases().where("caseNumber","==",id).limit(2)):null;
 if(matches&&matches.size!==1)fail("invalid-argument","Enter one examination or investigation reference.");
 const parent = matches?matches.docs[0].ref:cases().doc(id);
 const source = (await tx.get(parent)).data();
 if (!source || !["audit", "investigation"].includes(source.kind) || source.taxAccountId !== caseDoc.taxAccountId)
  fail("failed-precondition", "Choose workpapers from an examination or investigation linked to this account.");
 if (!account.latestReturnId) fail("failed-precondition", "This assessment has no linked return.");
 const [filing, findings] = await Promise.all([tx.get(db().collection("taxReturns").doc(account.latestReturnId)),
  tx.get(parent.collection("workpapers").where("filingId", "==", account.latestReturnId))]);
 const r = filing.data();
 if (!r || findings.empty || !r.policySnapshot || !periodMatches(caseDoc, r))
  fail("failed-precondition", "Add findings against the latest accepted return before using workpapers.");
 const data = {...r.data};
 for (const doc of findings.docs) {
  const item = doc.data();
  data[item.field] = dollars(item.verifiedCents);
 }
 let calculation;
 try { calculation = BUSINESS_TAXES[r.returnType] ? calculateBusinessTax(r.returnType, data, r.policySnapshot).calculation : calculateReturn(r.policySnapshot, data); }
 catch (error) { fail("failed-precondition", error.message); }
 return {amount: calculation.taxDueCents + (account.penaltyCents || 0), sourceCaseId:parent.id,
  returnId: filing.id, reviewedLines: findings.size};
}
export const previewExaminationAdjustment = onCall(callable, async request => {
 const user = await activeUser(request);
 permit(user, auditorRoles);
 const parent = caseRef(request.data?.caseId);
 return db().runTransaction(async tx => {
  const c = readCase(await tx.get(parent), user, ["audit", "appeal", "investigation"]);
  const account = (await tx.get(db().collection("treasuryAccounts").doc(c.taxAccountId))).data();
  if (!account) fail("not-found", "Treasury account not found.");
  const result = await calculateWorkpaperProposal(tx, c, account, request.data?.sourceCaseId || parent.id);
  return {...result, currentCents: account.assessedCents, deltaCents: result.amount - account.assessedCents};
 }, {readOnly: true});
});
export const collectionAction = onCall(callable, async request => {
 const user = await activeUser(request);
 const action = request.data?.action;
 const parent = caseRef(request.data?.caseId);
 const reason = requiredText(request.data?.reason, "Collections explanation", 12);
 if (action !== "request_waiver") permit(user, supervisorRoles);
 let amount = 0;
 if (["add_penalty", "request_waiver"].includes(action)) {
  try { amount = moneyCents(request.data?.amount, "Penalty amount"); }
  catch (error) { fail("invalid-argument", error.message); }
  if (!amount) fail("invalid-argument", "Enter a positive penalty amount.");
 }
 return db().runTransaction(async tx => {
  const c = readCase(await tx.get(parent), user, ["collection"]);
  liveCase(c);
  if(action!=="request_waiver"&&(c.taxpayerId===user.taxpayerId||c.ownerUid===user.uid))fail("permission-denied","You cannot determine relief on your own account.");
  const accountRef = db().collection("treasuryAccounts").doc(c.taxAccountId);
  const accountData = (await tx.get(accountRef)).data();
  if (!accountData) fail("not-found", "Treasury account not found.");
  const account = deriveAccount(accountData);
  const date = await simulationDate(tx);
  let message;
  if (action === "place_hold") {
   const appealId=recordId(request.data?.appealId);
   const matches=appealId.startsWith("URA-APL-")?await tx.get(cases().where("caseNumber","==",appealId).limit(2)):null;
   if(matches&&matches.size!==1)fail("invalid-argument","Enter one active appeal case reference.");
   const appealRef = matches?matches.docs[0].ref:caseRef(appealId);
   const appeal = (await tx.get(appealRef)).data();
   const until = request.data?.until;
   if (appeal?.kind !== "appeal" || appeal.taxAccountId !== c.taxAccountId || ["closed", "resolved"].includes(appeal.status) || !validDate(until) || until < date)
    fail("invalid-argument", "Choose an active appeal on this account and a valid end date.");
   if (account.collectionHold?.until >= date) fail("failed-precondition", "Release the existing hold first.");
   tx.update(accountRef, {collectionHold: {until, appealId: appealRef.id, caseId: parent.id, reason}, updatedAt: timestamp()});
   message = `Collection hold through ${until} · ${reason}`;
  } else if (action === "release_hold") {
   if (!account.collectionHold) fail("failed-precondition", "This account has no collection hold.");
   tx.update(accountRef, {collectionHold: null, updatedAt: timestamp()});
   message = `Collection hold released · ${reason}`;
  } else if (action === "add_penalty") {
   if (!account.outstandingCents || account.collectionHold?.until >= date) fail("failed-precondition", "A penalty requires an outstanding balance without an active hold.");
   const journal = db().collection("auditLogs").doc().id;
   await postCaseAdjustmentInTx(tx, user, c, account.assessedCents + amount, journal, "penalty", (account.penaltyCents || 0) + amount);
   message = `Penalty posted: $${dollars(amount)} · ${reason}`;
  } else if (action === "request_waiver") {
   if (amount > (account.penaltyCents || 0)) fail("failed-precondition", "The request exceeds penalties on this account.");
   const ref = relief().doc(parent.id);
   const previous = (await tx.get(ref)).data();
   if (previous?.status === "requested") fail("failed-precondition", "A waiver request is already pending.");
   tx.set(ref, {caseId: parent.id, taxpayerId: c.taxpayerId, ownerUid: c.ownerUid || null, taxpayerName: c.taxpayerName,
    amountCents: amount, reason, requestedBy: user.uid, status: "requested", createdAt: timestamp(), updatedAt: timestamp()});
   message = `Penalty waiver requested: $${dollars(amount)} · ${reason}`;
  } else if (["approve_waiver", "deny_waiver"].includes(action)) {
   const ref = relief().doc(parent.id);
   const waiver = (await tx.get(ref)).data();
   if (waiver?.status !== "requested") fail("failed-precondition", "No waiver request is pending.");
   if (waiver.requestedBy === user.uid || c.taxpayerId === user.taxpayerId) fail("permission-denied", "An independent supervisor must decide the waiver.");
   const approve = action === "approve_waiver";
   if (approve) {
    if (waiver.amountCents > (account.penaltyCents || 0)) fail("failed-precondition", "Available penalties changed since the request.");
    await postCaseAdjustmentInTx(tx, user, c, account.assessedCents - waiver.amountCents, db().collection("auditLogs").doc().id,
     "penalty_waiver", account.penaltyCents - waiver.amountCents);
   }
   tx.update(ref, {status: approve ? "approved" : "denied", decisionReason: reason, reviewedBy: user.uid, updatedAt: timestamp()});
   message = `Penalty waiver ${approve ? "approved" : "denied"} · ${reason}`;
  } else fail("invalid-argument", "Choose a collection action.");
  event(tx, user, parent.id, action, message);
  audit(tx, user, "Collection action", message, parent.id);
  return {ok: true};
 });
});
export const getCollectionDetails = onCall(callable, async request => {
 const user = await activeUser(request);
 const parent = caseRef(request.data?.caseId);
 const c = readCase(await parent.get(), user, ["collection"]);
 const [accountDoc, waiverDoc, date] = await Promise.all([
  db().collection("treasuryAccounts").doc(c.taxAccountId).get(), relief().doc(parent.id).get(), simulationDate()
 ]);
 const a = accountDoc.data();
 return {caseNumber:c.caseNumber,taxpayerName:c.taxpayerName,active:!["closed","resolved"].includes(c.status),waiver: waiverDoc.exists ? plain(waiverDoc) : null, account: a ? {outstandingCents: a.outstandingCents,
  penaltyCents: a.penaltyCents || 0, hold: a.collectionHold ? {...a.collectionHold, active: a.collectionHold.until >= date} : null} : null,
  closure: c.collectionClosure ? {...c.collectionClosure, at: time(c.collectionClosure.at)} : null};
});

export const getInformationRequest = onCall(callable, async request => {
 const user = await activeUser(request);
 const doc = await requests().doc(recordId(request.data?.id)).get();
 if (!doc.exists) fail("not-found", "Information request not found.");
 assertOwnership(user, doc.data());
 return {request: plain(doc)};
});

export const getCaseAssessment = onCall(callable, async request => {
 const user = await activeUser(request);
 permit(user, staffRoles);
 const parent = caseRef(request.data?.caseId);
 const c = readCase(await parent.get(), user, ["audit", "investigation", "collection", "appeal"]);
 const acct = (await db().collection("treasuryAccounts").doc(c.taxAccountId).get()).data();
 if(!acct)fail("not-found","Linked Treasury account not found.");
 const assessment = acct.latestReturnId ? (await db().collection("taxAssessments").doc(acct.latestReturnId).get()).data() : null;
 return {returnId:acct.latestReturnId||null,caseNumber:assessment?.caseNumber||c.caseNumber,filingTaxCents:assessment?.taxDueCents??acct.assessedCents,
  assessedCents:acct.assessedCents,paidCents:acct.directPaymentsCents,outstandingCents:acct.outstandingCents,paymentDue:acct.paymentDue||null};
});
