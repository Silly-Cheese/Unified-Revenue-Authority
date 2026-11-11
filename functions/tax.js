// Generation 2: fictional taxation, filing, assessments, review and policy administration.
// The server is authoritative; no browser writes returns or assessments to Firestore.
import {onCall,HttpsError} from "firebase-functions/v2/https";
import {postReturnAssessmentInTx} from "./treasury.js";
import {getFirestore,FieldValue} from "firebase-admin/firestore";
import {TAX_YEARS,defaultPolicy,validatePolicy,normalizeReturnData,calculateReturn,ensureType,ensureYear} from "./lib/tax-engine.js";
const opts={cors:true};
function db(){return getFirestore();}
function fail(code,message){throw new HttpsError(code,message);}
function requireAuth(req){if(!req.auth?.uid)fail("unauthenticated","Please sign in.");return req.auth.uid;}
async function currentActor(req){
 const uid=requireAuth(req);
 const snap=await db().collection("users").doc(uid).get();
 if(!snap.exists||snap.data().status!=="active")fail("permission-denied","Inactive account.");
 return {uid,...snap.data()};
}
function allowed(actor,roles){if(!roles.includes(actor.role))fail("permission-denied","Insufficient permissions.");}
const staffRoles=["commissioner","supervisor","staff","auditor"];
const reviewerRoles=["commissioner","supervisor","staff"];
const isStaff=(actor)=>staffRoles.includes(actor.role);
const policyKey=(year,type)=>String(year)+"_"+type;
const originalId=(taxpayerId,year,type)=>taxpayerId+"_"+year+"_"+type+"_original";
const ensureId=(id)=>{if(typeof id!=="string"||!/^[a-zA-Z0-9_-]{20,125}$/.test(id))fail("invalid-argument","Invalid case reference.");return id;};
function audit(actor,action,detail,targetId){
 return {actorUid:actor.uid,actorName:actor.displayName,action,detail,targetId:targetId||null,createdAt:FieldValue.serverTimestamp()};
}
function cleanMessage(raw){
 const note=String(raw||"").trim();
 if(note.length<12||note.length>1500)fail("invalid-argument","Enter a specific decision reason (12–1,500 characters).");
 return note;
}
async function loadPolicy(year,type){
 year=ensureYear(year);type=ensureType(type);
 const snap=await db().collection("taxPolicies").doc(policyKey(year,type)).get();
 return snap.exists?validatePolicy(snap.data()):defaultPolicy(year,type);
}
function publicReturn(record,id){
 // Return data is fictional; internal operational audit details are not included in the taxpayer view.
 return {id,caseNumber:record.caseNumber||id,returnType:record.returnType,
  taxYear:record.taxYear,taxpayerId:record.taxpayerId,taxpayerName:record.taxpayerName,
  status:record.status,ownerUid:record.ownerUid,createdBy:record.createdBy,
  data:record.data,calculation:record.calculation,policySnapshot:record.policySnapshot,
  submittedAt:record.submittedAt,updatedAt:record.updatedAt,createdAt:record.createdAt,
  decisionReason:record.decisionReason||"",reviewedAt:record.reviewedAt||null,
  reviewerName:record.reviewerName||"",amendedFrom:record.amendedFrom||null,
  amendmentNumber:record.amendmentNumber||0,revision:record.revision||0,
  assessmentId:record.assessmentId||null};
}
const encodeTime=(value)=>value?.toDate?.()?.toISOString?.()||null;
function serializeReturn(r){
 for(const key of ["submittedAt","createdAt","updatedAt","reviewedAt"])r[key]=encodeTime(r[key]);
 return r;
}
function serializeAssessment(id,d){
 return {id,caseNumber:d.caseNumber,taxpayerName:d.taxpayerName,taxYear:d.taxYear,
  returnType:d.returnType,sourceReturnId:d.sourceReturnId,ownerUid:d.ownerUid,
  taxDueCents:d.taxDueCents,refundClaimCents:d.refundClaimCents,balanceCents:d.balanceCents,
  deltaTaxCents:d.deltaTaxCents,adjustmentKind:d.adjustmentKind,
  createdAt:encodeTime(d.createdAt)};
}
async function taxpayerFor(actor,taxpayerId){
 const ref=db().collection("taxpayers").doc(ensureId(taxpayerId));
 const snap=await ref.get();
 if(!snap.exists||snap.data().status!=="active")fail("not-found","Active taxpayer account not found.");
 if(!isStaff(actor)&&(snap.data().ownerUid!==actor.uid||actor.taxpayerId!==taxpayerId))
  fail("permission-denied","You can file only for your own taxpayer account.");
 return {ref,...snap.data()};
}
export const getTaxCatalog=onCall(opts,async req=>{
 await currentActor(req);
 const docs=await db().collection("taxPolicies").get();
 const custom=new Map(docs.docs.map(d=>[d.id,d.data()]));
 const policies=[];
 for(const year of TAX_YEARS){
  for(const type of ["individual","business"]){
   const id=policyKey(year,type),saved=custom.get(id);
   policies.push({id,policy:saved?validatePolicy(saved):defaultPolicy(year,type),locked:!!saved?.lockedAt,
    customized:!!saved,lockedAt:saved?.lockedAt?.toDate?.()?.toISOString?.()||null});
  }
 }
 return {years:TAX_YEARS,policies,disclaimer:"All rates and documents are fictional roleplay simulations, not real tax law."};
});
export const setTaxPolicy=onCall(opts,async req=>{
 const actor=await currentActor(req);allowed(actor,["commissioner"]);
 let next;
 try{next=validatePolicy(req.data?.policy);}catch(e){fail("invalid-argument",e.message);}
 const ref=db().collection("taxPolicies").doc(policyKey(next.year,next.type));
 await db().runTransaction(async tx=>{
  const snap=await tx.get(ref);
  if(snap.exists&&snap.data().lockedAt)fail("failed-precondition","This year's tax policy is locked because a return was submitted. Make a policy for another year.");
  const version=(snap.exists?Number(snap.data().version)||0:0)+1;
  tx.set(ref,{...next,version,lockedAt:null,updatedAt:FieldValue.serverTimestamp(),updatedBy:actor.uid});
  tx.create(db().collection("auditLogs").doc(),audit(actor,"Tax policy updated","Updated "+next.type+" simulation rules for "+next.year+".",ref.id));
 });
 return {ok:true};
});
export const previewTaxReturn=onCall(opts,async req=>{
 const actor=await currentActor(req);
 let year,type,computed,cleaned;
 try{
  year=ensureYear(req.data?.taxYear);type=ensureType(req.data?.returnType);
  const policy=await loadPolicy(year,type);
  cleaned=normalizeReturnData(type,req.data?.data);
  computed=calculateReturn(policy,cleaned);
  return {calculation:computed,policy,normalized:cleaned};
 }catch(e){if(e instanceof HttpsError)throw e;fail("invalid-argument",e.message);}
});
export const saveTaxDraft=onCall(opts,async req=>{
 const actor=await currentActor(req);
 let year,type,normalized;
 try{
  year=ensureYear(req.data?.taxYear);type=ensureType(req.data?.returnType);
  normalized=normalizeReturnData(type,req.data?.data);
 }catch(e){fail("invalid-argument",e.message);}
 const taxpayerId=String(req.data?.taxpayerId||actor.taxpayerId||"");
 const taxpayer=await taxpayerFor(actor,taxpayerId);
 const original=originalId(taxpayerId,year,type);
 const requestedId=req.data?.returnId?ensureId(req.data.returnId):original;
 const ref=db().collection("taxReturns").doc(requestedId);
 const policy=await loadPolicy(year,type);
 let calculation;
 try{calculation=calculateReturn(policy,normalized);}catch(e){fail("invalid-argument",e.message);}
 await db().runTransaction(async tx=>{
  const existing=await tx.get(ref);
  if(!existing.exists&&requestedId!==original)
   fail("failed-precondition","Start an amendment from an accepted return before editing.");
  if(existing.exists){
   const previous=existing.data();
   if(previous.taxpayerId!==taxpayerId||previous.taxYear!==year||previous.returnType!==type)
    fail("permission-denied","Cannot change the taxpayer account or filing year.");
   if(!["draft","information_requested","rejected"].includes(previous.status))
    fail("failed-precondition","This return is already filed. Use the amendment workflow instead.");
   if(!isStaff(actor)&&previous.ownerUid!==actor.uid)fail("permission-denied","Not your return.");
  }
  const base={data:normalized,calculation,policySnapshot:policy,
   updatedAt:FieldValue.serverTimestamp(),lastEditedBy:actor.uid};
  if(existing.exists)tx.update(ref,{...base,revision:FieldValue.increment(1)});
  else tx.create(ref,{...base,revision:1,returnType:type,taxYear:year,taxpayerId,
    taxpayerName:taxpayer.fullName,ownerUid:taxpayer.ownerUid||null,
    createdBy:actor.uid,createdAt:FieldValue.serverTimestamp(),status:"draft",
    amendmentNumber:0,caseNumber:"RET-"+year+"-"+ref.id.slice(0,8).toUpperCase()});
  tx.create(db().collection("auditLogs").doc(),
   audit(actor,"Return draft saved","Saved "+year+" "+type+" draft for "+taxpayer.fullName+".",ref.id));
 });
 return {ok:true,returnId:ref.id,calculation};
});
export const submitTaxReturn=onCall(opts,async req=>{
 const actor=await currentActor(req);
 const id=ensureId(req.data?.returnId),ref=db().collection("taxReturns").doc(id);
 const initial=await ref.get();
 if(!initial.exists)fail("not-found","Draft return does not exist.");
 if(!isStaff(actor)&&initial.data().ownerUid!==actor.uid)fail("permission-denied","Not your return.");
 const policyRef=db().collection("taxPolicies").doc(policyKey(initial.data().taxYear,initial.data().returnType));
 const auditRef=db().collection("auditLogs").doc();
 let output;
 await db().runTransaction(async tx=>{
  const [snap,policySnap]=await Promise.all([tx.get(ref),tx.get(policyRef)]);
  if(!snap.exists)fail("not-found","Draft not found.");
  const entry=snap.data();
  if(!["draft","information_requested","rejected"].includes(entry.status))
   fail("failed-precondition","This return has already been submitted.");
  if(!isStaff(actor)&&entry.ownerUid!==actor.uid)fail("permission-denied","Not your return.");
  if(!entry.data?.attested)fail("failed-precondition","The fictional tax declaration must be acknowledged before submitting.");
  const policy=policySnap.exists?validatePolicy(policySnap.data()):defaultPolicy(entry.taxYear,entry.returnType);
  let calculation;
  try{calculation=calculateReturn(policy,entry.data);}catch(e){fail("invalid-argument",e.message);}
  if(!policySnap.exists){
   tx.create(policyRef,{...policy,lockedAt:FieldValue.serverTimestamp(),lockedByReturnId:id,
    updatedAt:FieldValue.serverTimestamp(),updatedBy:"system"});
  }else if(!policySnap.data().lockedAt){
   tx.update(policyRef,{lockedAt:FieldValue.serverTimestamp(),lockedByReturnId:id});
  }
  tx.update(ref,{status:"submitted",calculation,policySnapshot:policy,
   submittedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
   submittedBy:actor.uid,submissionCount:FieldValue.increment(1),decisionReason:""});
  tx.create(auditRef,audit(actor,"Return submitted","Submitted "+entry.taxYear+" "+entry.returnType+" case "+entry.caseNumber+".",id));
  output={ok:true,returnId:id,calculation};
 });
 return output;
});
export const listTaxReturns=onCall(opts,async req=>{
 const actor=await currentActor(req);
 const collection=db().collection("taxReturns");
 const snapshots=isStaff(actor)?
  await collection.orderBy("updatedAt","desc").limit(250).get():
  await collection.where("ownerUid","==",actor.uid).limit(250).get();
 const items=snapshots.docs.map(d=>serializeReturn(publicReturn(d.data(),d.id)));
 items.sort((a,b)=>String(b.updatedAt||"").localeCompare(String(a.updatedAt||"")));
 return {items,totalReturned:items.length,limit:250};
});
export const reviewTaxReturn=onCall(opts,async req=>{
 const actor=await currentActor(req);allowed(actor,reviewerRoles);
 const id=ensureId(req.data?.returnId),action=String(req.data?.action||"");
 if(!["accept","request_information","reject"].includes(action))
  fail("invalid-argument","Choose an authorized examiner determination.");
 const reason=cleanMessage(req.data?.reason),ref=db().collection("taxReturns").doc(id);
 const assessmentRef=db().collection("taxAssessments").doc(id);
 let result;
 await db().runTransaction(async tx=>{
  const snap=await tx.get(ref);
  if(!snap.exists)fail("not-found","Return not found.");
  const ret=snap.data();
  if(ret.status!=="submitted")fail("failed-precondition","Only a submitted return can be determined.");
  if(ret.ownerUid===actor.uid)fail("permission-denied","You cannot authorize your own taxpayer filing.");
  const sourceRef=ret.amendedFrom?db().collection("taxReturns").doc(ret.amendedFrom):null;
  const rootSnap=sourceRef?await tx.get(sourceRef):null;
  if(ret.amendedFrom&&(!rootSnap?.exists||rootSnap.data().status!=="accepted"))
    fail("failed-precondition","The source return must be accepted before an amendment can be determined.");
  const decision=action==="accept"?"accepted":action==="request_information"?"information_requested":"rejected";
  // Before the first write, link accepted cases to the balanced simulated ledger.
  // This also validates amendments against existing refund reservations and payments.
  const financialPost=action==="accept"?await postReturnAssessmentInTx(tx,actor,ret,id):null;
  const change={status:decision,decisionReason:reason,reviewerUid:actor.uid,reviewerName:actor.displayName,
   reviewedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()};
  tx.update(ref,change);
  if(action==="accept"){
   const nextTax=ret.calculation.taxDueCents;
   tx.create(assessmentRef,{
    sourceReturnId:id,ownerUid:ret.ownerUid||null,taxpayerId:ret.taxpayerId,
    taxpayerName:ret.taxpayerName,caseNumber:ret.caseNumber,taxYear:ret.taxYear,
    returnType:ret.returnType,policyVersion:ret.policySnapshot.version,treasuryAccountId:financialPost.accountId,
    taxDueCents:nextTax,refundClaimCents:ret.calculation.refundCents,
    balanceCents:ret.calculation.balanceCents,deltaTaxCents:financialPost.deltaTaxCents,
    adjustmentKind:ret.amendedFrom?"amendment":"initial",
    createdBy:actor.uid,createdAt:FieldValue.serverTimestamp()
   });
   tx.update(ref,{assessmentId:id,latestAssessedTaxCents:nextTax});
   if(sourceRef)tx.update(sourceRef,{latestAssessedTaxCents:nextTax,lastApprovedAmendmentId:id,
    updatedAt:FieldValue.serverTimestamp()});
  }
  tx.create(db().collection("auditLogs").doc(),audit(actor,"Return determination",
   action+" — "+ret.caseNumber+": "+reason,id));
  result={ok:true,status:decision,assessmentId:action==="accept"?id:null};
 });
 return result;
});
export const beginTaxAmendment=onCall(opts,async req=>{
 const actor=await currentActor(req),id=ensureId(req.data?.returnId);
 const ref=db().collection("taxReturns").doc(id),assessment=db().collection("taxAssessments").doc(id);
 let result;
 await db().runTransaction(async tx=>{
  const original=await tx.get(ref),assessed=await tx.get(assessment);
  if(!original.exists||original.data().status!=="accepted"||!assessed.exists)
   fail("failed-precondition","Only an accepted, assessed return may be amended.");
  const r=original.data();
  if(r.amendedFrom)fail("failed-precondition","Start later amendments from the original return.");
  if(!isStaff(actor)&&r.ownerUid!==actor.uid)fail("permission-denied","Not your return.");
  const next=Number(r.amendmentCount||0)+1;
  if(next>20)fail("resource-exhausted","Too many amendments for this filing.");
  if(next>1){
   const previous=await tx.get(db().collection("taxReturns").doc(id+"_A"+(next-1)));
   if(!previous.exists||previous.data().status!=="accepted")
    fail("failed-precondition","Complete the previous amendment before starting another.");
  }
  const newRef=db().collection("taxReturns").doc(id+"_A"+next);
  const already=await tx.get(newRef);
  if(already.exists)fail("already-exists","An amendment already exists.");
  tx.update(ref,{amendmentCount:next});
  tx.create(newRef,{
   returnType:r.returnType,taxYear:r.taxYear,taxpayerId:r.taxpayerId,
   taxpayerName:r.taxpayerName,ownerUid:r.ownerUid||null,createdBy:actor.uid,
   status:"draft",caseNumber:r.caseNumber+"-A"+next,amendedFrom:id,
   amendmentNumber:next,revision:1,data:r.data,calculation:r.calculation,
   policySnapshot:r.policySnapshot,createdAt:FieldValue.serverTimestamp(),
   updatedAt:FieldValue.serverTimestamp()
  });
  tx.create(db().collection("auditLogs").doc(),audit(actor,"Amendment started",
   "Amendment "+next+" started for "+r.caseNumber+".",newRef.id));
  result={ok:true,returnId:newRef.id};
 });
 return result;
});
export const listTaxAssessments=onCall(opts,async req=>{
 const actor=await currentActor(req),col=db().collection("taxAssessments");
 const snap=isStaff(actor)?await col.orderBy("createdAt","desc").limit(250).get():
  await col.where("ownerUid","==",actor.uid).limit(250).get();
 const items=snap.docs.map(d=>serializeAssessment(d.id,d.data()));
 items.sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
 return {items,limit:250};
});