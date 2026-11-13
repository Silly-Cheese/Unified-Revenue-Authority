// Canonical portal ownership rules for both newly registered and converted RP taxpayers.
// Taxpayer IDs are assigned only by trusted server code in an active user profile.
// Historical NPC documents may retain ownerUid:null; do not rewrite financial history.
import {cleanName,validName,COMMISSIONER_NAME} from "./identity.js";

export function canAccessTaxpayerRecord(actor,record){
 if(!actor?.uid||!actor?.taxpayerId||!record?.taxpayerId)return false;
 if(actor.taxpayerId!==record.taxpayerId)return false;
 return !record.ownerUid||record.ownerUid===actor.uid;
}
export function canActivateTaxpayer(record){
 return Boolean(record&&record.status==="active"&&!record.ownerUid);
}
export function canResetConvertedPortal(taxpayerId,taxpayer,profile){
 return Boolean(taxpayer?.status==="active"&&taxpayer.ownerUid&&taxpayer.portalName&&
  profile?.status==="active"&&profile.role==="citizen"&&profile.taxpayerId===taxpayerId&&
  ["converted_npc","converted_agency"].includes(profile.portalOrigin));
}
export function validatePortalName(raw){
 const name=cleanName(raw);
 if(!validName(name))throw Error("Use a fictional login name of 3–60 letters, spaces, apostrophes or hyphens.");
 if(name.toLowerCase()===COMMISSIONER_NAME.toLowerCase())
  throw Error("The founding Commissioner login name is reserved.");
 return name;
}
export function validatePortalPassword(raw){
 if(typeof raw!=="string"||raw.length<10||raw.length>128||!raw.trim())
  throw Error("Choose a password of 10–128 characters.");
 return raw;
}
