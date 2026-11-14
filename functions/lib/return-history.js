import {db, timestamp} from "./agency-access.js";

export function returnVersions(ref) {
 return ref.collection("submissions");
}
export function storeSubmission(tx, ref, entry, number, uid, submittedAt = timestamp()) {
 tx.set(returnVersions(ref).doc(String(number)), {
  number, data: entry.data, calculation: entry.calculation, policySnapshot: entry.policySnapshot || null,
  submittedAt, submittedBy: uid || null, ...(entry.withholdingMatch ? {withholdingMatch: entry.withholdingMatch} : {}),
  ...(entry.reviewedAt ? {determination:{status:entry.status,reason:entry.decisionReason||"",reviewer:entry.reviewerName||null,at:entry.reviewedAt}} : {})
 });
}
export async function preserveLegacySubmission(tx, ref, entry) {
 if (!entry.submittedAt || !entry.data || !entry.calculation) return;
 const number = Number(entry.submissionCount || 1);
 const existing = await tx.get(returnVersions(ref).doc(String(number)));
 if (!existing.exists) storeSubmission(tx, ref, entry, number, entry.submittedBy, entry.submittedAt);
}
export function recordDetermination(tx,ref,entry,status,reason,user) {
 const number=Number(entry.submissionCount||1);
 tx.set(returnVersions(ref).doc(String(number)),{determination:{status,reason,reviewer:user.displayName,at:timestamp()}},{merge:true});
}
export function withholdingMatch(data, statements) {
 const actual = statements.reduce((total, row) => ({wagesCents: total.wagesCents + row.wagesCents,
  withheldCents: total.withheldCents + row.withheldCents}), {wagesCents: 0, withheldCents: 0});
 const reportedWagesCents = Math.round(Number(data.wages) * 100);
 const reportedWithheldCents = Math.round(Number(data.withholding) * 100);
 return {count: statements.length, ...actual, reportedWagesCents, reportedWithheldCents,
  wageDifferenceCents: reportedWagesCents - actual.wagesCents,
  withholdingDifferenceCents: reportedWithheldCents - actual.withheldCents};
}
export function statementQuery(taxpayerId, year) {
 return db().collection("wageStatements").where("recipientYear", "==", `${taxpayerId}_${year}`);
}
