import test from "node:test";
import assert from "node:assert/strict";
import {assessmentChange, blankAccount, validateLines} from "../lib/treasury-engine.js";
import {calculateBusinessTax, defaultSchedule, installmentProgress, periodDates, returnKey} from "../lib/filing-calendar.js";
import {withholdingMatch} from "../lib/return-history.js";

test("monthly, quarterly and annual filing dates cross years independently", () => {
 assert.deepEqual(periodDates("sales", 2026, 12), {startDate:"2026-12-01",endDate:"2026-12-31",filingDue:"2027-01-20",paymentDue:"2027-01-20"});
 const payroll = {...defaultSchedule("payroll", 2026),filingDay:25,paymentDay:19};
 assert.deepEqual(periodDates("payroll", 2026, 4, payroll), {startDate:"2026-10-01",endDate:"2026-12-31",filingDue:"2027-01-25",paymentDue:"2027-01-19"});
 assert.equal(periodDates("individual", 2026, 1).filingDue, "2027-04-15");
 assert.throws(() => periodDates("payroll", 2026, 5), /valid tax type and period/);
 assert.notEqual(returnKey("taxpayer", "sales", 2026, 1), returnKey("taxpayer", "sales", 2026, 2));
});

test("business tax returns round exactly and post through the existing balanced ledger", () => {
 const sales = calculateBusinessTax("sales", {grossSales:"123.45",exemptSales:"23.40",estimatedPayments:"2.00"}, defaultSchedule("sales", 2026));
 assert.equal(sales.calculation.taxDueCents, 600);
 assert.equal(sales.calculation.balanceCents, 400);
 const assessment = assessmentChange(blankAccount({taxpayerId:"taxpayer",taxYear:2026,returnType:"sales"}),sales.calculation);
 assert.equal(assessment.next.outstandingCents,400);
 assert.equal(validateLines(assessment.lines).debitCents,validateLines(assessment.lines).creditCents);
 const payroll=calculateBusinessTax("payroll",{grossPayroll:"1000",exemptPayroll:"100",taxWithheld:"40",estimatedPayments:"10"},defaultSchedule("payroll",2026));
 assert.equal(payroll.calculation.taxDueCents,4000);
 assert.equal(payroll.calculation.reviewFlags.length,1);
 assert.throws(() => calculateBusinessTax("sales",{grossSales:"10",exemptSales:"20"},defaultSchedule("sales",2026)),/exempt/i);
});

test("installments apply payments to the oldest amount and flag only unpaid past deadlines", () => {
 const plan={paidCents:1500,schedule:[{installment:1,amountCents:1000,dueDate:"2026-10-20"},
  {installment:2,amountCents:1000,dueDate:"2026-11-20"},{installment:3,amountCents:1000,dueDate:"2026-12-20"}]};
 assert.deepEqual(installmentProgress(plan,"2026-12-01").map(row=>[row.status,row.remainingCents]),[["paid",0],["overdue",500],["upcoming",1000]]);
});

test("employee matching compares dollar inputs with summed integer cents", () => {
 const result=withholdingMatch({wages:"150.00",withholding:"8.00"},[{wagesCents:10000,withheldCents:500},{wagesCents:5000,withheldCents:400}]);
 assert.equal(result.count,2);
 assert.equal(result.wageDifferenceCents,0);
 assert.equal(result.withholdingDifferenceCents,-100);
});
