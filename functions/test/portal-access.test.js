import test from "node:test";
import assert from "node:assert/strict";
import {
 canAccessTaxpayerRecord,canActivateTaxpayer,
 validatePortalName,validatePortalPassword
} from "../lib/portal-access.js";
import {canCitizenReadCase} from "../lib/case-workflow.js";
import {addressForName} from "../lib/identity.js";

const id="ABCDEFGHIJKLMNOPQRST";
const uid="firebase-uid-test";
const actor={uid,taxpayerId:id,role:"citizen"};

test("Commissioner can convert a live unlinked NPC or agency taxpayer",()=>{
 assert.equal(canActivateTaxpayer({status:"active",ownerUid:null,simulated:true}),true);
 assert.equal(canActivateTaxpayer({status:"active",ownerUid:null,simulated:false}),true);
 assert.equal(canActivateTaxpayer({status:"active",ownerUid:"someone"}),false);
 assert.equal(canActivateTaxpayer({status:"archived",ownerUid:null}),false);
});
test("Portal aliases are compatible with the existing name/password login scheme",()=>{
 assert.equal(validatePortalName("  Jordan   Vale "),"Jordan Vale");
 assert.equal(addressForName("Jordan Vale"),addressForName(" jordan vale "));
 assert.throws(()=>validatePortalName("Christopher Shelley"),/reserved/i);
 assert.throws(()=>validatePortalName("Northpoint Retail, LLC"),/fictional login/i);
 assert.throws(()=>validatePortalName("A"),/fictional login/i);
});
test("Passwords are validated but never returned in account records",()=>{
 const value="verySecure!1234";
 assert.equal(validatePortalPassword(value),value);
 assert.throws(()=>validatePortalPassword("short"));
 assert.throws(()=>validatePortalPassword(" ".repeat(12)));
 assert.throws(()=>validatePortalPassword("a".repeat(129)));
 assert.throws(()=>validatePortalPassword(null));
});
test("Converted NPC retains access to legacy documents with ownerUid null",()=>{
 assert.equal(canAccessTaxpayerRecord(actor,{taxpayerId:id,ownerUid:null}),true);
 assert.equal(canAccessTaxpayerRecord(actor,{taxpayerId:id}),true);
 assert.equal(canAccessTaxpayerRecord(actor,{taxpayerId:id,ownerUid:uid}),true);
 assert.equal(canCitizenReadCase(uid,id,{kind:"appeal",taxpayerId:id,ownerUid:null}),true);
});
test("Historic records belonging to other account owners stay inaccessible",()=>{
 assert.equal(canAccessTaxpayerRecord(actor,{taxpayerId:id,ownerUid:"other-uid"}),false);
 assert.equal(canAccessTaxpayerRecord({...actor,taxpayerId:"DIFFERENT"}, {taxpayerId:id,ownerUid:null}),false);
 assert.equal(canAccessTaxpayerRecord({uid}, {taxpayerId:id,ownerUid:null}),false);
 assert.equal(canAccessTaxpayerRecord(null,{taxpayerId:id,ownerUid:null}),false);
 assert.equal(canCitizenReadCase(uid,id,{kind:"investigation",taxpayerId:id,ownerUid:null}),false);
 assert.equal(canCitizenReadCase(uid,id,{kind:"investigation",taxpayerId:id,ownerUid:uid}),false);
});
