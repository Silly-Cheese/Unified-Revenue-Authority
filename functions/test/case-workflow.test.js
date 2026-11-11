import test from "node:test";
import assert from "node:assert/strict";
import {CASE_TYPES,CASE_TRANSITIONS,canAdvance,initialCaseStatus,canCitizenReadCase} from "../lib/case-workflow.js";

test("all four case divisions have valid initial stages",()=>{
 assert.deepEqual(CASE_TYPES,["audit","appeal","collection","investigation"]);
 for(const kind of CASE_TYPES){
  assert.ok(CASE_TRANSITIONS[kind][initialCaseStatus(kind)]);
 }
});
test("audit cases progress through examiner stages",()=>{
 assert.equal(canAdvance("audit","open","under_review"),true);
 assert.equal(canAdvance("audit","open","resolved"),false);
 assert.equal(canAdvance("audit","under_review","proposed_adjustment"),true);
 assert.equal(canAdvance("audit","closed","under_review"),false);
});
test("appeals have independent review and final closure states",()=>{
 assert.equal(initialCaseStatus("appeal"),"submitted");
 assert.equal(canAdvance("appeal","submitted","under_review"),true);
 assert.equal(canAdvance("appeal","under_review","awaiting_decision"),true);
 assert.equal(canAdvance("appeal","resolved","closed"),true);
});
test("collections can resolve after balance verification",()=>{
 assert.equal(canAdvance("collection","open","contacted"),true);
 assert.equal(canAdvance("collection","contacted","arrangement_pending"),true);
 assert.equal(canAdvance("collection","resolved","closed"),true);
});
test("investigation records must not be shown through citizen account access",()=>{
 const c={kind:"investigation",ownerUid:"u",taxpayerId:"t"};
 assert.equal(canCitizenReadCase("u","t",c),false);
 assert.equal(canCitizenReadCase("u","t",{...c,kind:"appeal"}),true);
 assert.equal(canCitizenReadCase("other","t",{...c,kind:"appeal"}),false);
});
test("unknown kinds and invalid transition are rejected",()=>{
 assert.throws(()=>initialCaseStatus("unknown"));
 assert.equal(canAdvance("investigation","open","resolved"),false);
});
