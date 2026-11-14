// Generation 4 — fictional compliance, audits, taxpayer appeals, collections and investigations.
// All operations are authorized on the server; no Firebase Storage or real documents.
import {onCall,HttpsError} from "firebase-functions/v2/https";
import {getFirestore,FieldValue} from "firebase-admin/firestore";
import {calculateWorkpaperProposal} from "./case-services.js";
import {simulationDate} from "./lib/agency-access.js";
import {postCaseAdjustmentInTx} from "./treasury.js";
import {canAccessTaxpayerRecord} from "./lib/portal-access.js";
import {deriveAccount} from "./lib/treasury-engine.js";
import {CASE_TYPES,canAdvance,initialCaseStatus,canCitizenReadCase} from "./lib/case-workflow.js";

const db=()=>getFirestore();
const opts={cors:true,invoker:"public"};
const STAFF=["commissioner","supervisor","staff","auditor"];
const SUPERVISORS=["commissioner","supervisor"];
const AUDITORS=["commissioner","supervisor","auditor"];
const NOTICE_TYPES=["request_information","proposed_adjustment","decision","collection_notice","general"];

function fail(code,message){throw new HttpsError(code,message);}
function validateId(raw){
 const id=String(raw||"");
 if(!/^[A-Za-z0-9_-]{8,140}$/.test(id))fail("invalid-argument","Invalid case reference.");
 return id;
}
function required(raw,label,min=8,max=1800){
 const value=String(raw??"").trim();
 if(value.length<min||value.length>max)fail("invalid-argument",label+" must contain "+min+"–"+max+" characters.");
 return value;
}
function optionalDate(raw){
 if(!raw)return null;
 const value=String(raw);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+"T00:00:00Z"))||new Date(value+"T00:00:00Z").toISOString().slice(0,10)!==value)
  fail("invalid-argument","Date must be a valid YYYY-MM-DD value.");
 return value;
}
function cents(raw){
 const val=String(raw??"").trim();
 if(!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(val))
  fail("invalid-argument","Enter a nonnegative amount in dollars with at most two decimals.");
 const [whole,fraction=""]=val.split(".");
 return Number(whole)*100+Number(fraction.padEnd(2,"0"));
}
async function actor(req){
 if(!req.auth?.uid)fail("unauthenticated","Sign in to access agency cases.");
 const uid=req.auth.uid,snap=await db().collection("users").doc(uid).get();
 if(!snap.exists||snap.data().status!=="active")fail("permission-denied","Account is inactive.");
 return {uid,...snap.data()};
}
function employee(a){return STAFF.includes(a.role);}
function permit(a,roles){if(!roles.includes(a.role))fail("permission-denied","Agency authorization required.");}
function canRead(a,c){
 if(c.kind==="investigation")return AUDITORS.includes(a.role);
 return employee(a)||canCitizenReadCase(a.uid,a.taxpayerId,c);
}
function timeline(a,caseId,kind,body,visibility="internal",metadata={}){
 return {caseId,kind,body,visibility,actorUid:a.uid,actorName:a.displayName,
  metadata,createdAt:FieldValue.serverTimestamp()};
}
function audit(a,action,detail,targetId){
 return {action,detail,actorUid:a.uid,actorName:a.displayName,targetId,
  createdAt:FieldValue.serverTimestamp()};
}
function caseSummary(data,id){
 return {id,caseNumber:data.caseNumber,kind:data.kind,status:data.status,title:data.title,
  taxpayerId:data.taxpayerId,taxpayerName:data.taxpayerName,taxAccountId:data.taxAccountId,
  taxYear:data.taxYear,returnType:data.returnType,ownerUid:data.ownerUid||null,
  period:data.period??null,priority:data.priority||"standard",assignedToName:data.assignedToName||"",
  dueDate:data.dueDate||null,proposedTaxDueCents:data.proposedTaxDueCents??null,
  proposalStatus:data.proposalStatus||null,
  createdAt:data.createdAt?.toDate?.()?.toISOString?.()||null,
  updatedAt:data.updatedAt?.toDate?.()?.toISOString?.()||null};
}
function detailVisible(record,person){
 const d={...caseSummary(record,record.id),summary:record.summary,
  resolution:record.resolution||"",proposalReason:record.proposalReason||"",
  determinationReason:record.determinationReason||"",completedAt:record.completedAt?.toDate?.()?.toISOString?.()||null};
 if(employee(person)){
  d.assignedTo=record.assignedTo||null;
  d.workpaperBasis=record.workpaperBasis||null;
  d.proposedAgainstTaxCents=record.proposedAgainstTaxCents??null;
 }
 return d;
}
export const listAgencyCases=onCall(opts,async req=>{
 const user=await actor(req);
 const col=db().collection("agencyCases");
 const date=await simulationDate();
 const overdue=employee(user)&&req.data?.overdueOnly===true;
 const snap=overdue?await col.where("dueDate","<",date).get():employee(user)?await col.orderBy("createdAt","desc").limit(200).get():
  await col.where("taxpayerId","==",user.taxpayerId).limit(200).get();
 const cases=snap.docs.filter(d=>(employee(user)||canAccessTaxpayerRecord(user,d.data()))&&(d.data().kind!=="investigation"||AUDITORS.includes(user.role))).map(d=>({...caseSummary(d.data(),d.id),...(employee(user)?{assignedTo:d.data().assignedTo||null}:{})}));
 if(overdue){
  const open=cases.filter(c=>!["closed","resolved"].includes(c.status)).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
  return {cases:open.slice(0,200),limit:200,kinds:CASE_TYPES,date,total:open.length};
 }
 cases.sort((x,y)=>String(y.createdAt).localeCompare(String(x.createdAt)));
 return {cases,limit:200,kinds:CASE_TYPES,date};
});
export const getAgencyCase=onCall(opts,async req=>{
 const user=await actor(req),caseId=validateId(req.data?.caseId);
 const snap=await db().collection("agencyCases").doc(caseId).get();
 if(!snap.exists)fail("not-found","Agency case not found.");
 const c=snap.data();if(!canRead(user,c))fail("permission-denied","This case is not available to your account.");
 const [events,notices]=await Promise.all([
  db().collection("agencyCaseEvents").where("caseId","==",caseId).limit(200).get(),
  db().collection("agencyNotices").where("caseId","==",caseId).limit(100).get()
 ]);
 const filtered=events.docs.map(d=>({id:d.id,...d.data()}))
  .filter(v=>employee(user)||v.visibility==="taxpayer")
  .map(v=>({id:v.id,kind:v.kind,body:v.body,visibility:v.visibility,
   actorName:v.actorName,createdAt:v.createdAt?.toDate?.()?.toISOString?.()||null}));
 filtered.sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
 const letters=notices.docs.map(d=>({id:d.id,...d.data()}))
  .map(n=>({id:n.id,caseId:n.caseId,type:n.type,title:n.title,body:n.body,
   issuedByName:n.issuedByName,createdAt:n.createdAt?.toDate?.()?.toISOString?.()||null}))
  .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
 return {case:detailVisible({...c,id:caseId},user),events:filtered,notices:letters};
});
export const createAgencyCase=onCall(opts,async req=>{
 const user=await actor(req),kind=String(req.data?.kind||"");
 if(!CASE_TYPES.includes(kind))fail("invalid-argument","Unknown agency case type.");
 if(!employee(user)&&kind!=="appeal")fail("permission-denied","Citizens may file appeals only.");
 if(kind==="investigation")permit(user,AUDITORS);
 const title=required(req.data?.title,"Case subject",5,140);
 const summary=required(req.data?.summary,"Opening statement",25,2500);
 const accountKey=validateId(req.data?.taxAccountId);
 const acctSnap=await db().collection("treasuryAccounts").doc(accountKey).get();
 if(!acctSnap.exists)fail("not-found","An accepted tax assessment is required to open a case.");
 const acct=deriveAccount(acctSnap.data());
 if(!employee(user)&&(!canAccessTaxpayerRecord(user,acct)))
  fail("permission-denied","You may appeal only your own tax account.");
 if(kind==="collection"&&acct.outstandingCents<=0)fail("failed-precondition","No collectible assessed balance exists.");
 if(kind==="collection"&&acct.collectionHold?.until>=(await simulationDate()))fail("failed-precondition","The account has an active collection hold.");
 const priority=String(req.data?.priority||"standard");
 if(!["standard","priority","urgent"].includes(priority))fail("invalid-argument","Invalid priority.");
 const dueDate=optionalDate(req.data?.dueDate);
 const ref=db().collection("agencyCases").doc(),event=db().collection("agencyCaseEvents").doc();
 const caseNumber="URA-"+{audit:"AUD",appeal:"APL",collection:"COL",investigation:"INV"}[kind]+"-"+acct.taxYear+"-"+ref.id.slice(0,8).toUpperCase();
 const batch=db().batch();
 batch.create(ref,{caseNumber,kind,status:initialCaseStatus(kind),title,summary,
  taxAccountId:accountKey,taxpayerId:acct.taxpayerId,taxpayerName:acct.taxpayerName,
  ownerUid:acct.ownerUid||null,taxYear:acct.taxYear,returnType:acct.returnType,period:acct.period??null,
  priority:employee(user)?priority:"standard",dueDate:employee(user)?dueDate:null,
  assignedTo:null,assignedToName:"",createdBy:user.uid,createdByName:user.displayName,
  createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
  proposalStatus:null,revision:1});
 batch.create(event,timeline(user,ref.id,"opened",summary,
  kind==="appeal"?"taxpayer":"internal"));
 batch.create(db().collection("auditLogs").doc(),audit(user,"Agency case opened",kind+" "+caseNumber,ref.id));
 await batch.commit();
 return {caseId:ref.id,caseNumber};
});
export const addAgencyCaseNote=onCall(opts,async req=>{
 const user=await actor(req),caseId=validateId(req.data?.caseId);
 const body=required(req.data?.body,"Case note",8,2500);
 const ref=db().collection("agencyCases").doc(caseId),snap=await ref.get();
 if(!snap.exists)fail("not-found","Case not found.");
 const c=snap.data();if(!canRead(user,c))fail("permission-denied","Case access denied.");
 if(c.status==="closed")fail("failed-precondition","Closed cases cannot be modified.");
 if(!employee(user)&&(c.kind!=="appeal"||!["submitted","information_requested","under_review"].includes(c.status)))
  fail("permission-denied","Only active taxpayer appeals accept citizen correspondence.");
 const visibility=employee(user)&&req.data?.visibility==="internal"?"internal":"taxpayer";
 const batch=db().batch();
 batch.create(db().collection("agencyCaseEvents").doc(),timeline(user,caseId,"note",body,visibility));
 batch.update(ref,{updatedAt:FieldValue.serverTimestamp()});
 batch.create(db().collection("auditLogs").doc(),audit(user,"Case correspondence recorded","New "+visibility+" case note.",caseId));
 await batch.commit();
 return {ok:true};
});
export const assignAgencyCase=onCall(opts,async req=>{
 const user=await actor(req);permit(user,SUPERVISORS);
 const caseId=validateId(req.data?.caseId),uid=String(req.data?.uid||"");
 if(!/^[A-Za-z0-9_-]{5,130}$/.test(uid))fail("invalid-argument","Invalid staff identity.");
 const ref=db().collection("agencyCases").doc(caseId),employeeRef=db().collection("users").doc(uid);
 await db().runTransaction(async tx=>{
  const [caseSnap,staffSnap]=await Promise.all([tx.get(ref),tx.get(employeeRef)]);
  if(!caseSnap.exists)fail("not-found","Case not found.");
  if(caseSnap.data().status==="closed")fail("failed-precondition","Closed case cannot be assigned.");
  if(!staffSnap.exists||staffSnap.data().status!=="active"||!STAFF.includes(staffSnap.data().role))
   fail("failed-precondition","Select an active agency employee.");
  if(caseSnap.data().kind==="investigation"&&!AUDITORS.includes(staffSnap.data().role))
   fail("permission-denied","Investigation officers require an audit authorization.");
  tx.update(ref,{assignedTo:uid,assignedToName:staffSnap.data().displayName,updatedAt:FieldValue.serverTimestamp()});
  tx.create(db().collection("agencyCaseEvents").doc(),
   timeline(user,caseId,"assignment","Assigned case to "+staffSnap.data().displayName+".","internal"));
  tx.create(db().collection("auditLogs").doc(),audit(user,"Case assignment changed","Assigned to "+staffSnap.data().displayName,caseId));
 });
 return {ok:true};
});
export const advanceAgencyCase=onCall(opts,async req=>{
 const user=await actor(req);permit(user,STAFF);
 const caseId=validateId(req.data?.caseId),status=String(req.data?.status||"");
 const reason=required(req.data?.reason,"Status change reasoning",12,1200);
 const ref=db().collection("agencyCases").doc(caseId);
 await db().runTransaction(async tx=>{
  const snap=await tx.get(ref);if(!snap.exists)fail("not-found","Case not found.");
  const c=snap.data();
  if(c.kind==="investigation")permit(user,AUDITORS);
  if(!canAdvance(c.kind,c.status,status))
   fail("failed-precondition","This state change is not permitted.");
  if(c.proposalStatus==="pending"&&["closed","resolved"].includes(status))
   fail("failed-precondition","Resolve the pending financial adjustment first.");
  let collectionClosure=null;
  const accountRef=db().collection("treasuryAccounts").doc(c.taxAccountId);
  const ending=["closed","resolved"].includes(status);
  const account=(c.kind==="collection"||c.kind==="appeal"&&ending)?(await tx.get(accountRef)).data():null;
  if(c.kind==="collection"&&!ending&&account?.collectionHold?.until>=(await simulationDate(tx)))
   fail("failed-precondition","Release the active collection hold before progressing this case.");
  if(c.kind==="collection"&&ending){
   if(!account)fail("not-found","Collection account is unavailable.");
   if(status==="resolved"&&deriveAccount(account).outstandingCents>0)
    fail("failed-precondition","A collection case can be marked resolved only after the assessed balance is cleared.");
   if(!c.collectionClosure)collectionClosure={reason,outstandingCents:account.outstandingCents,
    assessedCents:account.assessedCents,paidCents:account.directPaymentsCents,at:FieldValue.serverTimestamp(),officer:user.displayName};
  }
  if(account?.collectionHold&&(account.collectionHold.appealId===caseId||account.collectionHold.caseId===caseId))
   tx.update(accountRef,{collectionHold:null,updatedAt:FieldValue.serverTimestamp()});
  tx.update(ref,{status,updatedAt:FieldValue.serverTimestamp(),...(collectionClosure?{collectionClosure}:{}),
   ...(status==="closed"?{completedAt:FieldValue.serverTimestamp(),resolution:reason}:{})});
  tx.create(db().collection("agencyCaseEvents").doc(),timeline(user,caseId,"status",
   c.status+" → "+status+": "+reason,c.kind==="investigation"?"internal":"taxpayer"));
  tx.create(db().collection("auditLogs").doc(),audit(user,"Agency case status","Changed "+c.caseNumber+" to "+status,caseId));
 });
 return {ok:true,status};
});
export const issueAgencyNotice=onCall(opts,async req=>{
 const user=await actor(req);permit(user,STAFF);
 const caseId=validateId(req.data?.caseId),type=String(req.data?.type||"");
 if(!NOTICE_TYPES.includes(type))fail("invalid-argument","Invalid agency notice category.");
 const title=required(req.data?.title,"Notice title",5,160);
 const body=required(req.data?.body,"Notice body",20,3500);
 const ref=db().collection("agencyCases").doc(caseId),noticeRef=db().collection("agencyNotices").doc();
 await db().runTransaction(async tx=>{
  const snap=await tx.get(ref);if(!snap.exists)fail("not-found","Case not found.");
  const c=snap.data();if(c.status==="closed")fail("failed-precondition","Closed cases cannot issue new notices.");
  if(c.kind==="investigation")permit(user,AUDITORS);
  if(c.kind==="collection"&&type==="collection_notice"){
   const account=(await tx.get(db().collection("treasuryAccounts").doc(c.taxAccountId))).data();
   if(account?.collectionHold?.until>=(await simulationDate(tx)))fail("failed-precondition","The account has an active collection hold.");
  }
  const text="FICTIONAL ROLEPLAY NOTICE — UNIFIED REVENUE AUTHORITY\n\n"+body+
   "\n\nCase reference: "+c.caseNumber+"\nThis document has no legal effect.";
  tx.create(noticeRef,{caseId,caseNumber:c.caseNumber,type,title,body:text,
   ownerUid:c.ownerUid||null,taxpayerName:c.taxpayerName,
   issuedBy:user.uid,issuedByName:user.displayName,createdAt:FieldValue.serverTimestamp()});
  tx.create(db().collection("agencyCaseEvents").doc(),timeline(user,caseId,"notice",
   "Issued notice: "+title,"taxpayer"));
  tx.create(db().collection("auditLogs").doc(),audit(user,"Agency notice issued",title,noticeRef.id));
  tx.update(ref,{updatedAt:FieldValue.serverTimestamp()});
 });
 return {ok:true,noticeId:noticeRef.id};
});
export const proposeAgencyAdjustment=onCall(opts,async req=>{
 const user=await actor(req);permit(user,AUDITORS);
 const caseId=validateId(req.data?.caseId),source=req.data?.workpaperCaseId;
 const reason=required(req.data?.reason,"Proposed adjustment rationale",20,2000);
 const ref=db().collection("agencyCases").doc(caseId);
 await db().runTransaction(async tx=>{
  const snap=await tx.get(ref);if(!snap.exists)fail("not-found","Case not found.");
  const c=snap.data();
  if(c.taxpayerId===user.taxpayerId||c.ownerUid===user.uid)fail("permission-denied","You cannot propose an adjustment to your own account.");
  if(!["audit","appeal"].includes(c.kind)||!["under_review","proposed_adjustment","awaiting_decision"].includes(c.status))
   fail("failed-precondition","Adjustment proposals require an open examination or appeal review.");
  if(c.proposalStatus==="pending")fail("failed-precondition","Resolve the existing proposal before replacing it.");
  const acctSnap=await tx.get(db().collection("treasuryAccounts").doc(c.taxAccountId));
  if(!acctSnap.exists)fail("not-found","Tax account not found.");
  const acct=deriveAccount(acctSnap.data());
  const findings=source?await calculateWorkpaperProposal(tx,c,acct,source):null;
  const amount=findings?.amount??cents(req.data?.revisedTaxDollars);
  if(amount===acct.assessedCents)fail("invalid-argument","The proposed assessed amount must change the existing assessment.");
  const proposalRevision=Number(c.proposalRevision||0)+1;
  tx.update(ref,{status:c.kind==="appeal"?"awaiting_decision":"proposed_adjustment",
   proposalStatus:"pending",proposedTaxDueCents:amount,proposedAgainstTaxCents:acct.assessedCents,
   proposalReason:reason,workpaperBasis:findings,proposalBy:user.uid,proposalByName:user.displayName,proposalRevision,
   updatedAt:FieldValue.serverTimestamp()});
  tx.create(db().collection("agencyCaseEvents").doc(),timeline(user,caseId,"adjustment_proposed",
   "Proposed a revised tax assessment, pending supervisory authorization.","taxpayer",
   {proposedTaxDueCents:amount,oldTaxDueCents:acct.assessedCents}));
  tx.create(db().collection("auditLogs").doc(),audit(user,"Adjustment proposed",reason,caseId));
 });
 return {ok:true};
});
export const determineAgencyAdjustment=onCall(opts,async req=>{
 const user=await actor(req);permit(user,SUPERVISORS);
 const caseId=validateId(req.data?.caseId),decision=String(req.data?.decision||"");
 if(!["approve","deny"].includes(decision))fail("invalid-argument","Choose approve or deny.");
 const reason=required(req.data?.reason,"Determination rationale",20,2000);
 const ref=db().collection("agencyCases").doc(caseId);
 let result;
 await db().runTransaction(async tx=>{
  const snap=await tx.get(ref);if(!snap.exists)fail("not-found","Case not found.");
  const c=snap.data();
  if(c.taxpayerId===user.taxpayerId||c.ownerUid===user.uid)fail("permission-denied","You cannot determine an adjustment to your own account.");
  if(c.proposalStatus!=="pending"||!["audit","appeal"].includes(c.kind))
   fail("failed-precondition","No pending examination adjustment exists.");
  if(c.proposalBy===user.uid&&user.role!=="commissioner")
   fail("permission-denied","A separate approving officer is required.");
  const acctRef=db().collection("treasuryAccounts").doc(c.taxAccountId);
  const acctSnap=await tx.get(acctRef);
  if(!acctSnap.exists)fail("not-found","Treasury account missing.");
  const acct=deriveAccount(acctSnap.data());
  if(decision==="approve"&&acct.assessedCents!==c.proposedAgainstTaxCents)
   fail("failed-precondition","Treasury balance changed after the proposal. Create a new review.");
  const refKey=caseId+"_REV_"+Number(c.proposalRevision||1);
  const delta=decision==="approve"?await postCaseAdjustmentInTx(tx,user,{...c,caseId},c.proposedTaxDueCents,refKey):null;
  tx.update(ref,{proposalStatus:decision==="approve"?"approved":"denied",
   status:decision==="approve"?"resolved":"under_review",
   determinationReason:reason,determinedBy:user.uid,determinedByName:user.displayName,
   determinedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
   ...(delta?{approvedTaxDueCents:delta.newTaxCents,adjustmentJournalId:refKey,
    resolution:"Financial adjustment approved: "+reason}:{})});
  if(decision==="approve"&&acct.collectionHold?.appealId===caseId)tx.update(acctRef,{collectionHold:null});
  if(delta)tx.create(db().collection("agencyCaseAdjustments").doc(refKey),{
   caseId,taxAccountId:c.taxAccountId,taxpayerId:c.taxpayerId,ownerUid:c.ownerUid||null,
   caseNumber:c.caseNumber,oldTaxCents:delta.oldTaxCents,newTaxCents:delta.newTaxCents,
   deltaTaxCents:delta.taxDeltaCents,reason,approvedBy:user.uid,
   createdAt:FieldValue.serverTimestamp()});
  const message=decision==="approve"?
   "Fictional revised tax assessment authorized. Previous assessed tax: "+acct.assessedCents+
   " cents; revised: "+c.proposedTaxDueCents+" cents. Reason: "+reason:
   "Proposed adjustment denied. Reason: "+reason;
  tx.create(db().collection("agencyCaseEvents").doc(),timeline(user,caseId,
   "adjustment_determined",message,"taxpayer"));
  const noticeRef=db().collection("agencyNotices").doc();
  tx.create(noticeRef,{caseId,caseNumber:c.caseNumber,type:"decision",
   title:"Administrative determination — "+c.caseNumber,
   body:"FICTIONAL ROLEPLAY NOTICE — UNIFIED REVENUE AUTHORITY\n\n"+message+
    "\n\nThis notice carries no legal effect.",ownerUid:c.ownerUid||null,
   taxpayerName:c.taxpayerName,issuedBy:user.uid,issuedByName:user.displayName,
   createdAt:FieldValue.serverTimestamp()});
  tx.create(db().collection("auditLogs").doc(),audit(user,"Administrative adjustment determined",
   decision+" — "+reason,caseId));
  result={ok:true,decision,deltaTaxCents:delta?.taxDeltaCents??0};
 });
 return result;
});

export const listAgencyOfficers=onCall(opts,async req=>{
 const user=await actor(req);permit(user,SUPERVISORS);
 const snap=await db().collection("users").where("role","in",STAFF).limit(100).get();
 return {officers:snap.docs.filter(d=>d.data().status==="active").map(d=>({
  uid:d.id,name:d.data().displayName,role:d.data().role
 }))};
});
