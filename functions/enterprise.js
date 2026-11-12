// Generation 6 — enterprise reporting, immutable issued report memoranda,
// paginated taxpayer registry and unified taxpayer financial dossiers.
// Source data remains fictional and is never publicly readable from Firestore.
import {onCall,HttpsError} from "firebase-functions/v2/https";
import {getFirestore,FieldValue} from "firebase-admin/firestore";
import {YEARS,SAMPLE_LIMIT,reportYear,summarizeAccounts,statusCounts,caseTypeCounts,fiscalTrend,coverage,validateReportDraft} from "./lib/reporting.js";

const opts={cors:true};
const db=()=>getFirestore();
const STAFF=["commissioner","supervisor","staff","auditor"];
const EXAMINER=["commissioner","supervisor","auditor"];
function fail(code,message){throw new HttpsError(code,message);}
async function currentUser(req){
 if(!req.auth?.uid)fail("unauthenticated","Sign in to use agency reporting.");
 const uid=req.auth.uid,snap=await db().collection("users").doc(uid).get();
 if(!snap.exists||snap.data().status!=="active")fail("permission-denied","Your account is not active.");
 return {uid,...snap.data()};
}
function staff(user){
 if(!STAFF.includes(user.role))fail("permission-denied","Agency employee authorization is required.");
}
function supervisor(user){
 if(!["commissioner","supervisor"].includes(user.role))fail("permission-denied","Only agency executive staff can issue reporting memoranda.");
}
function isStaff(user){return STAFF.includes(user.role);}
function parseYear(x){try{return reportYear(x);}catch(e){fail("invalid-argument",e.message);}}
function dateValue(x){return x?.toDate?.()?.toISOString?.()||null;}
function id(raw){
 const str=String(raw||"");
 if(!/^[A-Za-z0-9_-]{8,128}$/.test(str))fail("invalid-argument","Invalid record identifier.");
 return str;
}
const recent=(snap,filter=()=>true)=>snap.docs.filter(d=>filter(d.data()))
 .map(d=>({id:d.id,...d.data()}));
const statusTotals=(snapshot)=>statusCounts(snapshot.docs.map(d=>d.data()));
async function buildExecutiveReport(year){
 year=parseYear(year);
 const [
  allTaxpayers,allUsers,accountsTotal,returnsTotal,caseTotal,receiptTotal,
  accountsSnap,returnsSnap,caseSnap,receiptSnap,refundSnap,controlSnap,chartSnap
 ]=await Promise.all([
  db().collection("taxpayers").count().get(),
  db().collection("users").count().get(),
  db().collection("treasuryAccounts").where("taxYear","==",year).count().get(),
  db().collection("taxReturns").where("taxYear","==",year).count().get(),
  db().collection("agencyCases").where("taxYear","==",year).count().get(),
  db().collection("treasuryReceipts").where("taxYear","==",year).count().get(),
  db().collection("treasuryAccounts").where("taxYear","==",year).limit(SAMPLE_LIMIT).get(),
  db().collection("taxReturns").where("taxYear","==",year).limit(SAMPLE_LIMIT).get(),
  db().collection("agencyCases").where("taxYear","==",year).limit(SAMPLE_LIMIT).get(),
  db().collection("treasuryReceipts").where("taxYear","==",year).limit(SAMPLE_LIMIT).get(),
  db().collection("treasuryRefunds").where("taxYear","==",year).limit(SAMPLE_LIMIT).get(),
  db().collection("treasuryControl").doc("primary").get(),
  db().collection("treasuryChart").get()
 ]);
 const accounts=accountsSnap.docs.map(x=>x.data()),returns=returnsSnap.docs.map(x=>x.data());
 const cases=caseSnap.docs.map(x=>x.data()),receipts=receiptSnap.docs.map(x=>x.data());
 const chart=Object.fromEntries(chartSnap.docs.map(x=>[x.id,{
  name:x.data().name||x.id,balanceCents:Number(x.data().balanceCents||0),
  debitCents:Number(x.data().debitCents||0),creditCents:Number(x.data().creditCents||0)
 }]));
 const control=controlSnap.exists?controlSnap.data():{};
 const totalDebits=Number(control.totalDebitCents||0),totalCredits=Number(control.totalCreditCents||0);
 const chartNet=Object.values(chart).reduce((n,x)=>n+x.balanceCents,0);
 const accountCoverage=coverage(accountsSnap.size,accountsTotal.data().count);
 const filingCoverage=coverage(returnsSnap.size,returnsTotal.data().count);
 const caseCoverage=coverage(caseSnap.size,caseTotal.data().count);
 const receiptCoverage=coverage(receiptSnap.size,receiptTotal.data().count);
 const refunds=refundSnap.docs.map(x=>x.data());
 const metrics=summarizeAccounts(accounts);
 return {
  taxYear:year,generatedAt:new Date().toISOString(),
  totals:{taxpayers:allTaxpayers.data().count,registeredUsers:allUsers.data().count,
   fiscalAccounts:accountsTotal.data().count,fiscalFilings:returnsTotal.data().count,
   fiscalCases:caseTotal.data().count,fiscalReceipts:receiptTotal.data().count},
  coverage:{accounts:accountCoverage,filings:filingCoverage,
   cases:caseCoverage,receipts:receiptCoverage,
   refunds:{sampled:refundsSnap.size,limit:SAMPLE_LIMIT,complete:refundsSnap.size<SAMPLE_LIMIT}},
  financial:{...metrics,
   totalDirectRemittancesCents:receipts.filter(r=>r.status==="posted")
    .reduce((n,r)=>n+Number(r.amountCents||0),0)},
  workflow:{filings:statusCounts(returns),cases:statusCounts(cases),
   caseTypes:caseTypeCounts(cases),refunds:statusCounts(refunds)},
  trend:fiscalTrend(receipts,year),
  ledger:{totalDebitsCents:totalDebits,totalCreditsCents:totalCredits,
   postedJournals:Number(control.postedJournals||0),
   chartNetCents:chartNet,balanced:totalDebits===totalCredits&&chartNet===0,chart},
  disclaimer:"FICTIONAL ROLEPLAY ANALYSIS. No real government, financial or legal effect. Fiscal balances reflect only the explicitly reported coverage, not hidden extrapolations."
 };
}

