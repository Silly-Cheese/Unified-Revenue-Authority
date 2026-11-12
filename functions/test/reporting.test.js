import test from "node:test";
import assert from "node:assert/strict";
import {
 YEARS,SAMPLE_LIMIT,reportYear,safeCents,summarizeAccounts,statusCounts,
 caseTypeCounts,fiscalTrend,coverage,validateReportDraft,moneyText
} from "../lib/reporting.js";

test("supported fiscal years and report coverage are explicit",()=>{
 assert.deepEqual([YEARS[0],YEARS.at(-1)],[2025,2035]);
 assert.equal(SAMPLE_LIMIT,400);
 assert.equal(reportYear("2026"),2026);
 assert.throws(()=>reportYear(2040));
 assert.deepEqual(coverage(50,50),{sampled:50,total:50,complete:true,limited:false});
 assert.deepEqual(coverage(50,600),{sampled:50,total:600,complete:false,limited:true});
});
test("Treasury fiscal balances are summarized as integer cents",()=>{
 const sample=[
  {assessedCents:78000,declaredPaymentsCents:40000,directPaymentsCents:10000,
   refundsDisbursedCents:0,outstandingCents:28000,creditAvailableCents:0,reservedRefundCents:0},
  {assessedCents:13000,declaredPaymentsCents:20000,directPaymentsCents:0,
   refundsDisbursedCents:3000,outstandingCents:0,creditAvailableCents:4000,reservedRefundCents:1000}
 ];
 const r=summarizeAccounts(sample);
 assert.equal(r.assessedCents,91000);
 assert.equal(r.outstandingCents,28000);
 assert.equal(r.creditAvailableCents,4000);
 assert.equal(moneyText(r.assessedCents),"910.00");
 assert.throws(()=>summarizeAccounts([{assessedCents:-50}]));
 assert.throws(()=>safeCents(Number.MAX_SAFE_INTEGER+3));
});
test("report status and case classifications are counted separately",()=>{
 assert.deepEqual(statusCounts([{status:"draft"},{status:"submitted"},{status:"submitted"}]),
  {draft:1,submitted:2});
 assert.deepEqual(caseTypeCounts([{kind:"audit"},{kind:"appeal"},{kind:"audit"}]),
  {audit:2,appeal:1,collection:0,investigation:0,other:0});
 assert.equal(caseTypeCounts([{kind:"__proto__"}]).other,1);
 assert.equal(statusCounts([{status:"__proto__"}]).other,1);
});
test("posted monthly receipts do not count pending receipts or different fiscal years",()=>{
 const t=stamp=>({createdAt:new Date(stamp),amountCents:10000,status:"posted"});
 const trend=fiscalTrend([t("2026-01-19"),t("2026-01-20"),t("2025-01-20"),
  {createdAt:new Date("2026-01-23"),amountCents:20000,status:"cancelled"}],2026);
 assert.equal(trend.length,12);
 assert.equal(trend[0].receiptCount,2);
 assert.equal(trend[0].receiptCents,20000);
 assert.equal(trend[1].receiptCount,0);
});
test("executive memorandum inputs require meaningful findings",()=>{
 const good=validateReportDraft({taxYear:2026,title:"Revenue operations review",
  findings:"Analysis of fictional tax collection, outstanding receivables and fiscal risk."});
 assert.equal(good.year,2026);
 assert.throws(()=>validateReportDraft({taxYear:2026,title:"Short",findings:"No"}));
 assert.throws(()=>validateReportDraft({taxYear:2026,title:"Good title",findings:"Very short"}));
});