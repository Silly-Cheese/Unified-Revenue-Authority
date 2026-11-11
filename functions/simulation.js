// Generation 5: controlled, audited fictional economy and workload simulation.
// The simulation changes only fictional data and is deliberately manual—no background charges/jobs.
import {onCall,HttpsError} from "firebase-functions/v2/https";
import {getFirestore,FieldValue} from "firebase-admin/firestore";
import {defaultPolicy,validatePolicy} from "./lib/tax-engine.js";
import {deriveAccount} from "./lib/treasury-engine.js";
import {ECONOMIES,FILING_MODES,SCENARIOS,simulationDate,advanceDate,validateSeed,buildNpc,economicEvents} from "./lib/simulation-engine.js";

const database=()=>getFirestore();
const opts={cors:true};
const STAFF=["commissioner","supervisor","staff","auditor"];
const SIM_REF="simulation";
const STATE_COLLECTION="system";
const defaultState=()=>({
 initialized:false,currentDate:"2026-11-01",economy:"steady",seed:73011,
 generatedNpcCount:0,generatedReturns:0,scenarioCount:0,clockAdvances:0,batchCount:0,
 totalEvents:0,revision:0
});
const error=(code,message)=>{throw new HttpsError(code,message);};
const dateText=x=>x?.toDate?.()?.toISOString?.()||null;
async function identity(req){
 if(!req.auth?.uid)error("unauthenticated","Sign in first.");
 const uid=req.auth.uid,profile=await database().collection("users").doc(uid).get();
 if(!profile.exists||profile.data().status!=="active")error("permission-denied","Inactive account.");
 return {uid,...profile.data()};
}
function staff(a){if(!STAFF.includes(a.role))error("permission-denied","Agency employee access is required.");}
function commissioner(a){if(a.role!=="commissioner")error("permission-denied","Only the Commissioner may change the fictional world.");}
function supervisor(a){if(!["commissioner","supervisor"].includes(a.role))error("permission-denied","Supervisor authority required.");}
function stateRef(){return database().collection(STATE_COLLECTION).doc(SIM_REF);}
function log(a,action,detail,targetId){
 return {actorUid:a.uid,actorName:a.displayName,action,detail,targetId,
  createdAt:FieldValue.serverTimestamp()};
}
function serialize(data,id){
 const output={id,...data};
 for(const key of ["createdAt","updatedAt","initializedAt","generatedAt"]){
  if(output[key])output[key]=dateText(output[key]);
 }
 return output;
}
function acceptCount(raw,max=12){
 const n=Number(raw);
 if(!Number.isInteger(n)||n<0||n>max)error("invalid-argument","Count must be a whole number between 0 and "+max+".");
 return n;
}
function requireState(snap){
 if(!snap.exists||snap.data()?.initialized!==true)error("failed-precondition","Initialize the fictional simulation before running workloads.");
 return snap.data();
}
function policyRef(year,type){return database().collection("taxPolicies").doc(year+"_"+type);}
function taxCaseId(taxRef,year){return "RET-"+year+"-"+taxRef.id.slice(0,8).toUpperCase();}
function scenarioCaseId(kind,accountKey){return "SIM_"+kind+"_"+accountKey;}
function scenarioInitial(kind){return kind==="appeal"?"submitted":"open";}

