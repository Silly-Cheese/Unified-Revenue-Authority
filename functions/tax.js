// Generation 2: fictional taxation, filing, assessments, review and policy administration.
// The server is authoritative; no browser writes returns or assessments to Firestore.
import {onCall,HttpsError} from "firebase-functions/v2/https";
import {postReturnAssessmentInTx} from "./treasury.js";
import {canAccessTaxpayerRecord} from "./lib/portal-access.js";
import {FieldPath,getFirestore,FieldValue} from "firebase-admin/firestore";
import {TAX_YEARS,defaultPolicy,validatePolicy,normalizeReturnData,calculateReturn,ensureType,ensureYear} from "./lib/tax-engine.js";
import {defaultSchedule, periodDates} from "./lib/filing-calendar.js";
import {simulationDate} from "./lib/agency-access.js";
import {preserveLegacySubmission, recordDetermination, statementQuery, storeSubmission, withholdingMatch, returnVersions} from "./lib/return-history.js";
const opts={cors:true,invoker:"public"};
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
  assessmentId:record.assessmentId||null,period:record.period??null,filingDue:record.filingDue??null,
  paymentDue:record.paymentDue??null,late:record.late??null,withholdingMatch:record.withholdingMatch||null,
  submittedOn:record.submittedOn||null,amendmentBaseId:record.amendmentBaseId||record.amendedFrom||null,submissionCount:record.submissionCount||(record.submittedAt?1:0)};
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
  deltaTaxCents:d.deltaTaxCents,adjustmentKind:d.adjustmentKind,period:d.period??null,
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
  if(!existing.exists&&requestedId===original){
   const historical=await tx.get(db().collection("taxReturns").where("taxpayerId","==",taxpayerId));
   if(historical.docs.some(doc=>{const row=doc.data();return row.taxYear===year&&row.returnType===type&&!row.amendedFrom;}))
    fail("already-exists","An original filing exists for this period. Reopen the existing filing.");
  }
  if(!existing.exists&&requestedId!==original)
   fail("failed-precondition","Start an amendment from an accepted return before editing.");
  if(existing.exists){
   const previous=existing.data();
   if(previous.taxpayerId!==taxpayerId||previous.taxYear!==year||previous.returnType!==type)
    fail("permission-denied","Cannot change the taxpayer account or filing year.");
   if(!["draft","information_requested","rejected"].includes(previous.status))
    fail("failed-precondition","This return is already filed. Use the amendment workflow instead.");
   if(!isStaff(actor)&&!canAccessTaxpayerRecord(actor,previous))fail("permission-denied","Not your return.");
   await preserveLegacySubmission(tx,ref,previous);
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
 if(!isStaff(actor)&&!canAccessTaxpayerRecord(actor,initial.data()))fail("permission-denied","Not your return.");
 const initialEntry=initial.data();
 if(!["individual","business"].includes(initialEntry.returnType))fail("invalid-argument","Use the business tax filing form for this return.");
 const policyRef=db().collection("taxPolicies").doc(policyKey(initialEntry.taxYear,initialEntry.returnType));
 const scheduleRef=db().collection("filingSchedules").doc(policyRef.id);
 const extensionRef=db().collection("filingExtensions").doc(originalId(initialEntry.taxpayerId,initialEntry.taxYear,initialEntry.returnType));
 const auditRef=db().collection("auditLogs").doc();
 let output;
 await db().runTransaction(async tx=>{
  const [snap,policySnap,schedule,extension,date,statements]=await Promise.all([
   tx.get(ref),tx.get(policyRef),tx.get(scheduleRef),tx.get(extensionRef),simulationDate(tx),
   initialEntry.returnType==="individual"?tx.get(statementQuery(initialEntry.taxpayerId,initialEntry.taxYear)):null
  ]);
  if(!snap.exists)fail("not-found","Draft not found.");
  const entry=snap.data();
  if(!["draft","information_requested","rejected"].includes(entry.status))
   fail("failed-precondition","This return has already been submitted.");
  if(!isStaff(actor)&&!canAccessTaxpayerRecord(actor,entry))fail("permission-denied","Not your return.");
  if(!entry.data?.attested)fail("failed-precondition","The fictional tax declaration must be acknowledged before submitting.");
  const policy=policySnap.exists?validatePolicy(policySnap.data()):defaultPolicy(entry.taxYear,entry.returnType);
  let calculation;
  try{calculation=calculateReturn(policy,entry.data);}catch(e){fail("invalid-argument",e.message);}
  const owner=(await tx.get(db().collection("taxpayers").doc(entry.taxpayerId))).data()?.ownerUid||null;
  await preserveLegacySubmission(tx,ref,entry);
  const matches=statements?.docs.map(d=>d.data()).filter(row=>!row.ownerUid||row.ownerUid===owner)||[];
  const match=matches.length?withholdingMatch(entry.data,matches):null;
  if(match&&(match.wageDifferenceCents<0||match.withholdingDifferenceCents!==0))
   calculation.reviewFlags.push("Reported wages or withholding differ from issued employer statements.");
  const filingSchedule=schedule.data()||defaultSchedule(entry.returnType,entry.taxYear);
  const dates=periodDates(entry.returnType,entry.taxYear,1,filingSchedule);
  const filingDue=entry.filingDue||extension.data()?.filingDue||dates.filingDue;
  const paymentDue=entry.paymentDue||extension.data()?.paymentDue||dates.paymentDue;
  const deadline=extension.data()?.status==="approved"?extension.data().requestedUntil:filingDue;
  const number=Number(entry.submissionCount||(entry.submittedAt?1:0))+1;
  const filed={status:"submitted",calculation,policySnapshot:policy,withholdingMatch:match,
   filingDue,paymentDue,late:entry.amendedFrom?null:date>deadline,submittedOn:date,
   submittedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
   submittedBy:actor.uid,submissionCount:number,decisionReason:"",reviewedAt:null,reviewerName:null};
  storeSubmission(tx,ref,{...entry,...filed},number,actor.uid);
  if(!schedule.data()?.locked)tx.set(scheduleRef,{...filingSchedule,locked:true},{merge:true});
  if(!policySnap.exists){
   tx.create(policyRef,{...policy,lockedAt:FieldValue.serverTimestamp(),lockedByReturnId:id,
    updatedAt:FieldValue.serverTimestamp(),updatedBy:"system"});
  }else if(!policySnap.data().lockedAt){
   tx.update(policyRef,{lockedAt:FieldValue.serverTimestamp(),lockedByReturnId:id});
  }
  tx.update(ref,filed);
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
  await collection.where("taxpayerId","==",actor.taxpayerId).limit(250).get();
 const items=snapshots.docs.filter(d=>isStaff(actor)||canAccessTaxpayerRecord(actor,d.data())).map(d=>serializeReturn(publicReturn(d.data(),d.id)));
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
  if(!["individual","business"].includes(ret.returnType))fail("invalid-argument","Use the business tax determination for this return.");
  if(ret.status!=="submitted")fail("failed-precondition","Only a submitted return can be determined.");
  if(ret.ownerUid===actor.uid||ret.taxpayerId===actor.taxpayerId)fail("permission-denied","You cannot authorize your own taxpayer filing.");
  const sourceRef=ret.amendedFrom?db().collection("taxReturns").doc(ret.amendedFrom):null;
  const rootSnap=sourceRef?await tx.get(sourceRef):null;
  if(ret.amendedFrom&&(!rootSnap?.exists||rootSnap.data().status!=="accepted"))
    fail("failed-precondition","The source return must be accepted before an amendment can be determined.");
  const version=await tx.get(returnVersions(ref).doc(String(ret.submissionCount||1)));
  const decision=action==="accept"?"accepted":action==="request_information"?"information_requested":"rejected";
  // Before the first write, link accepted cases to the balanced simulated ledger.
  // This also validates amendments against existing refund reservations and payments.
  const financialPost=action==="accept"?await postReturnAssessmentInTx(tx,actor,ret,id):null;
  const change={status:decision,decisionReason:reason,reviewerUid:actor.uid,reviewerName:actor.displayName,
   reviewedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()};
  if(!version.exists)storeSubmission(tx,ref,ret,ret.submissionCount||1,ret.submittedBy,ret.submittedAt);
  recordDetermination(tx,ref,ret,decision,reason,actor);
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
  if(!["individual","business"].includes(r.returnType))fail("failed-precondition","Only annual income tax returns can be amended here.");
  if(r.amendedFrom)fail("failed-precondition","Start later amendments from the original return.");
  if(!isStaff(actor)&&!canAccessTaxpayerRecord(actor,r))fail("permission-denied","Not your return.");
  const next=Number(r.amendmentCount||0)+1;
  if(next>20)fail("resource-exhausted","Too many amendments for this filing.");
  let base=r, baseId=id;
  if(next>1){
   const previous=await tx.get(db().collection("taxReturns").doc(id+"_A"+(next-1)));
   if(!previous.exists||previous.data().status!=="accepted")
    fail("failed-precondition","Complete the previous amendment before starting another.");
   base=previous.data();baseId=previous.id;
  }
  const newRef=db().collection("taxReturns").doc(id+"_A"+next);
  const already=await tx.get(newRef);
  if(already.exists)fail("already-exists","An amendment already exists.");
  tx.update(ref,{amendmentCount:next});
  tx.create(newRef,{
   returnType:r.returnType,taxYear:r.taxYear,taxpayerId:r.taxpayerId,
   taxpayerName:r.taxpayerName,ownerUid:r.ownerUid||null,createdBy:actor.uid,
   status:"draft",caseNumber:r.caseNumber+"-A"+next,amendedFrom:id,
   amendmentNumber:next,amendmentBaseId:baseId,revision:1,data:{...base.data,attested:false},calculation:base.calculation,
   policySnapshot:base.policySnapshot,createdAt:FieldValue.serverTimestamp(),
   updatedAt:FieldValue.serverTimestamp()
  });
  tx.create(db().collection("auditLogs").doc(),audit(actor,"Amendment started",
   "Amendment "+next+" started for "+r.caseNumber+".",newRef.id));
  result={ok:true,returnId:newRef.id,data:{...base.data,attested:false}};
 });
 return result;
});
export const listTaxAssessments=onCall(opts,async req=>{
 const actor=await currentActor(req),col=db().collection("taxAssessments");
 const snap=isStaff(actor)?await col.orderBy("createdAt","desc").limit(250).get():
  await col.where("taxpayerId","==",actor.taxpayerId).limit(250).get();
 const items=snap.docs.filter(d=>isStaff(actor)||canAccessTaxpayerRecord(actor,d.data())).map(d=>serializeAssessment(d.id,d.data()));
 items.sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
 return {items,limit:250};
});
export const searchTaxFilings = onCall(opts, async req => {
 const user = await currentActor(req);
 const data = req.data || {};
 const q = String(data.q || "").trim().slice(0, 110).toLowerCase();
 const taxpayerId = isStaff(user) ? String(data.taxpayerId || "") : user.taxpayerId;
 if (taxpayerId && !/^[A-Za-z0-9]{20}$/.test(taxpayerId)) fail("invalid-argument", "Invalid taxpayer reference.");
 if (!isStaff(user) && !taxpayerId) fail("permission-denied", "Your user has no linked taxpayer.");
 const allowedStatuses = ["draft", "submitted", "information_requested", "rejected", "accepted"];
 const status = String(data.status || "");
 if (status && !allowedStatuses.includes(status)) fail("invalid-argument", "Invalid filing status.");
 const type = String(data.type || "");
 if (type && !["individual", "business", "sales", "payroll"].includes(type)) fail("invalid-argument", "Invalid filing type.");
 let year = null;
 if (data.year) {
  try { year = ensureYear(data.year); } catch (error) { fail("invalid-argument", error.message); }
 }
 const ref = db().collection("taxReturns");
 let query = ref;
 if (taxpayerId) query = query.where("taxpayerId", "==", taxpayerId);
 else if (/^ret-\d{4}-[a-z0-9]{8}(?:-(?:a\d+|(?:sales|payroll)-\d+))?$/i.test(q)) query = query.where("caseNumber", "==", q.toUpperCase());
 else if (status) query = query.where("status", "==", status);
 else if (year) query = query.where("taxYear", "==", year);
 const pageSize = 30, scanSize = 240;
 query = query.orderBy(FieldPath.documentId());
 if (data.cursor) query = query.startAfter(ensureId(data.cursor));
 const snapshot = await query.limit(scanSize + 1).get();
 const items = [];
 let last = null, visited = 0;
 for (const doc of snapshot.docs.slice(0, scanSize)) {
  last = doc.id;
  visited++;
  const entry = doc.data();
  if (!isStaff(user) && !canAccessTaxpayerRecord(user, entry)) continue;
  if ((data.filedOnly && (!entry.submittedAt || entry.status === "draft")) || (status && entry.status !== status) ||
      (type && entry.returnType !== type) || (year && entry.taxYear !== year) || (data.period && entry.period !== Number(data.period))) continue;
  if (q && ![entry.taxpayerName, entry.caseNumber, entry.taxYear,doc.id].some(value => String(value || "").toLowerCase().includes(q))) continue;
  items.push(serializeReturn(publicReturn(entry, doc.id)));
  if (items.length === pageSize) break;
 }
 return {items, next: visited < snapshot.size ? last : null};
});
export const getTaxFilingHistory = onCall(opts, async req => {
 const user = await currentActor(req);
 const ref = db().collection("taxReturns").doc(ensureId(req.data?.returnId));
 const entry = (await ref.get()).data();
 if (!entry || (!isStaff(user) && !canAccessTaxpayerRecord(user, entry))) fail("not-found", "Filing not found.");
 const baseId = entry.amendmentBaseId || (entry.amendedFrom && entry.amendmentNumber > 1 ?
  entry.amendedFrom+"_A"+(entry.amendmentNumber-1) : entry.amendedFrom);
 const [versions, base] = await Promise.all([returnVersions(ref).orderBy("number", "desc").limit(41).get(),
  baseId ? db().collection("taxReturns").doc(baseId).get() : null]);
 const items = versions.docs.slice(0,40).map(doc => {
  const version=doc.data();
  return {number:version.number,data:version.data,calculation:version.calculation,policySnapshot:version.policySnapshot,
   withholdingMatch:version.withholdingMatch||null,submittedAt:encodeTime(version.submittedAt),
   determination:version.determination?{...version.determination,at:encodeTime(version.determination.at)}:null};
 });
 if (!items.length && entry.submittedAt) items.push({number:entry.submissionCount||1,data:entry.data,calculation:entry.calculation,
  policySnapshot:entry.policySnapshot,withholdingMatch:entry.withholdingMatch||null,submittedAt:encodeTime(entry.submittedAt),legacy:true,determination:entry.reviewedAt?
   {status:entry.status,reason:entry.decisionReason||"",reviewer:entry.reviewerName||null,at:encodeTime(entry.reviewedAt)}:null});
 const comparisonBase=base?.exists&&(isStaff(user)||canAccessTaxpayerRecord(user,base.data()))?base:null;
 return {items, truncated:versions.size>40, base:comparisonBase?serializeReturn(publicReturn(comparisonBase.data(),comparisonBase.id)):null};
});

