import test from "node:test";
import assert from "node:assert/strict";
import {
 blankAccount,deriveAccount,assessmentChange,paymentChange,refundChange,
 reserveRefund,releaseRefund,validateLines,moneyFromDollars,buildInstallmentSchedule,accountId
} from "../lib/treasury-engine.js";
const base={taxpayerId:"ABCDEFGHIJKLMNOPQRST",taxpayerName:"Taylor Lane",ownerUid:"test",taxYear:2026,returnType:"individual"};
test("accepted return establishes assessed liability and balances",()=>{
 const initial=blankAccount(base);
 const x=assessmentChange(initial,{taxDueCents:560000,paymentsCents:640000});
 assert.equal(x.next.assessedCents,560000);
 assert.equal(x.next.creditAvailableCents,80000);
 assert.equal(x.next.outstandingCents,0);
 assert.equal(x.lines.length,6);
 assert.equal(validateLines(x.lines).debitCents,1280000);
});
test("payments reduce receivables through balanced journals",()=>{
 const {next:acct}=assessmentChange(blankAccount(base),{taxDueCents:90000,paymentsCents:0});
 const x=paymentChange(acct,39000);
 assert.equal(x.next.outstandingCents,51000);
 assert.equal(x.next.directPaymentsCents,39000);
 assert.equal(validateLines(x.lines).debitCents,39000);
});
test("credit refunds are reserved and never disbursed twice",()=>{
 const {next:acct}=assessmentChange(blankAccount(base),{taxDueCents:20000,paymentsCents:30000});
 const reserved=reserveRefund(acct,6000);
 assert.equal(reserved.refundAvailableCents,4000);
 assert.throws(()=>reserveRefund(reserved,5000));
 const paid=refundChange(reserved,6000);
 assert.equal(paid.next.refundsDisbursedCents,6000);
 assert.equal(paid.next.reservedRefundCents,0);
 assert.equal(paid.next.creditAvailableCents,4000);
 assert.throws(()=>refundChange(paid.next,6000));
 assert.equal(validateLines(paid.lines).creditCents,6000);
});
test("amended tax return posts differential revenue instead of entire amount",()=>{
 const old=assessmentChange(blankAccount(base),{taxDueCents:80000,paymentsCents:40000}).next;
 const revised=assessmentChange(old,{taxDueCents:70000,paymentsCents:40000});
 assert.equal(revised.deltaTaxCents,-10000);
 assert.equal(revised.next.outstandingCents,30000);
 assert.equal(validateLines(revised.lines).debitCents,10000);
});
test("cannot alter credit below a reserved refund",()=>{
 const credit=assessmentChange(blankAccount(base),{taxDueCents:10000,paymentsCents:40000}).next;
 const reserved=reserveRefund(credit,25000);
 assert.throws(()=>assessmentChange(reserved,{taxDueCents:30000,paymentsCents:40000}),/reserved/i);
 assert.equal(releaseRefund(reserved,25000).reservedRefundCents,0);
});
test("money parsing and journals reject invalid values",()=>{
 assert.equal(moneyFromDollars("120.05"),12005);
 assert.throws(()=>moneyFromDollars("0"));
 assert.throws(()=>moneyFromDollars("-5.5"));
 assert.throws(()=>validateLines([{code:"1000",debitCents:100,creditCents:0},{code:"1100",debitCents:0,creditCents:90}]));
 assert.equal(accountId(base.taxpayerId,2026,"individual"),base.taxpayerId+"_2026_individual");
});
test("installment schedules distribute exact cents and handle short months",()=>{
 const rows=buildInstallmentSchedule(10001,4,"2026-01-31");
 assert.equal(rows.reduce((sum,r)=>sum+r.amountCents,0),10001);
 assert.equal(rows[1].dueDate,"2026-02-28");
 assert.equal(rows[0].amountCents,2501);
});