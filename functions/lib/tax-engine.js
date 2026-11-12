// Unified Revenue Authority — fictional tax calculation policy and monetary engine.
// ALL monetary calculations use integer cents; no real-world tax rates are represented.
export const TAX_TYPES=["individual","business"];
export const TAX_YEARS=Array.from({length:11},(_,i)=>2025+i);
export const FILING_STATUSES=["single","married","head"];
export const MONEY_FIELDS={
 individual:["wages","selfEmployment","investmentIncome","otherIncome","itemizedDeductions","withholding","estimatedPayments","credits"],
 business:["grossReceipts","otherIncome","costOfGoods","payroll","operatingExpenses","estimatedPayments","withholding","credits"]
};
export function ensureYear(raw){
 const year=Number(raw);
 if(!Number.isInteger(year)||!TAX_YEARS.includes(year))throw new Error("Select a supported fictional tax year.");
 return year;
}
export function ensureType(type){
 if(!TAX_TYPES.includes(type))throw new Error("Select an individual or business return.");
 return type;
}
export function moneyCents(raw,label="Amount"){
 const value=String(raw===undefined||raw===null||raw===""?"0":raw).trim();
 if(!/^(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,2})?$/.test(value))throw new Error(label+" must be a positive dollar amount with no more than two decimal places.");
 const [dollars,fraction=""]=value.split(".");
 const cents=(Number(dollars)*100)+Number(fraction.padEnd(2,"0"));
 if(!Number.isSafeInteger(cents))throw new Error(label+" exceeds the permitted limit.");
 return cents;
}
export function dollars(cents){return (cents/100).toFixed(2);}
export function defaultPolicy(year,type){
 year=ensureYear(year);type=ensureType(type);
 const base={year,type,version:1,currency:"USD",title:(type==="individual"?"Individual Income Tax":"Business Income Tax")+" — Fictional "+year,
  description:"SIMULATION POLICY. These rates are invented for gameplay and are not actual tax law."};
 if(type==="individual")return {...base,
  standardDeductionCents:1000000,dependentCreditCents:75000,
  brackets:[
   {upToCents:1500000,rateBps:0},
   {upToCents:4500000,rateBps:1000},
   {upToCents:null,rateBps:2000}
  ]};
 return {...base,corporateRateBps:1800,businessAllowanceCents:500000};
}
function integerInRange(value,min,max,label){
 if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error("Invalid "+label+".");
 return value;
}
export function validatePolicy(raw){
 const year=ensureYear(raw?.year),type=ensureType(raw?.type);
 const version=integerInRange(Number(raw.version||1),1,9999,"policy version");
 const base={...defaultPolicy(year,type),version,
  title:String(raw.title||"").trim().slice(0,110),
  description:"Fictional simulation rules, not actual tax legislation."};
 if(!base.title)base.title=defaultPolicy(year,type).title;
 if(type==="business"){
  return {...base,
   corporateRateBps:integerInRange(Number(raw.corporateRateBps),0,10000,"business rate"),
   businessAllowanceCents:integerInRange(Number(raw.businessAllowanceCents),0,100000000000,"business allowance")};
 }
 const std=integerInRange(Number(raw.standardDeductionCents),0,100000000000,"standard deduction");
 const dependent=integerInRange(Number(raw.dependentCreditCents),0,1000000000,"dependent credit");
 const rows=raw.brackets;
 if(!Array.isArray(rows)||rows.length<2||rows.length>7)throw new Error("Provide 2–7 fictional tax brackets.");
 let prev=-1;
 const brackets=rows.map((b,i)=>{
  const rate=integerInRange(Number(b?.rateBps),0,10000,"tax bracket rate");
  if(i===rows.length-1){
   if(b?.upToCents!==null)throw new Error("Last bracket must have no upper income limit.");
   return {upToCents:null,rateBps:rate};
  }
  const max=integerInRange(Number(b?.upToCents),0,100000000000,"bracket upper limit");
  if(max<=prev)throw new Error("Bracket limits must increase.");
  prev=max;
  return {upToCents:max,rateBps:rate};
 });
 return {...base,standardDeductionCents:std,dependentCreditCents:dependent,brackets};
}
export function normalizeReturnData(type,raw){
 type=ensureType(type);
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("Missing return information.");
 const data={};
 for(const key of MONEY_FIELDS[type])data[key]=dollars(moneyCents(raw[key],key));
 if(type==="individual"){
  const filingStatus=String(raw.filingStatus||"single");
  if(!FILING_STATUSES.includes(filingStatus))throw new Error("Choose a valid filing status.");
  const dependents=Number(raw.dependents===undefined||raw.dependents===""?0:raw.dependents);
  integerInRange(dependents,0,25,"number of dependents");
  data.filingStatus=filingStatus;
  data.dependents=dependents;
 }else{
  data.businessActivity=String(raw.businessActivity||"").trim().slice(0,120);
 }
 data.attested=raw.attested===true;
 data.explanation=String(raw.explanation||"").trim().slice(0,1000);
 return data;
}
export function calculateReturn(policy,input){
 policy=validatePolicy(policy);
 const type=policy.type;
 const data=normalizeReturnData(type,input);
 let grossIncomeCents=0,deductionsCents=0,taxableIncomeCents=0,baseTaxCents=0;
 const flags=[];
 const amount=(key)=>moneyCents(data[key],key);
 if(type==="individual"){
  grossIncomeCents=amount("wages")+amount("selfEmployment")+amount("investmentIncome")+amount("otherIncome");
  const scale={single:10000,married:20000,head:15000}[data.filingStatus];
  const standard=Math.round(policy.standardDeductionCents*scale/10000);
  deductionsCents=Math.min(grossIncomeCents,Math.max(standard,amount("itemizedDeductions")));
  taxableIncomeCents=Math.max(0,grossIncomeCents-deductionsCents);
  let consumed=0;
  for(const bracket of policy.brackets){
   const ceiling=bracket.upToCents===null?Number.MAX_SAFE_INTEGER:Math.round(bracket.upToCents*scale/10000);
   const taxablePart=Math.max(0,Math.min(taxableIncomeCents,ceiling)-consumed);
   baseTaxCents+=Math.round(taxablePart*bracket.rateBps/10000);
   consumed=Math.min(taxableIncomeCents,ceiling);
  }
  if(amount("withholding")>amount("wages")*0.7&&amount("withholding")>0)flags.push("Withholding is unusually high relative to wages; request verification.");
  if(amount("itemizedDeductions")>grossIncomeCents&&grossIncomeCents>0)flags.push("Claimed itemized deductions exceed reported income.");
  if(data.dependents>7)flags.push("High dependent count; documentation may be requested.");
 }else{
  grossIncomeCents=amount("grossReceipts")+amount("otherIncome");
  const costs=amount("costOfGoods")+amount("payroll")+amount("operatingExpenses");
  deductionsCents=Math.min(grossIncomeCents,costs+policy.businessAllowanceCents);
  taxableIncomeCents=Math.max(0,grossIncomeCents-costs-policy.businessAllowanceCents);
  baseTaxCents=Math.round(taxableIncomeCents*policy.corporateRateBps/10000);
  if(costs>grossIncomeCents)flags.push("Business expenses exceed receipts.");
  if(amount("withholding")>0)flags.push("Business return includes withholding; examiner verification recommended.");
 }
 const dependentCreditsCents=type==="individual"?data.dependents*policy.dependentCreditCents:0;
 const requestedCreditsCents=amount("credits")+dependentCreditsCents;
 const appliedCreditsCents=Math.min(baseTaxCents,requestedCreditsCents);
 const taxDueCents=Math.max(0,baseTaxCents-appliedCreditsCents);
 const paymentsCents=amount("withholding")+amount("estimatedPayments");
 const refundCents=Math.max(0,paymentsCents-taxDueCents);
 const balanceCents=Math.max(0,taxDueCents-paymentsCents);
 if(requestedCreditsCents>baseTaxCents&&requestedCreditsCents>0)flags.push("Credits exceed calculated tax; nonrefundable credits were capped.");
 if(paymentsCents>grossIncomeCents&&grossIncomeCents>0)flags.push("Reported tax payments exceed gross reported income.");
 return {grossIncomeCents,deductionsCents,taxableIncomeCents,baseTaxCents,
  requestedCreditsCents,appliedCreditsCents,taxDueCents,paymentsCents,
  refundCents,balanceCents,reviewFlags:flags,policyVersion:policy.version,type};
}