export const getSimulationOverview=onCall(opts,async req=>{
 const a=await identity(req);staff(a);
 const [state,people,runs,events,simCounts,returnCounts]=await Promise.all([
  stateRef().get(),
  database().collection("taxpayers").where("simulated","==",true).limit(80).get(),
  database().collection("simulationRuns").orderBy("createdAt","desc").limit(15).get(),
  database().collection("simulationEvents").orderBy("createdAt","desc").limit(35).get(),
  database().collection("taxpayers").where("simulated","==",true).count().get(),
  database().collection("taxReturns").where("simulationOrigin","==","ura_engine").count().get()
 ]);
 const s=state.exists?state.data():defaultState();
 const population=people.docs.map(x=>({id:x.id,name:x.data().fullName,type:x.data().type,
  region:x.data().region,industry:x.data().industry||"",taxYear:x.data().simulatedTaxYear||null,
  scenarioMode:x.data().scenarioMode||"standard"}));
 return {
  state:{...s,initializedAt:dateText(s.initializedAt),updatedAt:dateText(s.updatedAt)},
  metrics:{taxpayers:simCounts.data().count,returns:returnCounts.data().count},
  population,
  runs:runs.docs.map(x=>serialize(x.data(),x.id)),
  events:events.docs.map(x=>serialize(x.data(),x.id)),
  limits:{maxPopulationPerBatch:12,maxScenariosPerRun:6,maxAdvanceDays:90},
  disclaimer:"Entirely fictional: no real identities, taxes, payroll, charges or payments."
 };
});

export const initializeSimulation=onCall(opts,async req=>{
 const a=await identity(req);commissioner(a);
 await database().runTransaction(async tx=>{
  const ref=stateRef(),snap=await tx.get(ref);
  if(snap.exists)error("already-exists","Simulation already initialized.");
  tx.create(ref,{...defaultState(),initialized:true,revision:1,
   initializedBy:a.uid,initializedAt:FieldValue.serverTimestamp(),
   updatedAt:FieldValue.serverTimestamp()});
  tx.create(database().collection("auditLogs").doc(),
   log(a,"Simulation initialized","Created fictional economic world with an adjustable 2026 reference date.",SIM_REF));
 });
 return {ok:true};
});

export const configureSimulation=onCall(opts,async req=>{
 const a=await identity(req);commissioner(a);
 const economy=String(req.data?.economy||"");
 if(!ECONOMIES.includes(economy))error("invalid-argument","Choose a supported economic climate.");
 let seed;
 try{seed=validateSeed(req.data?.seed);}catch(e){error("invalid-argument",e.message);}
 await database().runTransaction(async tx=>{
  const ref=stateRef(),snap=await tx.get(ref);
  requireState(snap);
  tx.update(ref,{economy,seed,revision:FieldValue.increment(1),
   updatedBy:a.uid,updatedAt:FieldValue.serverTimestamp()});
  tx.create(database().collection("auditLogs").doc(),
   log(a,"Simulation configuration changed","Economic climate updated to "+economy+".",SIM_REF));
 });
 return {ok:true};
});

