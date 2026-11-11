import test from "node:test";
import assert from "node:assert/strict";
import {defaultPolicy,calculateReturn,normalizeReturnData,validatePolicy,moneyCents,dollars} from "../lib/tax-engine.js";

const individual={wages:"68000.00",selfEmployment:"0",investmentIncome:"0",otherIncome:"0",
 itemizedDeductions:"10000",withholding:"6400",estimatedPayments:"0",credits:"0",
 filingStatus:"single",dependents:0,attested:true};
const business={grossReceipts:"150000",otherIncome:"0",costOfGoods:"40000",payroll:"30000",
 operatingExpenses:"20000",estimatedPayments:"10000",withholding:"0",
 credits:"0",businessActivity:"Retail",attested:true};

test("individual example uses progressive brackets and returns expected $800",()=>{
 const calc=calculateReturn(defaultPolicy(2026,"individual"),individual);
 assert.equal(calc.grossIncomeCents,6800000);
 assert.equal(calc.deductionsCents,1000000);
 assert.equal(calc.taxableIncomeCents,5800000);
 assert.equal(calc.baseTaxCents,560000);
 assert.equal(calc.refundCents,80000);
 assert.equal(calc.balanceCents,0);
});
test("business expenses, allowance, 18% tax and estimated payments",()=>{
 const calc=calculateReturn(defaultPolicy(2026,"business"),business);
 assert.equal(calc.taxableIncomeCents,5500000);
 assert.equal(calc.taxDueCents,990000);
 assert.equal(calc.refundCents,10000);
});
test("standard deduction and married bracket scaling work",()=>{
 const calc=calculateReturn(defaultPolicy(2026,"individual"),{...individual,wages:"10000",itemizedDeductions:"0",filingStatus:"married",withholding:"0"});
 assert.equal(calc.taxableIncomeCents,0);
 assert.equal(calc.taxDueCents,0);
});
test("credits do not drive tax below zero",()=>{
 const calc=calculateReturn(defaultPolicy(2026,"individual"),{...individual,credits:"999999",withholding:"0"});
 assert.equal(calc.taxDueCents,0);
 assert.equal(calc.balanceCents,0);
 assert.ok(calc.reviewFlags.length);
});
test("dollars/cents use exact integer arithmetic",()=>{
 assert.equal(moneyCents("5.09"),509);
 assert.equal(dollars(509),"5.09");
 assert.throws(()=>moneyCents("-1"));
 assert.throws(()=>moneyCents("1.001"));
 assert.throws(()=>moneyCents("not money"));
});
test("only supported years and ordered policy brackets are allowed",()=>{
 assert.throws(()=>defaultPolicy(1800,"individual"));
 const p=defaultPolicy(2026,"individual");
 assert.throws(()=>validatePolicy({...p,brackets:[{upToCents:4500000,rateBps:1000},{upToCents:1500000,rateBps:2000},{upToCents:null,rateBps:3000}]}));
});
test("rejects negative credits, excessive dependents and invalid status",()=>{
 assert.throws(()=>normalizeReturnData("individual",{...individual,withholding:"-5"}));
 assert.throws(()=>normalizeReturnData("individual",{...individual,dependents:26}));
 assert.throws(()=>normalizeReturnData("individual",{...individual,filingStatus:"unknown"}));
});
test("data-normalization preserves correct schema",()=>{
 const normalized=normalizeReturnData("business",business);
 assert.equal(normalized.grossReceipts,"150000.00");
 assert.equal(normalized.attested,true);
});
