import {onCall,HttpsError} from "firebase-functions/v2/https";
import {setGlobalOptions} from "firebase-functions/v2";
import {initializeApp} from "firebase-admin/app";
import {getFirestore,FieldValue} from "firebase-admin/firestore";
import {addressForName,cleanName,validName,COMMISSIONER_NAME} from "./lib/identity.js";
initializeApp();
const db=getFirestore();
setGlobalOptions({region:"us-central1",maxInstances:8,memory:"256MiB"});
function bad(code,message){throw new HttpsError(code,message);}
function signed(request){if(!request.auth?.uid)bad("unauthenticated","Sign in before continuing.");return request.auth.uid;}
async function actor(request){
 const uid=signed(request);
 const doc=await db.collection("users").doc(uid).get();
 if(!doc.exists||doc.data().status!=="active")bad("permission-denied","Account is not active.");
 return {uid,...doc.data()};
}
function permit(person,roles){if(!roles.includes(person.role))bad("permission-denied","Your account does not have access to this action.");}
function log(action,detail,person,targetId=null){
 return {action,detail,actorUid:person.uid||"system",actorName:person.displayName||"System",targetId,
  createdAt:FieldValue.serverTimestamp()};
}
const callable={cors:true};
export const registerProfile=onCall(callable,async request=>{
 const uid=signed(request);
 const name=cleanName(request.data?.name);
 if(!validName(name))bad("invalid-argument","Enter a fictional name (3–60 characters).");
 if(name.toLowerCase()===COMMISSIONER_NAME.toLowerCase())bad("permission-denied","This name is reserved for the founding Commissioner.");
 if(request.auth?.token?.firebase?.sign_in_provider!=="password")bad("permission-denied","Password authentication is required.");
 if(request.auth.token.email!==addressForName(name))bad("permission-denied","Authenticated name mismatch.");
 const userRef=db.collection("users").doc(uid),taxpayerRef=db.collection("taxpayers").doc(),auditRef=db.collection("auditLogs").doc();
 await db.runTransaction(async tx=>{
  const existing=await tx.get(userRef);if(existing.exists)return;
  tx.create(userRef,{
    displayName:name,role:"citizen",status:"active",taxpayerId:taxpayerRef.id,
    createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()
  });
  tx.create(taxpayerRef,{
    fullName:name,taxpayerNumber:"URA-"+taxpayerRef.id.toUpperCase(),type:"individual",region:"Capital District",
    status:"active",ownerUid:uid,notes:"Self-registered roleplay taxpayer.",
    createdAt:FieldValue.serverTimestamp(),createdBy:uid
  });
  tx.create(auditRef,log("Citizen registration","A fictional taxpayer account was registered.",{uid,displayName:name},uid));
 });
 return {ok:true};
});
export const getOverview=onCall(callable,async request=>{
 const person=await actor(request);permit(person,["commissioner","supervisor","staff","auditor"]);
 const [taxpayers,personnel,pendingReturns]=await Promise.all([
  db.collection("taxpayers").count().get(),
  db.collection("users").where("role","in",["commissioner","supervisor","staff","auditor"]).count().get(),
  db.collection("taxReturns").where("status","==","submitted").count().get()
 ]);
 return {taxpayers:taxpayers.data().count,personnel:personnel.data().count,pendingReturns:pendingReturns.data().count,generatedAt:new Date().toISOString()};
});
export const createTaxpayer=onCall(callable,async request=>{
 const person=await actor(request);permit(person,["commissioner","supervisor","staff"]);
 const fullName=cleanName(request.data?.fullName),type=String(request.data?.type||"");
 const region=String(request.data?.region||""),notes=String(request.data?.notes||"").trim();
 if(fullName.length<3||fullName.length>90||/[<>]/.test(fullName))bad("invalid-argument","Taxpayer name is invalid.");
 if(!["individual","business"].includes(type))bad("invalid-argument","Invalid taxpayer type.");
 if(!["Capital District","Northern Region","Southern Region","Eastern Region","Western Region"].includes(region))bad("invalid-argument","Invalid administrative region.");
 if(notes.length>500)bad("invalid-argument","Notes are too long.");
 const record=db.collection("taxpayers").doc(),batch=db.batch();
 const taxpayerNumber="URA-"+record.id.toUpperCase();
 batch.create(record,{fullName,type,region,notes,taxpayerNumber,status:"active",ownerUid:null,
  createdBy:person.uid,createdAt:FieldValue.serverTimestamp()});
 batch.create(db.collection("auditLogs").doc(),log("Taxpayer created","Registered "+fullName+" ("+type+").",person,record.id));
 await batch.commit();return {id:record.id,taxpayerNumber};
});
export const archiveTaxpayer=onCall(callable,async request=>{
 const person=await actor(request);permit(person,["commissioner"]);
 const id=String(request.data?.id||"");if(!/^[a-zA-Z0-9]{20}$/.test(id))bad("invalid-argument","Invalid record reference.");
 const ref=db.collection("taxpayers").doc(id);
 await db.runTransaction(async tx=>{
  const snap=await tx.get(ref);if(!snap.exists)bad("not-found","Taxpayer not found.");
  if(snap.data().ownerUid)bad("failed-precondition","An account-linked taxpayer must not be archived using this action.");
  if(snap.data().status==="archived")return;
  tx.update(ref,{status:"archived",archivedAt:FieldValue.serverTimestamp(),archivedBy:person.uid});
  tx.create(db.collection("auditLogs").doc(),log("Taxpayer archived","Archived "+snap.data().fullName+".",person,id));
 });
 return {ok:true};
});
export const assignRole=onCall(callable,async request=>{
 const person=await actor(request);permit(person,["commissioner"]);
 const uid=String(request.data?.uid||""),role=String(request.data?.role||"");
 if(!["citizen","staff","auditor","supervisor"].includes(role))bad("invalid-argument","Unsupported role.");
 if(!/^[A-Za-z0-9_-]{5,128}$/.test(uid)||uid===person.uid)bad("invalid-argument","Invalid personnel target.");
 const ref=db.collection("users").doc(uid);
 await db.runTransaction(async tx=>{
  const target=await tx.get(ref);if(!target.exists)bad("not-found","Account not found.");
  if(target.data().role==="commissioner")bad("permission-denied","Commissioner account is protected.");
  tx.update(ref,{role,updatedAt:FieldValue.serverTimestamp(),roleUpdatedBy:person.uid});
  tx.create(db.collection("auditLogs").doc(),log("Personnel access changed","Updated "+target.data().displayName+" to "+role+".",person,uid));
 });
 return {ok:true};
});
// Generation 2 — dedicated fictional tax filing and assessment service.
export {getTaxCatalog,setTaxPolicy,previewTaxReturn,saveTaxDraft,submitTaxReturn,listTaxReturns,reviewTaxReturn,beginTaxAmendment,listTaxAssessments} from "./tax.js";