export const generateSimulationPopulation=onCall(opts,async req=>{
 const a=await identity(req);commissioner(a);
 const individuals=acceptCount(req.data?.individuals),businesses=acceptCount(req.data?.businesses);
 if(individuals+businesses<1||individuals+businesses>12)
  error("invalid-argument","Select 1–12 fictional taxpayers per batch.");
 const mode=String(req.data?.mode||"standard");
 if(!FILING_MODES.includes(mode))error("invalid-argument","Unsupported filing scenario.");
 const prepared=[];
 for(let i=0;i<individuals;i++)prepared.push({type:"individual",taxRef:database().collection("taxpayers").doc(),
  returnRef:database().collection("taxReturns").doc()});
 for(let i=0;i<businesses;i++)prepared.push({type:"business",taxRef:database().collection("taxpayers").doc(),
  returnRef:database().collection("taxReturns").doc()});
 const runRef=database().collection("simulationRuns").doc();
 const eventRef=database().collection("simulationEvents").doc();
 let generated,flagged;
 await database().runTransaction(async tx=>{
  const configSnap=await tx.get(stateRef()),config=requireState(configSnap);
  const year=Number(config.currentDate.slice(0,4));
  if(year<2025||year>2035)error("failed-precondition","The current simulated tax year is unsupported.");
  const types=[...new Set(prepared.map(p=>p.type))];
  const loaded={};
  for(const type of types){
   const ref=policyRef(year,type),snap=await tx.get(ref);
   loaded[type]={ref,snap,policy:snap.exists?validatePolicy(snap.data()):defaultPolicy(year,type)};
  }
  let countFlags=0,reportedIncomeCents=0;
  for(const [i,p] of prepared.entries()){
   const serial=config.generatedNpcCount+i;
   const simulated=buildNpc({serial,type:p.type,year,economy:config.economy,
    mode,seed:config.seed,policy:loaded[p.type].policy});
   const {name,region,industry,data,calculation}=simulated;
   countFlags+=calculation.reviewFlags.length>0?1:0;
   reportedIncomeCents+=calculation.grossIncomeCents;
   const taxId=p.taxRef.id,returnId=p.returnRef.id;
   tx.create(p.taxRef,{
    fullName:name,type:p.type,region,industry,taxpayerNumber:"NPC-"+taxId.toUpperCase(),
    ownerUid:null,notes:"Fictional generated taxpayer, not a real person or business.",
    status:"active",simulated:true,simulationOrigin:"ura_engine",
    simulationBatchId:runRef.id,simulatedTaxYear:year,scenarioMode:mode,
    createdBy:a.uid,createdAt:FieldValue.serverTimestamp()
   });
   tx.create(p.returnRef,{
    taxpayerId:taxId,taxpayerName:name,ownerUid:null,
    returnType:p.type,taxYear:year,caseNumber:taxCaseId(p.returnRef,year),
    status:"submitted",revision:1,submissionCount:1,simulated:true,
    simulationOrigin:"ura_engine",simulationBatchId:runRef.id,
    data,calculation,policySnapshot:loaded[p.type].policy,
    createdBy:a.uid,submittedBy:a.uid,createdAt:FieldValue.serverTimestamp(),
    submittedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()
   });
  }
  // Submission locks both versioned fictional tax policies, just like player filings.
  for(const type of types){
   const {ref,snap,policy}=loaded[type];
   if(!snap.exists)tx.create(ref,{...policy,lockedAt:FieldValue.serverTimestamp(),
    lockedByReturnId:prepared.find(p=>p.type===type).returnRef.id,
    updatedAt:FieldValue.serverTimestamp(),updatedBy:"simulation_engine"});
   else if(!snap.data().lockedAt)tx.update(ref,{lockedAt:FieldValue.serverTimestamp(),
    lockedByReturnId:prepared.find(p=>p.type===type).returnRef.id});
  }
  tx.update(stateRef(),{
   generatedNpcCount:FieldValue.increment(prepared.length),
   generatedReturns:FieldValue.increment(prepared.length),
   batchCount:FieldValue.increment(1),totalEvents:FieldValue.increment(1),
   revision:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp()
  });
  tx.create(runRef,{kind:"population",mode,individuals,businesses,total:prepared.length,
   flaggedReturns:countFlags,grossIncomeCents:reportedIncomeCents,simulatedDate:config.currentDate,
   economy:config.economy,actorUid:a.uid,actorName:a.displayName,
   status:"completed",createdAt:FieldValue.serverTimestamp()});
  tx.create(eventRef,{kind:"population",headline:"New fictional taxpayer batch registered",
   description:prepared.length+" generated taxpayers submitted returns for simulated fiscal year "+year+".",
   simulatedDate:config.currentDate,runId:runRef.id,createdAt:FieldValue.serverTimestamp()});
  tx.create(database().collection("auditLogs").doc(),
   log(a,"Population batch generated","Created "+prepared.length+" simulated taxpayer returns.",runRef.id));
  generated=prepared.length;flagged=countFlags;
 });
 return {ok:true,runId:runRef.id,generated,flagged,
  message:"Fictional tax returns are now awaiting a real roleplay examiner's decision."};
});

