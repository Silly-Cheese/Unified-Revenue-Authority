import {onCall} from "firebase-functions/v2/https";
import {canAccessTaxpayerRecord} from "./lib/portal-access.js";
import {installmentProgress} from "./lib/filing-calendar.js";
import {activeUser, auditorRoles, callable, db, isStaff, permit, recordId, simulationDate, staffRoles, time} from "./lib/agency-access.js";

export const getAgencyWorkload = onCall(callable, async request => {
 const user = await activeUser(request);
 permit(user, staffRoles);
 const date = await simulationDate();
 const caseBase = db().collection("agencyCases").where("dueDate", "<", date);
 const visible = auditorRoles.includes(user.role) ? ["audit", "appeal", "collection", "investigation"] : ["audit", "appeal", "collection"];
 const overdue = await caseBase.select("status", "kind").get();
 return {date, overdue: overdue.docs.filter(doc => visible.includes(doc.data().kind) && !["resolved", "closed"].includes(doc.data().status)).length};
});
export const getTaxpayerActionCenter = onCall(callable, async request => {
 const user = await activeUser(request);
 if (isStaff(user) || !user.taxpayerId) return {items: []};
 const date = await simulationDate();
 const load = async collection => {
  const docs = await db().collection(collection).where("taxpayerId", "==", user.taxpayerId).get();
  return docs.docs.filter(doc => canAccessTaxpayerRecord(user, doc.data())).map(doc => ({...doc.data(), id: doc.id}));
 };
 const [returns, cases, requests, plans, refunds, extensions] = await Promise.all([
  load("taxReturns"), load("agencyCases"), load("informationRequests"), load("treasuryPlans"), load("treasuryRefunds"), load("filingExtensions")
 ]);
 const publicCases = cases.filter(entry => entry.kind !== "investigation");
 const notices = (await noticesForCases(publicCases.map(entry=>entry.id))).map(doc=>({id:doc.id,...doc.data()}));
 const items = [];
 const add = (title, detail, route, due = null) => items.push({title, detail, route, due});
 for (const filing of returns.filter(row => ["information_requested", "rejected"].includes(row.status)))
  add(filing.caseNumber, filing.decisionReason || "Return needs your attention", `filings/${filing.id}`);
 for (const req of requests.filter(row => row.items.some(item => item.status === "awaiting_response")))
  add(req.title, "Response requested", `notices/${req.id}`, req.due);
 for (const row of notices.sort((a, b) => String(time(b.createdAt)).localeCompare(String(time(a.createdAt)))).slice(0,10))
  add(row.title, `${row.caseNumber} · ${time(row.createdAt)?.slice(0,10) || "Notice"}`, `notices/letter_${row.id}`);
 for (const plan of plans.filter(row => row.status === "active")) {
  const next = installmentProgress(plan, date).find(line => line.status !== "paid");
  if (next) add(`Installment ${next.installment}`, next.status === "overdue" ? "Payment overdue" : "Upcoming payment", `plans/${plan.id}`, next.dueDate);
 }
 for (const refund of refunds.filter(row => !["requested", "draft"].includes(row.status))
  .sort((a,b) => String(time(b.reviewedAt)).localeCompare(String(time(a.reviewedAt)))).slice(0,10))
  add(`Refund ${refund.status}`, refund.reviewReason || refund.reason || "Treasury decision", `refunds/${refund.id}`);
 for (const entry of extensions.filter(row => row.status !== "requested"))
  add(`Filing extension ${entry.status}`, `${entry.year} · ${entry.type}`, `calendar/${entry.year}`, entry.status === "approved" ? entry.requestedUntil : null);
 for (const entry of publicCases.filter(row => row.kind === "collection"))
  add(entry.title, `Collections · ${entry.status}`, `notices/collection_${entry.id}`);
 return {date, items: items.sort((a,b) => (a.due || "9999").localeCompare(b.due || "9999"))};
});
export const getPortalNotice = onCall(callable, async request => {
 const user = await activeUser(request);
 const id = request.data?.id;
 if (typeof id !== "string" || !/^[A-Za-z0-9_-]{8,150}$/.test(id)) return {notice: null};
 const notice = (await db().collection("agencyNotices").doc(id).get()).data();
 if (!notice) return {notice: null};
 const entry = (await db().collection("agencyCases").doc(notice.caseId).get()).data();
 if (!entry || (entry.kind === "investigation" ? !auditorRoles.includes(user.role) : !isStaff(user) && !canAccessTaxpayerRecord(user, entry))) return {notice: null};
 return {notice:{title:notice.title, body:notice.body, caseNumber:notice.caseNumber, issuer:notice.issuedByName, date:time(notice.createdAt)}};
});