export const getExecutiveReport=onCall(opts,async req=>{
 const person=await currentUser(req);staff(person);
 return await buildExecutiveReport(req.data?.taxYear??2026);
});
export const issueExecutiveReport=onCall(opts,async req=>{
 const person=await currentUser(req);supervisor(person);
 let draft;
 try{draft=validateReportDraft(req.data);}catch(e){fail("invalid-argument",e.message);}
 const snapshot=await buildExecutiveReport(draft.year);
 const ref=db().collection("executiveReports").doc(),entry={
  reference:"URA-EX-"+draft.year+"-"+ref.id.slice(0,8).toUpperCase(),
  title:draft.title,findings:draft.findings,taxYear:draft.year,
  snapshot,issuedBy:person.uid,issuedByName:person.displayName,
  status:"issued",issuedAt:FieldValue.serverTimestamp()
 };
 const batch=db().batch();
 batch.create(ref,entry);
 batch.create(db().collection("auditLogs").doc(),{
  action:"Executive report issued",detail:draft.title,actorUid:person.uid,
  actorName:person.displayName,targetId:ref.id,createdAt:FieldValue.serverTimestamp()
 });
 await batch.commit();
 return {ok:true,reportId:ref.id,reference:entry.reference};
});
export const listExecutiveReports=onCall(opts,async req=>{
 const person=await currentUser(req);staff(person);
 const snap=await db().collection("executiveReports").orderBy("issuedAt","desc").limit(80).get();
 return {items:snap.docs.map(d=>({id:d.id,reference:d.data().reference,title:d.data().title,
  findings:d.data().findings,taxYear:d.data().taxYear,
  issuedByName:d.data().issuedByName,issuedAt:dateValue(d.data().issuedAt)})),limit:80};
});
export const getIssuedExecutiveReport=onCall(opts,async req=>{
 const person=await currentUser(req);staff(person);
 const snap=await db().collection("executiveReports").doc(id(req.data?.reportId)).get();
 if(!snap.exists)fail("not-found","Executive report not found.");
 return {id:snap.id,reference:snap.data().reference,title:snap.data().title,
  findings:snap.data().findings,taxYear:snap.data().taxYear,
  snapshot:snap.data().snapshot,issuedByName:snap.data().issuedByName,
  issuedAt:dateValue(snap.data().issuedAt)};
});