export const advanceSimulationClock=onCall(opts,async req=>{
 const a=await identity(req);commissioner(a);
 const days=Number(req.data?.days);
 if(!Number.isInteger(days)||days<1||days>90)error("invalid-argument","Advance by 1–90 simulated days.");
 const runRef=database().collection("simulationRuns").doc();
 const refs=Array.from({length:4},()=>database().collection("simulationEvents").doc());
 let from,to,eventCount;
 await database().runTransaction(async tx=>{
  const snap=await tx.get(stateRef()),config=requireState(snap);
  from=simulationDate(config.currentDate);
  try{to=advanceDate(from,days);}catch(e){error("failed-precondition",e.message);}
  const events=economicEvents({fromDate:from,toDate:to,days,economy:config.economy,
   seed:config.seed,sequence:config.clockAdvances||0});
  eventCount=events.length;
  tx.update(stateRef(),{currentDate:to,clockAdvances:FieldValue.increment(1),
   totalEvents:FieldValue.increment(events.length),revision:FieldValue.increment(1),
   updatedAt:FieldValue.serverTimestamp()});
  tx.create(runRef,{kind:"clock",status:"completed",fromDate:from,toDate:to,days,
   eventCount:events.length,actorUid:a.uid,actorName:a.displayName,
   createdAt:FieldValue.serverTimestamp()});
  for(const [i,e] of events.entries())tx.create(refs[i],{...e,simulatedDate:to,
   runId:runRef.id,createdAt:FieldValue.serverTimestamp()});
  tx.create(database().collection("auditLogs").doc(),
   log(a,"Simulation clock advanced","Advanced "+days+" days: "+from+" to "+to+".",runRef.id));
 });
 return {ok:true,fromDate:from,toDate:to,eventCount};
});