export const getTaxFiling = onCall(opts, async req => {
 const user = await currentActor(req);
 const doc = await db().collection("taxReturns").doc(ensureId(req.data?.returnId)).get();
 const filing = doc.data();
 if (!filing || (!isStaff(user) && !canAccessTaxpayerRecord(user, filing))) fail("not-found", "Filing not found.");
 return {filing: serializeReturn(publicReturn(filing, doc.id))};
});

export const getWageStatementTotals=onCall(opts,async req=>{
 const user=await currentActor(req);
 let year;
 try{year=ensureYear(req.data?.year);}catch(err){fail("invalid-argument",err.message);}
 const id=isStaff(user)?String(req.data?.taxpayerId||user.taxpayerId||""):user.taxpayerId;
 const taxpayer=await taxpayerFor(user,id);
 const snap=await statementQuery(id,year).get();
 const matches=snap.docs.map(doc=>doc.data()).filter(row=>!row.ownerUid||row.ownerUid===taxpayer.ownerUid);
 const {count,wagesCents,withheldCents}=withholdingMatch({wages:0,withholding:0},matches);
 return {count,wagesCents,withheldCents};
});

export const findOriginalTaxReturn=onCall(opts,async req=>{
 const user=await currentActor(req);
 let year,type;
 try{year=ensureYear(req.data?.year);type=ensureType(req.data?.type);}catch(err){fail("invalid-argument",err.message);}
 const id=isStaff(user)?String(req.data?.taxpayerId||user.taxpayerId||""):user.taxpayerId;
 await taxpayerFor(user,id);
 const col=db().collection("taxReturns");
 let snap=await col.doc(originalId(id,year,type)).get();
 if(!snap.exists){
  const result=await col.where("taxpayerId","==",id).get();
  snap=result.docs.find(doc=>{const data=doc.data();return data.taxYear===year&&data.returnType===type&&!data.amendedFrom;});
 }
 if(!snap?.exists||(!isStaff(user)&&!canAccessTaxpayerRecord(user,snap.data())))return {filing:null};
 return {filing:serializeReturn(publicReturn(snap.data(),snap.id))};
});