export const findOperationsTaxpayer = onCall(callable, async request => {
 const user = await activeUser(request);
 permit(user, staffRoles);
 const input = String(request.data?.query || "").trim().slice(0,90);
 if (!input) return {items:[]};
 const taxpayers = db().collection("taxpayers");
 const reference = input.replace(/^(URA|NPC)-/i, "");
 let matches;
 if (/^[A-Za-z0-9]{20}$/.test(reference)) {
  const direct = await taxpayers.doc(reference).get();
  matches = direct.exists ? [direct] : (await taxpayers.where("taxpayerNumber", "==", /^(URA|NPC)-/i.test(input)?input.toUpperCase():`URA-${reference.toUpperCase()}`).limit(10).get()).docs;
 } else {
  const capitalized = input.replace(/(^|\s)\p{L}/gu, letter => letter.toUpperCase());
  const results = await Promise.all([...new Set([input, capitalized])].map(prefix => taxpayers.orderBy("fullName").startAt(prefix).endAt(`${prefix}\uf8ff`).limit(20).get()));
  matches = [...new Map(results.flatMap(result => result.docs).map(doc => [doc.id,doc])).values()].slice(0, 30);
 }
 return {items: matches.map(doc => ({id:doc.id,name:doc.data().fullName,reference:doc.data().taxpayerNumber || doc.id,type:doc.data().type}))};
});

export const listPortalNotices = onCall(callable, async request => {
 const user = await activeUser(request);
 const cursor = request.data?.cursor;
 let docs;
 const collection = db().collection("agencyNotices");
 if (isStaff(user)) {
  let query=collection.orderBy("createdAt","desc");
  if(cursor){
   const start=(await collection.doc(recordId(cursor)).get());
   if(start.exists)query=query.startAfter(start);
  }
  const page=(await query.limit(51).get()).docs;
  const entries=page.slice(0,50);
  const caseIds=[...new Set(entries.map(doc=>doc.data().caseId))];
  const source=caseIds.length?await db().getAll(...caseIds.map(id=>db().collection("agencyCases").doc(id))):[];
  const visible=new Set(source.filter(doc=>doc.exists&&(doc.data().kind!=="investigation"||auditorRoles.includes(user.role))).map(doc=>doc.id));
  return {items:entries.filter(doc=>visible.has(doc.data().caseId)).map(noticeRow),next:page.length>50?entries.at(-1).id:null};
 }
 const caseDocs=await db().collection("agencyCases").where("taxpayerId","==",user.taxpayerId||"").get();
 const accessible=caseDocs.docs.filter(doc=>doc.data().kind!=="investigation"&&canAccessTaxpayerRecord(user,doc.data()));
 docs=await noticesForCases(accessible.map(doc=>doc.id));
 docs.sort((a,b)=>String(time(b.data().createdAt)).localeCompare(String(time(a.data().createdAt)))||a.id.localeCompare(b.id));
 const start=cursor?docs.findIndex(doc=>doc.id===cursor)+1:0;
 const page=docs.slice(start,start+50);
 return {items:page.map(noticeRow),next:docs.length>start+50?page.at(-1).id:null};
});
function noticeRow(doc){
 const value=doc.data();
 return {id:doc.id,title:value.title,caseNumber:value.caseNumber,date:time(value.createdAt)};
}

async function noticesForCases(caseIds){
 const batches=[];
 for(let i=0;i<caseIds.length;i+=30)batches.push(caseIds.slice(i,i+30));
 const collection=db().collection("agencyNotices");
 return (await Promise.all(batches.map(ids=>collection.where("caseId","in",ids).get()))).flatMap(page=>page.docs);
}
