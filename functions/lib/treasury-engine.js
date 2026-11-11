// Unified Revenue Authority (fictional) treasury engine.
// All values represent integer cents in a simulated currency, never actual transfers.
export const CHART={
 "1000":{name:"Simulated treasury cash",classification:"asset"},
 "1100":{name:"Tax receivables",classification:"asset"},
 "2100":{name:"Taxpayer credit liability",classification:"liability"},
 "4100":{name:"Assessed tax revenue",classification:"revenue"}
};
export const ACCOUNT_TYPES=["individual","business"];
export const PAYMENT_METHODS=["simulated_transfer","simulated_cash","simulated_check","simulated_money_order"];
export const MAX_MONEY_CENTS=100000000000;
export function positiveCents(value,label="Amount"){
 const v=Number(value);
 if(!Number.isSafeInteger(v)||v<=0||v>MAX_MONEY_CENTS)throw Error(label+" must be a positive amount in cents.");
 return v;
}
export function validMoneyCents(value,label="Amount"){
 const v=Number(value);
 if(!Number.isSafeInteger(v)||v<0||v>MAX_MONEY_CENTS)throw Error(label+" must be a nonnegative amount in cents.");
 return v;
}
export function moneyFromDollars(raw,label="Amount"){
 const s=String(raw??"").trim();
 if(!/^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(s))throw Error(label+" must be a valid dollar amount with up to 2 decimal places.");
 const [whole,fraction=""]=s.split(".");
 const cents=Number(whole)*100+Number(fraction.padEnd(2,"0"));
 return positiveCents(cents,label);
}
export function accountId(taxpayerId,year,type){
 if(!/^[A-Za-z0-9]{20}$/.test(taxpayerId))throw Error("Invalid taxpayer identifier.");
 if(!Number.isInteger(Number(year))||Number(year)<2025||Number(year)>2035)throw Error("Invalid tax year.");
 if(!ACCOUNT_TYPES.includes(type))throw Error("Invalid return type.");
 return taxpayerId+"_"+year+"_"+type;
}
export function blankAccount(fields){
 return {taxpayerId:fields.taxpayerId,taxpayerName:fields.taxpayerName||"",
  ownerUid:fields.ownerUid||null,taxYear:Number(fields.taxYear),returnType:fields.returnType,
  assessedCents:0,declaredPaymentsCents:0,directPaymentsCents:0,
  refundsDisbursedCents:0,reservedRefundCents:0,
  outstandingCents:0,creditAvailableCents:0,refundAvailableCents:0,
  status:"open"};
}
export function deriveAccount(account){
 const assessedCents=validMoneyCents(account.assessedCents,"Assessed tax");
 const declaredPaymentsCents=validMoneyCents(account.declaredPaymentsCents,"Declared payments");
 const directPaymentsCents=validMoneyCents(account.directPaymentsCents,"Direct payments");
 const refundsDisbursedCents=validMoneyCents(account.refundsDisbursedCents,"Refunds disbursed");
 const reservedRefundCents=validMoneyCents(account.reservedRefundCents,"Reserved refunds");
 const net=assessedCents-declaredPaymentsCents-directPaymentsCents+refundsDisbursedCents;
 const outstandingCents=Math.max(0,net),creditAvailableCents=Math.max(0,-net);
 if(reservedRefundCents>creditAvailableCents)throw Error("Approved refunds exceed available taxpayer credits.");
 return {...account,assessedCents,declaredPaymentsCents,directPaymentsCents,
  refundsDisbursedCents,reservedRefundCents,outstandingCents,creditAvailableCents,
  refundAvailableCents:creditAvailableCents-reservedRefundCents};
}
function line(code,side,amount){
 if(!CHART[code])throw Error("Unknown account code.");
 const cents=positiveCents(amount);
 return {code,debitCents:side==="debit"?cents:0,creditCents:side==="credit"?cents:0};
}
function pair(dr,cr,cents,reverse=false){
 if(!cents)return [];
 const amt=positiveCents(Math.abs(cents));
 return reverse?[line(cr,"debit",amt),line(dr,"credit",amt)]:
  [line(dr,"debit",amt),line(cr,"credit",amt)];
}
export function validateLines(lines){
 if(!Array.isArray(lines)||lines.length<2||lines.length>30)throw Error("Invalid journal line count.");
 let debit=0,credit=0;
 for(const l of lines){
  if(!CHART[l.code])throw Error("Unknown general ledger account "+l.code);
  const d=validMoneyCents(l.debitCents),c=validMoneyCents(l.creditCents);
  if((d===0)===(c===0))throw Error("A journal line must have exactly one debit or credit.");
  debit+=d;credit+=c;
 }
 if(!Number.isSafeInteger(debit)||debit!==credit||debit<=0)throw Error("Journal entries must balance exactly.");
 return {debitCents:debit,creditCents:credit};
}
export function assessmentChange(current,calculation){
 const old=deriveAccount(current);
 const next=deriveAccount({...old,
  assessedCents:validMoneyCents(calculation.taxDueCents,"Assessed liability"),
  declaredPaymentsCents:validMoneyCents(calculation.paymentsCents,"Declared payments")});
 const deltaTax=next.assessedCents-old.assessedCents;
 const deltaPrepaid=next.declaredPaymentsCents-old.declaredPaymentsCents;
 const deltaLiability=next.creditAvailableCents-old.creditAvailableCents;
 const lines=[
  ...pair("1100","4100",Math.abs(deltaTax),deltaTax<0),
  ...pair("1000","1100",Math.abs(deltaPrepaid),deltaPrepaid<0),
  ...pair("1100","2100",Math.abs(deltaLiability),deltaLiability<0)
 ];
 if(lines.length)validateLines(lines);
 return {next,lines,deltaTaxCents:deltaTax,deltaPrepaymentsCents:deltaPrepaid,
  deltaCreditLiabilityCents:deltaLiability};
}
export function paymentChange(current,amountCents){
 const old=deriveAccount(current),amount=positiveCents(amountCents);
 const next=deriveAccount({...old,directPaymentsCents:old.directPaymentsCents+amount});
 const deltaLiability=next.creditAvailableCents-old.creditAvailableCents;
 const lines=[...pair("1000","1100",amount),...pair("1100","2100",deltaLiability)];
 validateLines(lines);
 return {next,lines};
}
export function refundChange(current,amountCents){
 const old=deriveAccount(current),amount=positiveCents(amountCents);
 if(amount>old.reservedRefundCents||amount>old.creditAvailableCents)
  throw Error("Refund is not sufficiently approved or funded.");
 const next=deriveAccount({...old,refundsDisbursedCents:old.refundsDisbursedCents+amount,
  reservedRefundCents:old.reservedRefundCents-amount});
 const lines=pair("2100","1000",amount);
 validateLines(lines);
 return {next,lines};
}
export function reserveRefund(current,amountCents){
 const account=deriveAccount(current),amount=positiveCents(amountCents);
 if(amount>account.refundAvailableCents)throw Error("Requested refund exceeds unreserved taxpayer credit.");
 return deriveAccount({...account,reservedRefundCents:account.reservedRefundCents+amount});
}
export function releaseRefund(current,amountCents){
 const account=deriveAccount(current),amount=positiveCents(amountCents);
 if(amount>account.reservedRefundCents)throw Error("Cannot release more than the reserved refund.");
 return deriveAccount({...account,reservedRefundCents:account.reservedRefundCents-amount});
}
export function buildInstallmentSchedule(amountCents,installmentCount,firstDueDate){
 const amount=positiveCents(amountCents);
 const count=Number(installmentCount);
 if(!Number.isInteger(count)||count<2||count>24)throw Error("Payment plan must contain 2–24 installments.");
 const first=new Date(firstDueDate);
 if(!Number.isFinite(first.getTime()))throw Error("Invalid first payment date.");
 const baseYear=first.getUTCFullYear(),baseMonth=first.getUTCMonth(),day=first.getUTCDate();
 const base=Math.floor(amount/count),extra=amount%count;
 return Array.from({length:count},(_,i)=>{
  const dollars=base+(i<extra?1:0);
  const monthFirst=new Date(Date.UTC(baseYear,baseMonth+i,1));
  const maxDay=new Date(Date.UTC(monthFirst.getUTCFullYear(),monthFirst.getUTCMonth()+1,0)).getUTCDate();
  const date=new Date(Date.UTC(monthFirst.getUTCFullYear(),monthFirst.getUTCMonth(),Math.min(day,maxDay)));
  return {installment:i+1,dueDate:date.toISOString().slice(0,10),amountCents:dollars};
 });
}