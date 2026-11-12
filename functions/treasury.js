// Generation 3: server-authoritative fictional treasury, double-entry accounting,
// taxpayer payments, refund workflow, installment plans, and reconciliation.
import {onCall,HttpsError} from "firebase-functions/v2/https";
import {getFirestore,FieldValue} from "firebase-admin/firestore";
import {
 CHART,ACCOUNT_TYPES,PAYMENT_METHODS,accountId,blankAccount,deriveAccount,
 positiveCents,moneyFromDollars,validateLines,assessmentChange,paymentChange,
 refundChange,reserveRefund,releaseRefund,buildInstallmentSchedule
} from "./lib/treasury-engine.js";

const db=()=>getFirestore();
const opts={cors:true};
const reviewerRoles=["commissioner","supervisor"];
const staffRoles=["commissioner","supervisor","staff","auditor"];
const officeRoles=["commissioner","supervisor","staff"];
function fail(code,message){throw new HttpsError(code,message);}
function id(raw){const s=String(raw||"");if(!/^[A-Za-z0-9_-]{8,130}$/.test(s))fail("invalid-argument","Invalid treasury reference.");return s;}
function note(raw,min=8,max=1000){const text=String(raw||"").trim();if(text.length<min||text.length>max)fail("invalid-argument","A detailed reason or note is required ("+min+"–"+max+" characters).");return text;}
function dateStamp(value){return value?.toDate?.()?.toISOString?.()||null;}
function actorLog(actor,action,detail,targetId){
 return {actorUid:actor.uid,actorName:actor.displayName,action,detail,targetId,
  createdAt:FieldValue.serverTimestamp()};
}
async function currentActor(req){
 if(!req.auth?.uid)fail("unauthenticated","Please sign in.");
 const uid=req.auth.uid,snap=await db().collection("users").doc(uid).get();
 if(!snap.exists||snap.data().status!=="active")fail("permission-denied","Your account is inactive.");
 return {uid,...snap.data()};
}
function permit(actor,roles){if(!roles.includes(actor.role))fail("permission-denied","Not authorized to perform this transaction.");}
function isEmployee(actor){return staffRoles.includes(actor.role);}
function ensureAccountOwner(actor,acct){
 if(!isEmployee(actor)&&(acct.ownerUid!==actor.uid||!actor.taxpayerId||actor.taxpayerId!==acct.taxpayerId))
  fail("permission-denied","This fictional taxpayer account does not belong to you.");
}
function sanitized(obj){return {...obj,id:obj.id,createdAt:dateStamp(obj.createdAt),updatedAt:dateStamp(obj.updatedAt),
 requestedAt:dateStamp(obj.requestedAt),approvedAt:dateStamp(obj.approvedAt),postedAt:dateStamp(obj.postedAt),
 reviewedAt:dateStamp(obj.reviewedAt),disbursedAt:dateStamp(obj.disbursedAt)};}
