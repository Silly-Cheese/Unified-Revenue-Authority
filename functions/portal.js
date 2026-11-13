// Commissioner-only conversion of an existing NPC/agency-created taxpayer into
// a name-and-password portal user, without erasing or rewriting any historic RP records.
import {onCall,HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import {getFirestore,FieldValue} from "firebase-admin/firestore";
import {addressForName} from "./lib/identity.js";
import {canAccessTaxpayerRecord,canActivateTaxpayer,canResetConvertedPortal,validatePortalName,validatePortalPassword} from "./lib/portal-access.js";
import {summarizeAccounts} from "./lib/reporting.js";

const opts={cors:true,invoker:"public"};
const db=()=>getFirestore();
function fail(code,message){throw new HttpsError(code,message);}
function taxpayerReference(value){
 if(typeof value!=="string"||!/^[A-Za-z0-9]{20}$/.test(value))
  fail("invalid-argument","Select a valid taxpayer record.");
 return db().collection("taxpayers").doc(value);
}
function requireCommissioner(profile){
 if(!profile.exists||profile.data().role!=="commissioner"||profile.data().status!=="active")
  fail("permission-denied","Only the active Commissioner can manage taxpayer portal access.");
 return profile.data();
}
function readPassword(value){
 try{return validatePortalPassword(value);}catch(err){fail("invalid-argument",err.message);}
}

export const activateTaxpayerPortal=onCall(opts,async req=>{
 if(!req.auth?.uid)fail("unauthenticated","Sign in as Commissioner.");
 const commissionerUid=req.auth.uid;
 const profile=requireCommissioner(await db().collection("users").doc(commissionerUid).get());
 const taxpayerRef=taxpayerReference(req.data?.taxpayerId);
 const taxpayerId=taxpayerRef.id;

 let portalName;
 try{portalName=validatePortalName(req.data?.portalName);}catch(err){fail("invalid-argument",err.message);}
 const password=readPassword(req.data?.password);
 const taxpayerSnap=await taxpayerRef.get();
 if(!taxpayerSnap.exists)fail("not-found","Taxpayer record was not found.");
 if(!canActivateTaxpayer(taxpayerSnap.data()))
  fail("failed-precondition","This taxpayer is archived or already linked to a portal account.");

 // Firebase Auth enforces uniqueness of the deterministic RP name login.
 // Do not create accounts in the browser as that would switch the Commissioner's session.
 const auth=getAuth();
 let created;
 try{
  created=await auth.createUser({
   email:addressForName(portalName),displayName:portalName,
   password,disabled:false,emailVerified:false
  });
 }catch(err){
  if(["auth/email-already-exists","auth/uid-already-exists"].includes(err.code))
   fail("already-exists","That fictional login name is already registered. Choose another portal name.");
  if(err instanceof HttpsError)throw err;
  fail("internal","Could not create the portal login. Check Firebase Authentication configuration.");
 }

 try{
  await db().runTransaction(async tx=>{
   const userRef=db().collection("users").doc(created.uid);
   const [latest,existing]=await Promise.all([tx.get(taxpayerRef),tx.get(userRef)]);
   if(!latest.exists||!canActivateTaxpayer(latest.data()))
    fail("failed-precondition","This taxpayer has already been linked, archived, or changed during activation.");
   if(existing.exists)fail("failed-precondition","The new authentication account has an unexpected existing profile.");
   tx.create(userRef,{
    displayName:portalName,role:"citizen",status:"active",taxpayerId,
    portalOrigin:latest.data().simulated===true?"converted_npc":"converted_agency",
    createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()
   });
   tx.update(taxpayerRef,{
    ownerUid:created.uid,portalName,portalActivatedAt:FieldValue.serverTimestamp(),
    portalActivatedBy:commissionerUid,updatedAt:FieldValue.serverTimestamp()
   });
   tx.create(db().collection("auditLogs").doc(),{
    action:"Taxpayer portal activated",
    detail:"Existing fictional taxpayer converted to citizen portal; history preserved.",
    actorUid:commissionerUid,actorName:profile.displayName,
    targetId:taxpayerId,createdAt:FieldValue.serverTimestamp()
   });
  });
 }catch(err){
  // A transaction may succeed even if its response is lost; never delete a
  // successful portal account in an ambiguous network-failure situation.
  let owned=false;
  try{
   const verification=await taxpayerRef.get();
   owned=verification.exists&&verification.data().ownerUid===created.uid;
  }catch{
   fail("unavailable","Activation status is uncertain. Check the taxpayer portal status before retrying.");
  }
  if(owned)return {ok:true,taxpayerId,portalName};
  try{await auth.deleteUser(created.uid);}
  catch{
   fail("internal","Activation failed; an orphaned authentication user may need an administrator's attention before reusing this login name.");
  }
  if(err instanceof HttpsError)throw err;
  fail("internal","Could not link the new portal to the taxpayer. No taxpayer history was changed.");
 }

 return {ok:true,taxpayerId,portalName};
});

export const resetConvertedPortalPassword=onCall(opts,async req=>{
 if(!req.auth?.uid)fail("unauthenticated","Sign in as Commissioner.");
 const commissionerUid=req.auth.uid;
 const commissionerRef=db().collection("users").doc(commissionerUid);
 requireCommissioner(await commissionerRef.get());
 const taxpayerRef=taxpayerReference(req.data?.taxpayerId);
 const password=readPassword(req.data?.password);
 const ownerUid=await db().runTransaction(async tx=>{
  const [commissionerSnap,taxpayerSnap]=await Promise.all([tx.get(commissionerRef),tx.get(taxpayerRef)]);
  const commissioner=requireCommissioner(commissionerSnap);
  const taxpayer=taxpayerSnap.data();
  if(!taxpayer)fail("not-found","Taxpayer record was not found.");
  if(!taxpayer.ownerUid||taxpayer.ownerUid===commissionerUid)
   fail("failed-precondition","Select an active converted citizen portal.");
  const owner=await tx.get(db().collection("users").doc(taxpayer.ownerUid));
  if(!canResetConvertedPortal(taxpayerRef.id,taxpayer,owner.data()))
   fail("failed-precondition","Select an active converted citizen portal.");
  tx.create(db().collection("auditLogs").doc(),{
   action:"Portal password reset requested",
   detail:"The Commissioner requested a replacement password for a converted citizen portal.",
   actorUid:commissionerUid,actorName:commissioner.displayName,targetId:taxpayerRef.id,
   createdAt:FieldValue.serverTimestamp()
  });
  return taxpayer.ownerUid;
 });
 try{
  await getAuth().updateUser(ownerUid,{password});
 }catch(err){
  if(err.code==="auth/user-not-found")fail("failed-precondition","This portal's sign-in account is missing.");
  fail("unavailable","Firebase could not confirm the password change. Try again with the same password.");
 }
 return {ok:true};
});

export const getTaxpayerPortalOverview=onCall(opts,async req=>{
 const uid=req.auth?.uid;
 if(!uid)fail("unauthenticated","Sign in to view your taxpayer portal.");
 const user=(await db().collection("users").doc(uid).get()).data();
 if(user?.status!=="active"||user.role!=="citizen"||!user.taxpayerId)
  fail("permission-denied","An active citizen portal is required.");
 const taxpayerRef=taxpayerReference(user.taxpayerId);
 const taxpayer=(await taxpayerRef.get()).data();
 if(!taxpayer||taxpayer.ownerUid!==uid)
  fail("permission-denied","Your taxpayer record is unavailable.");
 const snapshot=await db().collection("treasuryAccounts").where("taxpayerId","==",taxpayerRef.id)
  .select("taxpayerId","ownerUid","outstandingCents","refundsDisbursedCents").get();
 const actor={uid,taxpayerId:taxpayerRef.id};
 const totals=summarizeAccounts(snapshot.docs.map(doc=>doc.data()).filter(record=>canAccessTaxpayerRecord(actor,record)));
 return {fullName:taxpayer.fullName,taxpayerNumber:taxpayer.taxpayerNumber||taxpayerRef.id,
  outstandingCents:totals.outstandingCents,refundsDisbursedCents:totals.refundsDisbursedCents};
});