export const runSimulationScenario=onCall(opts,async req=>{
 const a=await identity(req);supervisor(a);
 const scenario=String(req.data?.scenario||"");
 if(!SCENARIOS.includes(scenario))error("invalid-argument","Unknown RP workload scenario.");
 const limitCount=acceptCount(req.data?.count,6);
 if(limitCount<1)error("invalid-argument","Select at least one scenario case.");
 const stateSnap=await stateRef().get(),config=requireState(stateSnap);
 // Only NPC tax accounts that were actually assessed by a human examiner are eligible.
 const eligibleSnap=await database().collection("treasuryAccounts").where("simulated","==",true).limit(100).get();
 const eligible=eligibleSnap.docs.map(x=>({id:x.id,...x.data()})).filter(x=>{
  try{
   const acct=deriveAccount(x);
   if(acct.ownerUid)return false;
   if(scenario==="collection_cycle")return acct.outstandingCents>0;
   if(scenario==="refund_review")return acct.refundAvailableCents>0;
   return true;
  }catch{return false;}
 }).sort((x,y)=>x.id.localeCompare(y.id));
 const selected=eligible.slice(0,Math.min(eligible.length,limitCount*3));
 if(!selected.length)return {ok:true,created:0,reason:"No eligible simulated assessed taxpayer accounts. Generate NPC returns and accept them first."};
 const runRef=database().collection("simulationRuns").doc(),eventRef=database().collection("simulationEvents").doc();
 let result;
 await database().runTransaction(async tx=>{
  const current=await tx.get(stateRef()),live=requireState(current);
  if(live.revision!==config.revision)error("aborted","Simulation changed. Reload the control center and retry.");
  // Reads must precede writes in Firestore transactions.
  const candidateDocs=[];
  for(const c of selected){
   const accountRef=database().collection("treasuryAccounts").doc(c.id);
   const kind=scenario==="audit_sweep"?"audit":scenario==="collection_cycle"?"collection":
    scenario==="appeal_wave"?"appeal":"refund";
   const targetRef=kind==="refund"?database().collection("treasuryRefunds").doc("SIM_REF_"+c.id):
    database().collection("agencyCases").doc(scenarioCaseId(kind,c.id));
   const [accountSnap,existing]=await Promise.all([tx.get(accountRef),tx.get(targetRef)]);
   candidateDocs.push({accountSnap,targetRef,existing,kind,c});
  }
  const picked=[];
  for(const item of candidateDocs){
   if(picked.length>=limitCount)break;
   if(item.existing.exists||!item.accountSnap.exists)continue;
   const acct=deriveAccount(item.accountSnap.data());
   if(!acct.simulated||acct.ownerUid)continue;
   if(scenario==="collection_cycle"&&acct.outstandingCents<=0)continue;
   if(scenario==="refund_review"&&acct.refundAvailableCents<=0)continue;
   picked.push({ref:item.targetRef,kind:item.kind,acct});
  }
  if(!picked.length)error("failed-precondition","Candidate scenarios already exist; use other simulated accounts.");
  for(const {ref,kind,acct} of picked){
   if(kind==="refund"){
    const amount=Math.max(1,Math.floor(acct.refundAvailableCents*0.6));
    tx.create(ref,{taxAccountId:acct.taxpayerId+"_"+acct.taxYear+"_"+acct.returnType,
     taxpayerId:acct.taxpayerId,ownerUid:null,taxpayerName:acct.taxpayerName,
     taxYear:acct.taxYear,returnType:acct.returnType,amountCents:amount,
     reason:"Simulated taxpayer requested a credit refund during workload generation.",
     status:"requested",requestedBy:"simulation_engine",requestedByName:"URA Simulation",
     simulated:true,simulationRunId:runRef.id,createdAt:FieldValue.serverTimestamp(),
     requestedAt:FieldValue.serverTimestamp()});
   }else{
    const caseNumber="URA-"+({audit:"AUD",collection:"COL",appeal:"APL"})[kind]+
     "-"+acct.taxYear+"-"+ref.id.slice(-8).toUpperCase();
    const description=kind==="audit"?
      "Synthetic examination opened following automated review of a fictional taxpayer return.":
     kind==="collection"?
      "Simulated overdue tax account selected for correspondence and collection review.":
      "Fictional taxpayer disputes the amount assessed under the simulated tax policy.";
    tx.create(ref,{caseNumber,kind,status:scenarioInitial(kind),title:({
     audit:"Simulated return accuracy review",collection:"Outstanding assessed balance review",
     appeal:"Administrative tax assessment appeal"})[kind],
     summary:description,taxAccountId:acct.taxpayerId+"_"+acct.taxYear+"_"+acct.returnType,
     taxpayerId:acct.taxpayerId,taxpayerName:acct.taxpayerName,ownerUid:null,
     taxYear:acct.taxYear,returnType:acct.returnType,priority:"standard",
     dueDate:null,assignedTo:null,assignedToName:"",proposalStatus:null,
     simulated:true,simulationRunId:runRef.id,
     createdBy:"simulation_engine",createdByName:"URA Simulation",
     createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),revision:1});
    tx.create(database().collection("agencyCaseEvents").doc(),{
     caseId:ref.id,kind:"opened",body:description,visibility:"internal",
     actorUid:"simulation_engine",actorName:"URA Simulation",metadata:{simulated:true},
     createdAt:FieldValue.serverTimestamp()
    });
   }
  }
  tx.create(runRef,{kind:"scenario",scenario,total:picked.length,status:"completed",
   simulatedDate:live.currentDate,actorUid:a.uid,actorName:a.displayName,
   createdAt:FieldValue.serverTimestamp()});
  tx.create(eventRef,{kind:"workload",headline:"Scenario workload created",
   description:picked.length+" simulated "+scenario.replaceAll("_"," ")+" cases entered agency queues.",
   simulatedDate:live.currentDate,runId:runRef.id,createdAt:FieldValue.serverTimestamp()});
  tx.update(stateRef(),{scenarioCount:FieldValue.increment(picked.length),
   totalEvents:FieldValue.increment(1),revision:FieldValue.increment(1),
   updatedAt:FieldValue.serverTimestamp()});
  tx.create(database().collection("auditLogs").doc(),log(a,"Simulation scenario generated",
   scenario+": "+picked.length+" items.",runRef.id));
  result={ok:true,created:picked.length,runId:runRef.id};
 });
 return result;
});