function journalId(ref,kind){return String(kind)+"_"+String(ref).replace(/[^A-Za-z0-9_-]/g,"_");}
function sumJournal(lines){
 try{return validateLines(lines);}catch(e){fail("internal",e.message);}
}
function postJournal(tx,{id:journalReference,accountRef,actor,kind,description,lines,relatedId}){
 if(!lines.length)return;
 const balance=sumJournal(lines);
 const ref=db().collection("treasuryJournals").doc(journalId(journalReference,kind));
 tx.create(ref,{kind,description,sourceId:relatedId||journalReference,
  taxAccountId:accountRef.id,lines,amountCents:balance.debitCents,
  totalDebitCents:balance.debitCents,totalCreditCents:balance.creditCents,
  actorUid:actor.uid,actorName:actor.displayName,
  postedAt:FieldValue.serverTimestamp(),status:"posted"});
 tx.set(db().collection("treasuryControl").doc("primary"),{
  totalDebitCents:FieldValue.increment(balance.debitCents),
  totalCreditCents:FieldValue.increment(balance.creditCents),
  postedJournals:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp()
 },{merge:true});
 for(const line of lines)tx.set(db().collection("treasuryChart").doc(line.code),{
  code:line.code,name:CHART[line.code].name,classification:CHART[line.code].classification,
  balanceCents:FieldValue.increment(line.debitCents-line.creditCents),
  debitCents:FieldValue.increment(line.debitCents),
  creditCents:FieldValue.increment(line.creditCents),
  updatedAt:FieldValue.serverTimestamp()
 },{merge:true});
}
function saveAccount(tx,ref,old,next){
 tx.set(ref,{
  ...next,
  createdAt:old?.createdAt||FieldValue.serverTimestamp(),
  updatedAt:FieldValue.serverTimestamp()
 },{merge:true});
}
function payableFields(ret){
 return {taxpayerId:ret.taxpayerId,taxpayerName:ret.taxpayerName,
  ownerUid:ret.ownerUid||null,simulated:ret.simulationOrigin==="ura_engine"||ret.simulated===true,
  taxYear:ret.taxYear,returnType:ret.returnType};
}
// Used by the Generation 2 examiner transaction. All reads happen before writes.
// Accepted filings are posted once, and later amendments post only the difference.
export async function postReturnAssessmentInTx(tx,actor,ret,sourceReturnId){
 const key=accountId(ret.taxpayerId,ret.taxYear,ret.returnType);
 const ref=db().collection("treasuryAccounts").doc(key);
 const snap=await tx.get(ref);
 const old=snap.exists?snap.data():blankAccount(payableFields(ret));
 if(old.taxpayerId!==ret.taxpayerId||old.taxYear!==ret.taxYear||old.returnType!==ret.returnType)
  fail("failed-precondition","Conflicting treasury account.");
 let change;
 try{change=assessmentChange(old,ret.calculation);}catch(e){fail("failed-precondition",e.message);}
 const next={...change.next,latestReturnId:sourceReturnId};
 saveAccount(tx,ref,snap.exists?old:null,next);
 postJournal(tx,{id:sourceReturnId,accountRef:ref,actor,kind:"assessment",
  description:"Tax assessment / reported prepayments — "+ret.caseNumber,
  lines:change.lines,relatedId:sourceReturnId});
 return {accountId:key,deltaTaxCents:change.deltaTaxCents};
}
function keyFromArgs(data){try{return accountId(String(data?.taxpayerId||""),Number(data?.taxYear),String(data?.returnType||""));}catch(e){fail("invalid-argument",e.message);}}
async function getAccount(actor,key){
 const ref=db().collection("treasuryAccounts").doc(id(key)),snap=await ref.get();
 if(!snap.exists)fail("not-found","No assessed fictional taxpayer account exists for this year and tax type.");
 const account=deriveAccount(snap.data());
 ensureAccountOwner(actor,account);
 return {ref,account};
}
async function loadData(col,actor,count=200){
 const ref=db().collection(col);
 const snap=isEmployee(actor)?await ref.orderBy("createdAt","desc").limit(count).get():
  await ref.where("ownerUid","==",actor.uid).limit(count).get();
 const items=snap.docs.map(d=>sanitized({id:d.id,...d.data()}));
 items.sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
 return items;
}
export const getTreasuryData=onCall(opts,async req=>{
 const actor=await currentActor(req);
 const [accounts,receipts,refunds,plans]=await Promise.all([
  loadData("treasuryAccounts",actor),
  loadData("treasuryReceipts",actor),
  loadData("treasuryRefunds",actor),
  loadData("treasuryPlans",actor)
 ]);
 const journals=isEmployee(actor)?
  (await db().collection("treasuryJournals").orderBy("postedAt","desc").limit(200).get())
    .docs.map(d=>sanitized({id:d.id,...d.data()})):[];
 return {accounts,receipts,refunds,plans,journals,limit:200,
  disclaimer:"All financial entries are fictional roleplay transactions. No real money changes hands."};
});
export const getTreasuryOverview=onCall(opts,async req=>{
 const actor=await currentActor(req);permit(actor,staffRoles);
 const [charts,control,accountCount,refundRequests,plans]=await Promise.all([
  db().collection("treasuryChart").get(),
  db().collection("treasuryControl").doc("primary").get(),
  db().collection("treasuryAccounts").count().get(),
  db().collection("treasuryRefunds").where("status","==","requested").count().get(),
  db().collection("treasuryPlans").where("status","==","requested").count().get()
 ]);
 const chart={};for(const entry of charts.docs)chart[entry.id]=entry.data();
 const totals=control.exists?control.data():{totalDebitCents:0,totalCreditCents:0,postedJournals:0};
 const chartBalance=Object.values(chart).reduce((n,v)=>n+(v.balanceCents||0),0);
 return {chart,control:totals,accountCount:accountCount.data().count,
  pendingRefunds:refundRequests.data().count,pendingPlans:plans.data().count,
  balanced:(totals.totalDebitCents||0)===(totals.totalCreditCents||0)&&chartBalance===0,
  chartBalanceCents:chartBalance};
});
export const recordTreasuryPayment=onCall(opts,async req=>{
 const actor=await currentActor(req),accountKey=keyFromArgs(req.data);
 const method=String(req.data?.method||"simulated_transfer");
 if(!PAYMENT_METHODS.includes(method))fail("invalid-argument","Unknown simulated payment method.");
 let amount;
 try{amount=moneyFromDollars(req.data?.amount,"Payment");}catch(e){fail("invalid-argument",e.message);}
 const description=note(req.data?.description||"Fictional taxpayer remittance",8,350);
 const receiptRef=db().collection("treasuryReceipts").doc();
 const acctRef=db().collection("treasuryAccounts").doc(accountKey);
 const actorOwn=isEmployee(actor);
 let result;
 await db().runTransaction(async tx=>{
  const accountSnap=await tx.get(acctRef);
  if(!accountSnap.exists)fail("not-found","Tax account not found.");
  const old=deriveAccount(accountSnap.data());
  ensureAccountOwner(actor,old);
  if(amount>old.outstandingCents)fail("failed-precondition","Payment cannot exceed the remaining assessed balance.");
  if(old.outstandingCents<=0)fail("failed-precondition","There is no outstanding assessment to pay.");
  const planRef=old.activePlanId?db().collection("treasuryPlans").doc(old.activePlanId):null;
  const planSnap=planRef?await tx.get(planRef):null;
  if(planRef&&(!planSnap.exists||planSnap.data().status!=="active"))
   fail("failed-precondition","Active installment plan could not be reconciled.");
  let change;try{change=paymentChange(old,amount);}catch(e){fail("failed-precondition",e.message);}
  const next={...change.next,updatedAt:FieldValue.serverTimestamp()};
  if(planSnap){
   const plan=planSnap.data(),paid=Number(plan.paidCents||0)+amount;
   tx.update(planRef,{paidCents:paid,status:paid>=plan.amountCents?"completed":"active",
    updatedAt:FieldValue.serverTimestamp()});
   if(paid>=plan.amountCents)next.activePlanId=null;
  }
  saveAccount(tx,acctRef,old,next);
  tx.create(receiptRef,{taxAccountId:accountKey,ownerUid:old.ownerUid||null,taxpayerId:old.taxpayerId,
   taxpayerName:old.taxpayerName,taxYear:old.taxYear,returnType:old.returnType,
   amountCents:amount,method,description,kind:"payment",status:"posted",
   recordedBy:actor.uid,recordedByName:actor.displayName,
   createdAt:FieldValue.serverTimestamp(),postedAt:FieldValue.serverTimestamp()});
  postJournal(tx,{id:receiptRef.id,accountRef:acctRef,actor,kind:"payment",
   description:"Simulated remittance "+receiptRef.id,lines:change.lines,relatedId:receiptRef.id});
  tx.create(db().collection("auditLogs").doc(),actorLog(actor,"Treasury payment posted",
   "Posted fictional "+amount+"-cent payment to "+accountKey,receiptRef.id));
  result={ok:true,receiptId:receiptRef.id,newOutstandingCents:change.next.outstandingCents};
 });
 return result;
});
export const requestTreasuryRefund=onCall(opts,async req=>{
 const actor=await currentActor(req),key=keyFromArgs(req.data);
 const acctRef=db().collection("treasuryAccounts").doc(key),ref=db().collection("treasuryRefunds").doc();
 let amount;try{amount=moneyFromDollars(req.data?.amount,"Refund request");}catch(e){fail("invalid-argument",e.message);}
 const reason=note(req.data?.reason,10,1000);
 await db().runTransaction(async tx=>{
  const snap=await tx.get(acctRef);
  if(!snap.exists)fail("not-found","No accepted tax assessment for this taxpayer.");
  const acct=deriveAccount(snap.data());ensureAccountOwner(actor,acct);
  if(amount>acct.refundAvailableCents)fail("failed-precondition","Requested refund exceeds available credits.");
  tx.create(ref,{taxAccountId:key,taxpayerId:acct.taxpayerId,ownerUid:acct.ownerUid||null,
   taxpayerName:acct.taxpayerName,taxYear:acct.taxYear,returnType:acct.returnType,
   amountCents:amount,reason,status:"requested",
   requestedBy:actor.uid,requestedByName:actor.displayName,
   createdAt:FieldValue.serverTimestamp(),requestedAt:FieldValue.serverTimestamp()});
  tx.create(db().collection("auditLogs").doc(),actorLog(actor,"Refund requested",
   "Filed fictional refund request for "+amount+" cents.",ref.id));
 });
 return {ok:true,refundId:ref.id};
});
export const decideTreasuryRefund=onCall(opts,async req=>{
 const actor=await currentActor(req);permit(actor,reviewerRoles);
 const refundId=id(req.data?.refundId),decision=String(req.data?.decision||"");
 if(!["approve","deny"].includes(decision))fail("invalid-argument","Choose approve or deny.");
 const reason=note(req.data?.reason,12,1000);
 const requestRef=db().collection("treasuryRefunds").doc(refundId);
 await db().runTransaction(async tx=>{
  const snap=await tx.get(requestRef);
  if(!snap.exists||snap.data().status!=="requested")fail("failed-precondition","Only pending refund requests can be decided.");
  const request=snap.data();
  if(request.requestedBy===actor.uid&&actor.role!=="commissioner")
   fail("permission-denied","An independent supervisor must review your own request.");
  const acctRef=db().collection("treasuryAccounts").doc(request.taxAccountId);
  const accountSnap=await tx.get(acctRef);
  if(!accountSnap.exists)fail("failed-precondition","Associated taxpayer account missing.");
  const old=deriveAccount(accountSnap.data());
  if(decision==="approve"){
   let next;
   try{next=reserveRefund(old,request.amountCents);}catch(e){fail("failed-precondition",e.message);}
   saveAccount(tx,acctRef,old,next);
  }
  tx.update(requestRef,{status:decision==="approve"?"authorized":"denied",
   reviewReason:reason,reviewedBy:actor.uid,reviewedByName:actor.displayName,
   reviewedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
   selfReviewOverride:request.requestedBy===actor.uid});
  tx.create(db().collection("auditLogs").doc(),actorLog(actor,"Refund determination",
   decision+" — "+reason,refundId));
 });
 return {ok:true};
});
export const disburseTreasuryRefund=onCall(opts,async req=>{
 const actor=await currentActor(req);permit(actor,reviewerRoles);
 const refundId=id(req.data?.refundId),reason=note(req.data?.reason,12,1000);
 const requestRef=db().collection("treasuryRefunds").doc(refundId);
 await db().runTransaction(async tx=>{
  const snap=await tx.get(requestRef);
  if(!snap.exists||snap.data().status!=="authorized")fail("failed-precondition","Refund must be authorized first.");
  const refund=snap.data();
  if(refund.reviewedBy===actor.uid&&actor.role!=="commissioner")
   fail("permission-denied","Disbursement requires a different authorized officer.");
  const acctRef=db().collection("treasuryAccounts").doc(refund.taxAccountId);
  const accountSnap=await tx.get(acctRef);
  if(!accountSnap.exists)fail("failed-precondition","Taxpayer account not found.");
  const old=deriveAccount(accountSnap.data());
  let change;try{change=refundChange(old,refund.amountCents);}catch(e){fail("failed-precondition",e.message);}
  saveAccount(tx,acctRef,old,change.next);
  tx.update(requestRef,{status:"disbursed",disbursementReason:reason,
   disbursedBy:actor.uid,disbursedByName:actor.displayName,
   disbursedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
   sameOfficerOverride:refund.reviewedBy===actor.uid});
  postJournal(tx,{id:refundId,accountRef:acctRef,actor,kind:"refund",
   description:"Simulated authorized refund "+refundId,lines:change.lines,relatedId:refundId});
  tx.create(db().collection("auditLogs").doc(),actorLog(actor,"Refund disbursed",
   "Simulated payment of "+refund.amountCents+" cents. "+reason,refundId));
 });
 return {ok:true};
});
export const requestTreasuryPlan=onCall(opts,async req=>{
 const actor=await currentActor(req),key=keyFromArgs(req.data);
 const count=Number(req.data?.installmentCount);
 const reason=note(req.data?.reason,10,1000);
 const acctRef=db().collection("treasuryAccounts").doc(key),planRef=db().collection("treasuryPlans").doc();
 const start=new Date();start.setUTCMonth(start.getUTCMonth()+1);const firstDueDate=start.toISOString().slice(0,10);
 await db().runTransaction(async tx=>{
  const snap=await tx.get(acctRef);
  if(!snap.exists)fail("not-found","Tax account not found.");
  const old=deriveAccount(snap.data());ensureAccountOwner(actor,old);
  if(old.outstandingCents<=0)fail("failed-precondition","No outstanding balance requires an installment plan.");
  if(old.pendingPlanId||old.activePlanId)fail("failed-precondition","This tax account already has a requested or active plan.");
  let schedule;
  try{schedule=buildInstallmentSchedule(old.outstandingCents,count,firstDueDate);}
  catch(e){fail("invalid-argument",e.message);}
  tx.update(acctRef,{pendingPlanId:planRef.id,updatedAt:FieldValue.serverTimestamp()});
  tx.create(planRef,{taxAccountId:key,ownerUid:old.ownerUid||null,
   taxpayerId:old.taxpayerId,taxpayerName:old.taxpayerName,taxYear:old.taxYear,
   returnType:old.returnType,status:"requested",amountCents:old.outstandingCents,
   installmentCount:count,schedule,paidCents:0,firstDueDate,reason,
   createdAt:FieldValue.serverTimestamp(),requestedBy:actor.uid,requestedByName:actor.displayName});
  tx.create(db().collection("auditLogs").doc(),actorLog(actor,"Payment arrangement requested",
   "Requested "+count+" installments for "+key,planRef.id));
 });
 return {ok:true,planId:planRef.id};
});
export const decideTreasuryPlan=onCall(opts,async req=>{
 const actor=await currentActor(req);permit(actor,reviewerRoles);
 const planId=id(req.data?.planId),action=String(req.data?.decision||"");
 if(!["approve","deny"].includes(action))fail("invalid-argument","Choose approve or deny.");
 const reason=note(req.data?.reason,12,1000),ref=db().collection("treasuryPlans").doc(planId);
 await db().runTransaction(async tx=>{
  const snap=await tx.get(ref);
  if(!snap.exists||snap.data().status!=="requested")fail("failed-precondition","Plan must be pending.");
  const plan=snap.data();
  if(plan.requestedBy===actor.uid&&actor.role!=="commissioner")
   fail("permission-denied","Independent approval is required for staff requests.");
  const acctRef=db().collection("treasuryAccounts").doc(plan.taxAccountId);
  const accountSnap=await tx.get(acctRef);
  if(!accountSnap.exists||accountSnap.data().pendingPlanId!==planId)
   fail("failed-precondition","Plan is not linked to the pending tax account.");
  const acct=deriveAccount(accountSnap.data());
  if(action==="approve"&&(acct.outstandingCents!==plan.amountCents||acct.activePlanId))
   fail("failed-precondition","Tax balance changed. Request a new plan with current figures.");
  tx.update(acctRef,{pendingPlanId:null,
   ...(action==="approve"?{activePlanId:planId}:{}),
   updatedAt:FieldValue.serverTimestamp()});
  tx.update(ref,{status:action==="approve"?"active":"denied",decisionReason:reason,
   reviewedBy:actor.uid,reviewedAt:FieldValue.serverTimestamp(),
   updatedAt:FieldValue.serverTimestamp()});
  tx.create(db().collection("auditLogs").doc(),actorLog(actor,"Payment arrangement determination",
   action+" — "+reason,planId));
 });
 return {ok:true};
});
export const reconcileTreasury=onCall(opts,async req=>{
 const actor=await currentActor(req);permit(actor,["commissioner","supervisor","auditor"]);
 const noteText=note(req.data?.notes||"General ledger balancing review",8,500);
 const [control,chart]=await Promise.all([
  db().collection("treasuryControl").doc("primary").get(),db().collection("treasuryChart").get()
 ]);
 const totals=control.exists?control.data():{};
 const balance=chart.docs.reduce((n,d)=>n+Number(d.data().balanceCents||0),0);
 const debit=Number(totals.totalDebitCents||0),credit=Number(totals.totalCreditCents||0);
 const balanced=debit===credit&&balance===0;
 const ref=db().collection("treasuryReconciliations").doc();
 const batch=db().batch();
 batch.create(ref,{balanced,totalDebitCents:debit,totalCreditCents:credit,
  chartNetCents:balance,postedJournals:Number(totals.postedJournals||0),
  notes:noteText,performedBy:actor.uid,performedByName:actor.displayName,
  createdAt:FieldValue.serverTimestamp()});
 batch.create(db().collection("auditLogs").doc(),actorLog(actor,"Treasury reconciliation",
  balanced?"General ledger balances verified.":"General ledger imbalance detected.",ref.id));
 await batch.commit();
 return {ok:true,reconciliationId:ref.id,balanced,totalDebitCents:debit,
  totalCreditCents:credit,chartNetCents:balance,
  note:"This verifies stored general-ledger controls, not external bank settlement."};
});

