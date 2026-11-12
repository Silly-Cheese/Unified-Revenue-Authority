// Generation 6 — pure, testable fictional revenue reporting helpers.
// All amounts are integer cents, report coverage is always explicit.
export const YEARS=Array.from({length:11},(_,i)=>2025+i);
export const SAMPLE_LIMIT=400;
export function reportYear(raw){
 const year=Number(raw);
 if(!Number.isInteger(year)||!YEARS.includes(year))throw Error("Select a supported RP fiscal year (2025–2035).");
 return year;
}
export function safeCents(raw){
 const n=Number(raw??0);
 if(!Number.isSafeInteger(n)||n<0)throw Error("Invalid financial value in RP report.");
 return n;
}
export function summarizeAccounts(accounts){
 const keys=["assessedCents","declaredPaymentsCents","directPaymentsCents",
  "refundsDisbursedCents","outstandingCents","creditAvailableCents",
  "reservedRefundCents"];
 const totals=Object.fromEntries(keys.map(k=>[k,0]));
 for(const account of accounts){
  for(const key of keys){
   const next=totals[key]+safeCents(account[key]);
   if(!Number.isSafeInteger(next))throw Error("Report total exceeds safe integer range.");
   totals[key]=next;
  }
 }
 return totals;
}
export function statusCounts(items){
 const counts={};
 for(const item of items){
  const raw=String(item.status||"unknown").slice(0,45);
  const key=/^[a-z0-9_-]+$/.test(raw)&&!["__proto__","constructor","prototype"].includes(raw)?raw:"other";
  counts[key]=(Object.hasOwn(counts,key)?counts[key]:0)+1;
 }
 return counts;
}
export function caseTypeCounts(items){
 const counts={audit:0,appeal:0,collection:0,investigation:0,other:0};
 for(const item of items){const kind=String(item.kind||"other");counts[Object.hasOwn(counts,kind)?kind:"other"]++;}
 return counts;
}
export function fiscalTrend(receipts,year){
 const fiscal=reportYear(year);
 const months=Array.from({length:12},(_,i)=>({month:i+1,label:new Date(Date.UTC(fiscal,i,1)).toLocaleString("en-US",{month:"short",timeZone:"UTC"}),receiptCents:0,receiptCount:0}));
 for(const item of receipts){
  if(item.status!=="posted")continue;
  const stamp=item.createdAt?.toDate?.()??(item.createdAt?new Date(item.createdAt):null);
  if(!(stamp instanceof Date)||!Number.isFinite(stamp.valueOf())||stamp.getUTCFullYear()!==fiscal)continue;
  const row=months[stamp.getUTCMonth()];
  row.receiptCount++;
  row.receiptCents+=safeCents(item.amountCents);
 }
 return months;
}
export function coverage(observed,total){
 if(!Number.isInteger(observed)||!Number.isInteger(total)||observed<0||total<0)
  throw Error("Invalid report coverage.");
 return {sampled:observed,total,complete:observed>=total,limited:observed<total};
}
export function validateReportDraft(raw){
 const year=reportYear(raw?.taxYear);
 const title=String(raw?.title||"").trim().replace(/\s+/g," ");
 const findings=String(raw?.findings||"").trim();
 if(title.length<8||title.length>110)throw Error("Report title must contain 8–110 characters.");
 if(findings.length<30||findings.length>3000)throw Error("Executive findings must contain 30–3,000 characters.");
 return {year,title,findings};
}
export function moneyText(cents){return (safeCents(cents)/100).toFixed(2);}
