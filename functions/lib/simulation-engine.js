// Pure, deterministic fictional-world generator. No real people, tax identities, email or financial transactions.
import {calculateReturn,defaultPolicy,normalizeReturnData} from "./tax-engine.js";

export const ECONOMIES=["steady","expansion","recession","volatile"];
export const FILING_MODES=["standard","complex","discrepancies"];
export const SCENARIOS=["audit_sweep","collection_cycle","appeal_wave","refund_review"];
export const REGIONS=["Capital District","Northern Region","Southern Region","Eastern Region","Western Region"];
export const TAX_YEAR_MIN=2025,TAX_YEAR_MAX=2035;
const FIRST=["Avery","Blair","Cameron","Dakota","Emery","Finley","Harper","Jordan","Kai","Morgan","Parker","Quinn","Reese","Rowan","Sage","Taylor","Wren","Alex","Riley","Hayden"];
const LAST=["Alden","Bennett","Carter","Dover","Ellis","Fletcher","Grayson","Hale","Irving","Jensen","Keller","Maddox","Nash","Oakley","Patterson","Reed","Sutton","Turner","Vale","Walker"];
const BUSINESS=["Northbridge","Highpoint","Silvercrest","Greenline","Oak River","Pine Harbor","Crestview","Summit Valley","Redstone","Brightfield","Clearwater","Granite Point"];
const SUFFIX=["Services","Logistics","Holdings","Supply Co.","Retail Group","Manufacturing","Consulting","Markets","Industries","Solutions"];
const INDUSTRIES=["Retail","Manufacturing","Food Services","Transport","Consulting","Construction","IT Services","Wholesale"];
const ECONOMY_FACTOR={steady:1,expansion:1.18,recession:0.76,volatile:1.03};
export function makeRandom(seed){
 let t=Number(seed)>>>0;
 return ()=>{
  t=(t+0x6D2B79F5)>>>0;
  let x=t;
  x=Math.imul(x^(x>>>15),x|1);
  x^=x+Math.imul(x^(x>>>7),x|61);
  return ((x^(x>>>14))>>>0)/4294967296;
 };
}
export function sample(rand,list){return list[Math.floor(rand()*list.length)];}
export function simulationDate(date){
 if(typeof date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error("Simulation date must use YYYY-MM-DD.");
 const x=new Date(date+"T00:00:00Z");
 if(!Number.isFinite(x.getTime())||x.toISOString().slice(0,10)!==date)throw Error("Invalid simulation date.");
 if(x.getUTCFullYear()<TAX_YEAR_MIN||x.getUTCFullYear()>TAX_YEAR_MAX)throw Error("Simulation date outside supported fictional tax years.");
 return date;
}
export function advanceDate(date,days){
 const d=new Date(simulationDate(date)+"T00:00:00Z");
 if(!Number.isInteger(days)||days<1||days>90)throw Error("Advance clock by 1 to 90 days per action.");
 d.setUTCDate(d.getUTCDate()+days);
 return simulationDate(d.toISOString().slice(0,10));
}
export function validateSeed(seed){
 if(!Number.isSafeInteger(Number(seed))||Number(seed)<1||Number(seed)>2147483647)throw Error("Simulation seed must be between 1 and 2,147,483,647.");
 return Number(seed);
}
export function buildNpc({serial,type,year,economy="steady",mode="standard",seed=73011,policy}){
 if(!Number.isInteger(serial)||serial<0||serial>10000000)throw Error("Invalid simulated population index.");
 if(!["individual","business"].includes(type))throw Error("Unsupported fictional taxpayer type.");
 if(!ECONOMIES.includes(economy)||!FILING_MODES.includes(mode))throw Error("Unknown simulation conditions.");
 if(!Number.isInteger(year)||year<TAX_YEAR_MIN||year>TAX_YEAR_MAX)throw Error("Unsupported scenario fiscal year.");
 const rand=makeRandom((validateSeed(seed)+(serial+1)*2654435761)>>>0);
 const factor=ECONOMY_FACTOR[economy]*(economy==="volatile"?(0.65+rand()*0.8):1);
 const dollar=(v)=>Math.max(0,Math.round(v)).toFixed(2);
 const region=sample(rand,REGIONS);
 let name,industry="",raw;
 if(type==="individual"){
  name=sample(rand,FIRST)+" "+sample(rand,LAST);
  const wages=Math.round((22000+rand()*118000)*factor);
  const additional=Math.round(rand()*14000*(mode==="complex"?3:1));
  raw={wages:dollar(wages),selfEmployment:dollar(rand()<0.22?rand()*31000:0),
   investmentIncome:dollar(additional),otherIncome:dollar(rand()<0.2?rand()*8000:0),
   itemizedDeductions:dollar(rand()<0.32?rand()*24000:0),
   withholding:dollar(wages*(0.065+rand()*0.09)),
   estimatedPayments:dollar(rand()<0.25?rand()*7000:0),
   credits:dollar(rand()<0.27?rand()*950:0),
   filingStatus:sample(rand,["single","single","married","head"]),
   dependents:Math.floor(rand()*4),
   explanation:"Generated fictional wage and income statement for RP examination.",
   attested:true};
  if(mode==="discrepancies"){raw.withholding=dollar(wages*0.88);raw.explanation="Synthetic withholding mismatch intentionally flagged for examiner review.";}
 }else{
  name=sample(rand,BUSINESS)+" "+sample(rand,SUFFIX);
  industry=sample(rand,INDUSTRIES);
  const gross=Math.round((85000+rand()*1550000)*factor);
  const cog=Math.round(gross*(0.14+rand()*0.19));
  const payroll=Math.round(gross*(0.12+rand()*0.21));
  const expenses=Math.round(gross*(0.09+rand()*0.17));
  raw={grossReceipts:dollar(gross),otherIncome:dollar(rand()*25000),
   costOfGoods:dollar(cog),payroll:dollar(payroll),operatingExpenses:dollar(expenses),
   estimatedPayments:dollar(gross*(0.012+rand()*0.023)),withholding:"0.00",
   credits:dollar(rand()<0.35?rand()*7000:0),businessActivity:industry,
   explanation:"Generated fictional business financial schedule for simulated revenue administration.",
   attested:true};
  if(mode==="complex"){raw.operatingExpenses=dollar(expenses*1.7);}
  if(mode==="discrepancies"){
   raw.operatingExpenses=dollar(gross*0.89);
   raw.explanation="Synthetic excess-expense report for examiner investigation.";
  }
 }
 const data=normalizeReturnData(type,raw);
 const taxPolicy=policy||defaultPolicy(year,type);
 const calculation=calculateReturn(taxPolicy,data);
 return {name,region,industry,type,taxYear:year,data,calculation,
  scenarioMode:mode,economy,simulated:true};
}
export function scenarioCaseNumber(kind,year,taxpayerId){
 const codes={audit:"AUD",appeal:"APL",collection:"COL"};
 if(!codes[kind]||!Number.isInteger(year)||year<2025||year>2035||
    typeof taxpayerId!=="string"||!/^[A-Za-z0-9]{20}$/.test(taxpayerId))
  throw Error("Invalid case number source.");
 return "URA-"+codes[kind]+"-"+year+"-"+taxpayerId.slice(0,12).toUpperCase();
}
export function economicEvents({fromDate,toDate,days,economy,seed=123,sequence=0}){
 simulationDate(fromDate);simulationDate(toDate);
 if(!ECONOMIES.includes(economy))throw Error("Invalid fictional economy.");
 const rand=makeRandom((validateSeed(seed)+sequence*65537+days)>>>0);
 const events=[
  {kind:"economy",headline:({
    steady:"Regional trade activity remains stable",
    expansion:"Business investment rises across the regions",
    recession:"Employment softens in several districts",
    volatile:"Business conditions fluctuate across the regions"})[economy],
   details:"Economic indicator updated for the fictional time period.",impact:Math.round((rand()-.5)*14)},
  {kind:"filing",headline:"Taxpayer filing cycle progressed",
   details:"Agency filing and review deadlines now reflect the advanced simulation date.",impact:Math.round(rand()*8)},
  {kind:"treasury",headline:"Treasury monitoring period updated",
   details:"Previously recorded financial transactions remain unchanged; the simulation has moved its reference date.",impact:0}
 ];
 if(new Date(fromDate+"T00:00:00Z").getUTCMonth()!==new Date(toDate+"T00:00:00Z").getUTCMonth()){
  events.push({kind:"calendar",headline:"New fiscal reporting month opened",
   details:"Monthly operational reporting is available for the next simulated period.",impact:0});
 }
 return events.map(x=>({...x,date:toDate}));
}