// Generation 4: attach a formally authorized audit/appeals adjustment to the same
// balanced Treasury ledger. Invoked inside a Firestore transaction before any writes.
export async function postCaseAdjustmentInTx(tx,actor,caseRecord,newTaxDueCents,reference){
 const acctRef=db().collection("treasuryAccounts").doc(caseRecord.taxAccountId);
 const snap=await tx.get(acctRef);
 if(!snap.exists)fail("not-found","Underlying tax account not found.");
 const previous=deriveAccount(snap.data());
 if(previous.taxpayerId!==caseRecord.taxpayerId)fail("failed-precondition","Mismatch in case-linked account.");
 let change;
 try{change=assessmentChange(previous,{taxDueCents:newTaxDueCents,paymentsCents:previous.declaredPaymentsCents});}
 catch(e){fail("failed-precondition",e.message);}
 saveAccount(tx,acctRef,previous,{...change.next,latestCaseAdjustmentId:reference});
 postJournal(tx,{id:reference,accountRef:acctRef,actor,kind:"case_adjustment",
  description:"Approved administrative tax adjustment — "+caseRecord.caseNumber,
  lines:change.lines,relatedId:reference});
 return {oldTaxCents:previous.assessedCents,newTaxCents:change.next.assessedCents,
  taxDeltaCents:change.deltaTaxCents,accountId:acctRef.id};
}


