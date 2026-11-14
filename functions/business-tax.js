import {onCall} from "firebase-functions/v2/https";
import {FieldPath} from "firebase-admin/firestore";
import {postReturnAssessmentInTx} from "./treasury.js";
import {ensureYear, moneyCents, TAX_YEARS} from "./lib/tax-engine.js";
import {BUSINESS_TAXES, ANNUAL_TAXES, calculateBusinessTax, defaultSchedule, periodDates, returnKey, validDate, validatePeriod} from "./lib/filing-calendar.js";
import {activeUser, assertOwnership, audit, callable, db, fail, isStaff, permit, recordId, requiredText, simulationDate, staffRoles, supervisorRoles, taxpayerId, time, timestamp} from "./lib/agency-access.js";
import {preserveLegacySubmission, recordDetermination, storeSubmission} from "./lib/return-history.js";

const allTypes = [...Object.keys(ANNUAL_TAXES), ...Object.keys(BUSINESS_TAXES)];
const schedules = () => db().collection("filingSchedules");
const registrations = () => db().collection("businessTaxRegistrations");
const extensions = () => db().collection("filingExtensions");
const returns = () => db().collection("taxReturns");
const businessReviewers = ["commissioner", "supervisor", "staff", "auditor"];
const dateFields = ["createdAt", "updatedAt", "submittedAt", "reviewedAt", "decidedAt"];
const row = doc => ({...doc.data(), id: doc.id, ...Object.fromEntries(dateFields.map(key => [key, time(doc.data()[key])]))});
function scope(request, user) {
 return taxpayerId(isStaff(user) ? request.data?.taxpayerId || user.taxpayerId : user.taxpayerId);
}
function parsePeriod(args) {
 const type = String(args?.type ?? "");
 if (!allTypes.includes(type)) fail("invalid-argument", "Select a supported fictional tax type.");
 try { return {type, ...validatePeriod(type, args.year, args.period)}; }
 catch (error) { fail("invalid-argument", error.message); }
}
function registrationRef(id, type) { return registrations().doc(`${id}_${type}`); }
function scheduleRef(type, year) { return schedules().doc(`${year}_${type}`); }
function getPolicy(doc, type, year) { return doc?.exists ? doc.data() : defaultSchedule(type, year); }
function forTaxpayer(doc, id, user, requireActive = true) {
 const entry = doc.data();
 if (!entry) fail("not-found", "Taxpayer was not found.");
 assertOwnership(user, {...entry, taxpayerId: id});
 if (requireActive && entry.status !== "active") fail("failed-precondition", "This taxpayer is inactive.");
 return entry;
}
function registeredFor(registration, dates) {
 return registration?.status === "active" && dates.endDate >= registration.effectiveDate;
}
function checkBusiness(type) {
 if (!Object.hasOwn(BUSINESS_TAXES, type)) fail("invalid-argument", "Select sales tax or employer withholding.");
}
function scheduleInteger(raw, min, max, label) {
 const value = Number(raw);
 if (raw === "" || raw == null || !Number.isInteger(value) || value < min || value > max)
  fail("invalid-argument", `${label} must be between ${min} and ${max}.`);
 return value;
}
export const getFilingCalendar = onCall(callable, async request => {
 const user = await activeUser(request);
 const id = scope(request, user);
 const date=await simulationDate();
 const clockYear=Number(date.slice(0,4));
 const {year} = parsePeriod({type: "individual", year: request.data?.year ?? Math.min(2035,Math.max(2025,clockYear)), period: 1});
 const [taxpayer, registrationDocs, policies] = await Promise.all([
  db().collection("taxpayers").doc(id).get(),
  registrations().where("taxpayerId", "==", id).get(), schedules().where("year", "==", year).get()
 ]);
 const person = forTaxpayer(taxpayer, id, user, false);
 const registrationList = registrationDocs.docs.map(row);
 const policyMap = new Map(policies.docs.map(doc => [doc.data().type, doc.data()]));
 const annualType = person.type === "business" ? "business" : "individual";
 const periods = [annualType, ...registrationList.map(entry => entry.type)].flatMap(type => {
  const policy = policyMap.get(type) || defaultSchedule(type, year);
  const registration = registrationList.find(entry => entry.type === type);
  return Array.from({length: BUSINESS_TAXES[type]?.frequency || 1}, (_, index) => {
   const period = index + 1;
   const dates = periodDates(type, year, period, policy);
   return {type, year, period, ...dates, id: returnKey(id, type, year, period), rateBps: policy.rateBps,
    registered: !registration || registeredFor(registration, dates)};
  }).filter(entry => entry.registered);
 });
 const getAll = (refs) => refs.length ? db().getAll(...refs) : [];
 const [filings, extensionDocs, accounts, annualFilings] = await Promise.all([
  getAll(periods.map(entry => returns().doc(entry.id))), getAll(periods.map(entry => extensions().doc(entry.id))),
  getAll(periods.map(entry => db().collection("treasuryAccounts").doc(BUSINESS_TAXES[entry.type]?entry.id:`${id}_${year}_${entry.type}`))),
  returns().where("taxpayerId", "==", id).get()
 ]);
 const accountsById = new Map(accounts.map(doc => [doc.id, doc.data()]));
 return {taxpayer: {id, name: person.fullName, type: person.type, status: person.status}, date, years: TAX_YEARS,
  year,registrations: registrationList, policies: allTypes.map(type => ({...(policyMap.get(type) || defaultSchedule(type, year)), locked: Boolean(policyMap.get(type)?.locked)})),
  periods: periods.map((entry, i) => {
   const legacy = !BUSINESS_TAXES[entry.type] && !filings[i].exists ? annualFilings.docs.find(doc => {
    const item=doc.data();
    return item.taxYear===year&&item.returnType===entry.type&&!item.amendedFrom;
   }) : null;
   const filing = filings[i].data() || legacy?.data();
   const extension = extensionDocs[i].exists ? row(extensionDocs[i]) : null;
   const treasuryId=BUSINESS_TAXES[entry.type]?entry.id:`${id}_${year}_${entry.type}`;
   const account = accountsById.get(treasuryId);
   return {...entry, id:legacy?.id||entry.id, filingDue: (filing?.submittedAt?filing.filingDue:null) || extension?.filingDue || entry.filingDue,
    paymentDue: (filing?.submittedAt?filing.paymentDue:null) || extension?.paymentDue || entry.paymentDue, extension,
    status: filing?.status || "unfiled", reference: filing?.caseNumber || null,
    treasuryAccountId: account ? treasuryId : null, outstandingCents: account?.outstandingCents ?? null};
  })};
});
export const setFilingSchedule = onCall(callable, async request => {
 const user = await activeUser(request);
 permit(user, ["commissioner"]);
 const {type, year} = parsePeriod({...request.data, period: 1});
 const source = defaultSchedule(type, year);
 const filingDay = scheduleInteger(request.data?.filingDay, 1, 28, "Filing day");
 const paymentDay = scheduleInteger(request.data?.paymentDay, 1, 28, "Payment day");
 const annualMonth = BUSINESS_TAXES[type] ? source.annualMonth : scheduleInteger(request.data?.annualMonth, 1, 12, "Annual due month");
 const rateBps = BUSINESS_TAXES[type] ? scheduleInteger(request.data?.rateBps, 0, 10000, "Rate in basis points") : 0;
 const ref = scheduleRef(type, year);
 await db().runTransaction(async tx => {
  const before = (await tx.get(ref)).data();
  if (before?.locked) fail("failed-precondition", "This schedule is locked by a filed return or extension request.");
  tx.set(ref, {type, year, filingDay, paymentDay, annualMonth, rateBps, updatedAt: timestamp()});
  audit(tx, user, "Filing schedule updated", `${type} · ${year}`, ref.id);
 });
 return {ok: true};
});
export const openBusinessTaxAccount = onCall(callable, async request => {
 const user = await activeUser(request);
 permit(user, ["commissioner"]);
 const id = scope(request, user);
 const type = String(request.data?.type || "");
 checkBusiness(type);
 const effectiveDate = request.data?.effectiveDate;
 if (!validDate(effectiveDate) || !TAX_YEARS.includes(Number(effectiveDate.slice(0, 4)))) fail("invalid-argument", "Enter an effective date in a supported tax year.");
 const ref = registrationRef(id, type);
 await db().runTransaction(async tx => {
  const [taxpayer, existing] = await Promise.all([tx.get(db().collection("taxpayers").doc(id)), tx.get(ref)]);
  const person = forTaxpayer(taxpayer, id, user);
  if (person.type !== "business") fail("failed-precondition", "Only a registered business can open these accounts.");
  if (existing.exists) {
   if (existing.data().effectiveDate === effectiveDate) return;
   fail("already-exists", "The business already has this tax account.");
  }
  tx.create(ref, {taxpayerId: id, taxpayerName: person.fullName, ownerUid: person.ownerUid || null,
   type, effectiveDate, status: "active", createdAt: timestamp()});
  audit(tx, user, "Business tax account opened", `${person.fullName} · ${type} · ${effectiveDate}`, ref.id);
 });
 return {ok: true, id: ref.id};
});
export const saveBusinessTaxReturn = onCall(callable, async request => {
 const user = await activeUser(request);
 const {type, year, period} = parsePeriod(request.data);
 checkBusiness(type);
 const id = scope(request, user);
 const ref = returns().doc(returnKey(id, type, year, period));
 const policyRef = scheduleRef(type, year);
 const submit = request.data?.submit === true;
 return db().runTransaction(async tx => {
  const [taxpayer, registration, schedule, filing, date, extension] = await Promise.all([
   tx.get(db().collection("taxpayers").doc(id)), tx.get(registrationRef(id, type)), tx.get(policyRef), tx.get(ref),
   simulationDate(tx), tx.get(extensions().doc(ref.id))
  ]);
  const person = forTaxpayer(taxpayer, id, user);
  const policy = getPolicy(schedule, type, year);
  const dates = periodDates(type, year, period, policy);
  if (!registeredFor(registration.data(), dates)) fail("failed-precondition", "The business is not registered for this tax period.");
  const before = filing.data();
  if (before && !["draft", "information_requested", "rejected"].includes(before.status))
   fail("failed-precondition", "This return is already submitted or accepted.");
  let result;
  try { result = calculateBusinessTax(type, request.data?.data, policy); }
  catch (error) { fail("invalid-argument", error.message); }
  if (submit && (!result.data.attested || date <= dates.endDate))
   fail("failed-precondition", "A completed declaration and a closed filing period are required.");
  if (before && before.submittedAt) await preserveLegacySubmission(tx, ref, before);
  const filingDue = before?.submittedAt&&before.filingDue || extension.data()?.filingDue || dates.filingDue;
  const paymentDue = before?.submittedAt&&before.paymentDue || extension.data()?.paymentDue || dates.paymentDue;
  const effectiveDeadline = extension.data()?.status === "approved" ? extension.data().requestedUntil : filingDue;
  const entry = {taxpayerId: id, taxpayerName: person.fullName, ownerUid: person.ownerUid || null, simulated: person.simulated === true,
   returnType: type, taxYear: year, period, caseNumber: `RET-${year}-${id.slice(0, 8).toUpperCase()}-${type.toUpperCase()}-${period}`,
   filingDue, paymentDue, policySnapshot: {...defaultSchedule(type, year), filingDay:policy.filingDay,paymentDay:policy.paymentDay,rateBps:policy.rateBps},
   ...result, updatedAt: timestamp(), revision: Number(before?.revision || 0) + 1};
  if (!before) Object.assign(entry, {createdBy: user.uid, createdAt: timestamp(), status: "draft"});
  if (submit) {
   const number = Number(before?.submissionCount || (before?.submittedAt ? 1 : 0)) + 1;
   Object.assign(entry, {status: "submitted", submittedAt: timestamp(), submittedBy: user.uid, submissionCount: number,
    submittedOn: date, late: date > effectiveDeadline, decisionReason: "", reviewedAt: null, reviewerName: null});
   storeSubmission(tx, ref, entry, number, user.uid);
   tx.set(policyRef, {type, year, filingDay: policy.filingDay, paymentDay: policy.paymentDay,
    annualMonth: policy.annualMonth, rateBps: policy.rateBps, locked: true}, {merge: true});
  }
  tx.set(ref, entry, {merge: true});
  audit(tx, user, submit ? "Business tax return submitted" : "Business tax draft saved", entry.caseNumber, ref.id);
  return {ok: true, id: ref.id, calculation: result.calculation,status:entry.status||before.status};
 });
});
export const reviewBusinessTaxReturn = onCall(callable, async request => {
 const user = await activeUser(request);
 permit(user, businessReviewers);
 const ref = returns().doc(recordId(request.data?.returnId));
 const decision = request.data?.action;
 if (!["accept", "request_information", "reject"].includes(decision)) fail("invalid-argument", "Choose a filing decision.");
 const reason = requiredText(request.data?.reason, "Decision explanation", 12);
 await db().runTransaction(async tx => {
  const entry = (await tx.get(ref)).data();
  if (!entry || !Object.hasOwn(BUSINESS_TAXES, entry.returnType) || entry.status !== "submitted")
   fail("failed-precondition", "Only a submitted business tax return can be determined here.");
  if (entry.ownerUid === user.uid || entry.taxpayerId === user.taxpayerId) fail("permission-denied", "You cannot determine your own return.");
  const status = {accept: "accepted", request_information: "information_requested", reject: "rejected"}[decision];
  if (decision === "accept") {
   const posted = await postReturnAssessmentInTx(tx, user, entry, ref.id);
   tx.create(db().collection("taxAssessments").doc(ref.id), {sourceReturnId: ref.id, caseNumber: entry.caseNumber,
    taxpayerId: entry.taxpayerId, taxpayerName: entry.taxpayerName, ownerUid: entry.ownerUid,
    taxYear: entry.taxYear, period: entry.period, returnType: entry.returnType, treasuryAccountId: posted.accountId,
    taxDueCents: entry.calculation.taxDueCents, balanceCents: entry.calculation.balanceCents, refundClaimCents: entry.calculation.refundCents,
    deltaTaxCents: posted.deltaTaxCents, adjustmentKind: "initial", createdBy: user.uid, createdAt: timestamp()});
  }
  recordDetermination(tx,ref,entry,status,reason,user);
  tx.update(ref, {status, decisionReason: reason, reviewerName: user.displayName, reviewerUid: user.uid,
   reviewedAt: timestamp(), updatedAt: timestamp(), ...(decision === "accept" ? {assessmentId: ref.id} : {})});
  audit(tx, user, "Business tax return determined", `${entry.caseNumber} · ${status} · ${reason}`, ref.id);
 });
 return {ok: true};
});
export const requestFilingExtension = onCall(callable, async request => {
 const user = await activeUser(request);
 const id = scope(request, user);
 const {type, year, period} = parsePeriod(request.data);
 const requestedUntil = request.data?.requestedUntil;
 const reason = requiredText(request.data?.reason, "Extension explanation", 12);
 if (!validDate(requestedUntil)) fail("invalid-argument", "Enter a valid requested filing date.");
 const ref = extensions().doc(returnKey(id, type, year, period));
 const policyRef = scheduleRef(type, year);
 await db().runTransaction(async tx => {
  const [taxpayer, schedule, registration, existing, filing, date] = await Promise.all([
   tx.get(db().collection("taxpayers").doc(id)), tx.get(policyRef), tx.get(registrationRef(id, type)),
   tx.get(ref), tx.get(returns().doc(ref.id)), simulationDate(tx)
  ]);
  const person = forTaxpayer(taxpayer, id, user);
  const policy = getPolicy(schedule, type, year);
  const dates = periodDates(type, year, period, policy);
  if (BUSINESS_TAXES[type] ? !registeredFor(registration.data(), dates) : person.type !== type)
   fail("failed-precondition", "The taxpayer has no obligation for that filing type.");
  const legacy=!BUSINESS_TAXES[type]&&!filing.exists ? await tx.get(returns().where("taxpayerId","==",id)) : null;
  const alreadyFiled=legacy?.docs.some(doc=>{const row=doc.data();return row.taxYear===year&&row.returnType===type&&!row.amendedFrom&&row.status!=="draft";});
  if (existing.exists || alreadyFiled || (filing.exists && filing.data().status !== "draft")) fail("failed-precondition", "This period already has an extension request or a filed return.");
  const limit = new Date(Date.parse(dates.filingDue) + 180 * 86400000).toISOString().slice(0, 10);
  if (date > dates.filingDue || requestedUntil <= dates.filingDue || requestedUntil > limit)
   fail("invalid-argument", "Request before the filing deadline and choose a filing extension of up to 180 days.");
  tx.create(ref, {taxpayerId: id, taxpayerName: person.fullName, ownerUid: person.ownerUid || null, type, year, period,
   requestedUntil, reason, filingDue: dates.filingDue, paymentDue: dates.paymentDue, status: "requested", createdAt: timestamp()});
  tx.set(policyRef, {...policy, locked: true}, {merge: true});
  audit(tx, user, "Filing extension requested", `${person.fullName} · ${type} · ${requestedUntil}`, ref.id);
 });
 return {ok: true};
});
export const decideFilingExtension = onCall(callable, async request => {
 const user = await activeUser(request);
 permit(user, supervisorRoles);
 const ref = extensions().doc(recordId(request.data?.id));
 const status = request.data?.status;
 if (!["approved", "denied"].includes(status)) fail("invalid-argument", "Choose approve or deny.");
 const reason = requiredText(request.data?.reason, "Extension determination", 12);
 await db().runTransaction(async tx => {
  const entry = (await tx.get(ref)).data();
  if (entry?.status !== "requested") fail("failed-precondition", "The extension is no longer pending.");
  if (entry.taxpayerId === user.taxpayerId || entry.ownerUid === user.uid) fail("permission-denied", "You cannot determine your own extension.");
  tx.update(ref, {status, decisionReason: reason, decidedAt: timestamp(), decidedBy: user.uid});
  audit(tx, user, "Filing extension determined", `${status} · ${reason}`, ref.id);
 });
 return {ok: true};
});
export const listFilingExtensions = onCall(callable, async request => {
 const user = await activeUser(request);
 permit(user, staffRoles);
 let query = extensions().where("status", "==", "requested").orderBy(FieldPath.documentId());
 if (request.data?.cursor) query = query.startAfter(recordId(request.data.cursor));
 const result = await query.limit(51).get();
 const items = result.docs.slice(0, 50).map(row);
 return {items, next: result.size > 50 ? items.at(-1).id : null};
});
export const issueWageStatement = onCall(callable, async request => {
 const user = await activeUser(request);
 const employerId = scope(request, user);
 const rawRecipient = String(request.data?.recipientId || "").trim();
 const publicRef=/^(URA|NPC)-/i.test(rawRecipient);
 let recipientId = taxpayerId(rawRecipient.replace(/^(URA|NPC)-/i, ""));
 if (publicRef) {
  const matches = await db().collection("taxpayers").where("taxpayerNumber", "==", rawRecipient.toUpperCase()).limit(2).get();
  if (matches.size !== 1) fail("invalid-argument", "Enter the reference of one registered fictional employee.");
  recipientId = matches.docs[0].id;
 }
 if (employerId === recipientId) fail("invalid-argument", "Choose an individual employee taxpayer record.");
 let year, wagesCents, withheldCents;
 try { year = ensureYear(request.data?.year); wagesCents = moneyCents(request.data?.wages, "Wages"); withheldCents = moneyCents(request.data?.withheld, "Withholding"); }
 catch (error) { fail("invalid-argument", error.message); }
 if (wagesCents <= 0 || withheldCents > wagesCents) fail("invalid-argument", "Wages must be positive and withholding cannot exceed wages.");
 const ref = db().collection("wageStatements").doc(`${employerId}_${year}_${recipientId}`);
 await db().runTransaction(async tx => {
  const [employer, recipient, registration, existing] = await Promise.all([
   tx.get(db().collection("taxpayers").doc(employerId)), tx.get(db().collection("taxpayers").doc(recipientId)),
   tx.get(registrationRef(employerId, "payroll")), tx.get(ref)
  ]);
  const company = forTaxpayer(employer, employerId, user);
  const employee = recipient.data();
  if (company.type !== "business" || !registeredFor(registration.data(), {endDate: `${year}-12-31`}))
   fail("failed-precondition", "An active employer withholding account is required for the statement year.");
  if (employee?.type !== "individual" || employee.status !== "active") fail("invalid-argument", "Enter an active individual taxpayer reference.");
  if (existing.exists) {
   if (existing.data().wagesCents === wagesCents && existing.data().withheldCents === withheldCents) return;
   fail("already-exists", "A statement is already issued for this employer, employee and year.");
  }
  tx.create(ref, {employerId, employerName: company.fullName, employerOwnerUid: company.ownerUid || null,
   recipientYear: `${recipientId}_${year}`, taxpayerId: recipientId, taxpayerName: employee.fullName, ownerUid: employee.ownerUid || null,
   taxYear: year, wagesCents, withheldCents, createdAt: timestamp(), issuedBy: user.uid});
  audit(tx, user, "Wage statement issued", `${company.fullName} · ${year}`, ref.id);
 });
 return {ok: true, id: ref.id};
});
export const listWageStatements = onCall(callable, async request => {
 const user = await activeUser(request);
 const id = scope(request, user);
 const owner = (await db().collection("taxpayers").doc(id).get());
 const person = forTaxpayer(owner, id, user, false);
 const field = person.type === "business" ? "employerId" : "taxpayerId";
 let query = db().collection("wageStatements").where(field, "==", id).orderBy(FieldPath.documentId());
 if (request.data?.cursor) query = query.startAfter(recordId(request.data.cursor));
 const result = await query.limit(51).get();
 const items = result.docs.slice(0, 50).map(row);
 return {items, next: result.size > 50 ? items.at(-1).id : null};
});