export const listAgencyRegistryPage=onCall(opts,async req=>{
 const person=await currentUser(req);staff(person);
 const prefix=String(req.data?.prefix||"").normalize("NFKC").trim().slice(0,60);
 if(prefix&&!/^[\p{L}\p{N} .,'-]+$/u.test(prefix))
  fail("invalid-argument","Name search contains unsupported characters.");
 const cursor=String(req.data?.cursor||"");
 if(cursor&&!/^[A-Za-z0-9]{20}$/.test(cursor))
  fail("invalid-argument","Invalid page cursor.");
 let query=db().collection("taxpayers").orderBy("fullName");
 if(prefix){query=query.startAt(prefix).endAt(prefix+"\uf8ff");}
 if(cursor){
  const doc=await db().collection("taxpayers").doc(cursor).get();
  if(!doc.exists)fail("failed-precondition","The registry cursor no longer exists. Restart the search.");
  query=query.startAfter(doc);
 }
 const snap=await query.limit(30).get();
 return {items:snap.docs.map(d=>({id:d.id,fullName:d.data().fullName||"",
  taxpayerNumber:d.data().taxpayerNumber||"",type:d.data().type||"unknown",
  region:d.data().region||"",status:d.data().status||"unknown",
  simulated:d.data().simulated===true,ownerLinked:!!d.data().ownerUid})),
  nextCursor:snap.size===30?snap.docs[snap.docs.length-1].id:null,
  pageSize:30,searchMode:"case-sensitive name prefix"};
});

function summarizeDoc(d,kind){
 const src=d.data();
 if(kind==="taxReturns")return {id:d.id,caseNumber:src.caseNumber,
  taxYear:src.taxYear,returnType:src.returnType,status:src.status,
  data:src.data,calculation:src.calculation,submittedAt:dateValue(src.submittedAt),
  reviewedAt:dateValue(src.reviewedAt),decisionReason:src.decisionReason||"",
  policyVersion:src.policySnapshot?.version||null};
 if(kind==="treasuryAccounts")return {id:d.id,taxYear:src.taxYear,
  returnType:src.returnType,assessedCents:src.assessedCents||0,
  outstandingCents:src.outstandingCents||0,creditAvailableCents:src.creditAvailableCents||0,
  declaredPaymentsCents:src.declaredPaymentsCents||0,directPaymentsCents:src.directPaymentsCents||0,
  refundsDisbursedCents:src.refundsDisbursedCents||0,reservedRefundCents:src.reservedRefundCents||0};
 if(kind==="taxAssessments")return {id:d.id,caseNumber:src.caseNumber,
  taxYear:src.taxYear,returnType:src.returnType,taxDueCents:src.taxDueCents,
  deltaTaxCents:src.deltaTaxCents,createdAt:dateValue(src.createdAt)};
 if(kind==="treasuryReceipts")return {id:d.id,amountCents:src.amountCents,
  taxYear:src.taxYear,method:src.method,status:src.status,
  createdAt:dateValue(src.createdAt)};
 if(kind==="treasuryRefunds")return {id:d.id,amountCents:src.amountCents,
  taxYear:src.taxYear,status:src.status,reason:src.reason,
  createdAt:dateValue(src.createdAt)};
 if(kind==="treasuryPlans")return {id:d.id,amountCents:src.amountCents,
  paidCents:src.paidCents||0,taxYear:src.taxYear,installmentCount:src.installmentCount,
  status:src.status,schedule:src.schedule,createdAt:dateValue(src.createdAt)};
 if(kind==="agencyCases")return {id:d.id,caseNumber:src.caseNumber,
  kind:src.kind,title:src.title,taxYear:src.taxYear,status:src.status,
  createdAt:dateValue(src.createdAt)};
 return {id:d.id};
}
export const getTaxpayerDossier=onCall(opts,async req=>{
 const user=await currentUser(req);
 const taxpayerId=id(req.data?.taxpayerId);
 if(!/^[A-Za-z0-9]{20}$/.test(taxpayerId))fail("invalid-argument","Invalid taxpayer record reference.");
 const doc=await db().collection("taxpayers").doc(taxpayerId).get();
 if(!doc.exists)fail("not-found","Taxpayer not found.");
 const t=doc.data();
 const agency=isStaff(user);
 if(!agency&&(t.ownerUid!==user.uid||user.taxpayerId!==taxpayerId))
  fail("permission-denied","You may view only your own registered taxpayer record.");
 const names=["taxReturns","treasuryAccounts","taxAssessments","treasuryReceipts",
  "treasuryRefunds","treasuryPlans","agencyCases"];
 const requests=names.map(name=>db().collection(name).where("taxpayerId","==",taxpayerId).limit(100).get());
 const results=await Promise.all(requests);
 const records={};
 for(const [i,name] of names.entries()){
  records[name]=results[i].docs
   .filter(d=>name!=="agencyCases"||d.data().kind!=="investigation"||EXAMINER.includes(user.role))
   .map(d=>summarizeDoc(d,name));
 }
 const totals=summarizeAccounts(records.treasuryAccounts);
 return {taxpayer:{id:doc.id,fullName:t.fullName,taxpayerNumber:t.taxpayerNumber,
  type:t.type,region:t.region,status:t.status,simulated:t.simulated===true,
  notes:agency?t.notes||"":undefined,
  createdAt:dateValue(t.createdAt)},
  totals,records,limits:{perCollection:100,
   partial:names.filter((n,i)=>results[i].size===100)},
  issuedAt:new Date().toISOString(),
  disclaimer:"UNIFIED REVENUE AUTHORITY · FICTIONAL ROLEPLAY TAXPAYER STATEMENT · NOT A REAL GOVERNMENT DOCUMENT"};
});