// Generation 4 correction workflow: release authorized but unpaid fictional refunds
// so an administrative reassessment does not conflict with a reserved credit.
export const cancelTreasuryRefund=onCall(opts,async req=>{
 const actor=await currentActor(req);permit(actor,reviewerRoles);
 const refundId=id(req.data?.refundId),reason=note(req.data?.reason,12,1000);
 const refundRef=db().collection("treasuryRefunds").doc(refundId);
 await db().runTransaction(async tx=>{
  const snap=await tx.get(refundRef);
  if(!snap.exists||snap.data().status!=="authorized")
   fail("failed-precondition","Only an authorized and unpaid refund can be cancelled.");
  const refund=snap.data(),accountRef=db().collection("treasuryAccounts").doc(refund.taxAccountId);
  const accountSnap=await tx.get(accountRef);
  if(!accountSnap.exists)fail("not-found","Associated tax account not found.");
  const old=deriveAccount(accountSnap.data());
  let next;try{next=releaseRefund(old,refund.amountCents);}catch(e){fail("failed-precondition",e.message);}
  saveAccount(tx,accountRef,old,next);
  tx.update(refundRef,{status:"cancelled",cancellationReason:reason,
   cancelledBy:actor.uid,cancelledAt:FieldValue.serverTimestamp(),
   updatedAt:FieldValue.serverTimestamp()});
  tx.create(db().collection("auditLogs").doc(),actorLog(actor,"Refund authorization cancelled",
   reason,refundId));
 });
 return {ok:true};
});
