import test from "node:test";
import assert from "node:assert/strict";
import {
 ECONOMIES,FILING_MODES,SCENARIOS,makeRandom,simulationDate,advanceDate,
 buildNpc,economicEvents,validateSeed,scenarioCaseNumber
} from "../lib/simulation-engine.js";

test("simulated taxpayer generator is deterministic for a world seed",()=>{
 const input={serial:2,type:"individual",year:2026,economy:"steady",mode:"standard",seed:73011};
 const first=buildNpc(input),again=buildNpc(input);
 assert.deepEqual(first,again);
 assert.match(first.name,/^[A-Za-z]+ [A-Za-z]+$/);
 assert.equal(first.simulated,true);
 assert.equal(first.data.attested,true);
 assert.equal(first.calculation.type,"individual");
 assert.equal(first.calculation.refundCents>=0,true);
 assert.equal(first.calculation.balanceCents>=0,true);
 assert.equal(first.name.includes("@"),false);
});
test("business RP records create meaningful fiscal calculations",()=>{
 const b=buildNpc({serial:14,type:"business",year:2026,economy:"expansion",mode:"complex",seed:123});
 assert.equal(b.type,"business");
 assert.ok(b.industry.length>3);
 assert.ok(b.calculation.grossIncomeCents>=0);
 assert.ok(b.calculation.taxableIncomeCents>=0);
 assert.equal(b.data.attested,true);
});
test("discrepancy mode generates genuine examiner flags",()=>{
 const a=buildNpc({serial:5,type:"individual",year:2026,mode:"discrepancies",seed:123});
 const b=buildNpc({serial:6,type:"business",year:2026,mode:"discrepancies",seed:123});
 assert.ok(a.calculation.reviewFlags.length>=1);
 assert.ok(b.calculation.reviewFlags.length>=1);
});
test("fiscal dates validate and advance across month boundaries",()=>{
 assert.equal(simulationDate("2026-11-11"),"2026-11-11");
 assert.equal(advanceDate("2026-11-30",1),"2026-12-01");
 assert.equal(advanceDate("2028-02-28",1),"2028-02-29");
 assert.throws(()=>simulationDate("2026-02-31"));
 assert.throws(()=>advanceDate("2035-12-31",1));
 assert.throws(()=>advanceDate("2026-11-11",91));
});
test("economic events reflect fiscal calendar changes without mutating accounts",()=>{
 const base={fromDate:"2026-11-26",toDate:"2026-12-03",days:7,economy:"recession",seed:73011,sequence:1};
 const ev=economicEvents(base);
 assert.equal(ev.length,4);
 assert.deepEqual(ev,economicEvents(base));
 assert.ok(ev.some(x=>x.kind==="calendar"));
 assert.ok(ev.every(x=>x.date===base.toDate));
 assert.ok(ev.every(x=>!Object.hasOwn(x,"paymentAmount")));
});
test("economies, filing modes and scenarios have controlled configurations",()=>{
 assert.deepEqual(ECONOMIES,["steady","expansion","recession","volatile"]);
 assert.deepEqual(FILING_MODES,["standard","complex","discrepancies"]);
 assert.deepEqual(SCENARIOS,["audit_sweep","collection_cycle","appeal_wave","refund_review"]);
 assert.throws(()=>buildNpc({serial:-1,type:"individual",year:2026}));
 assert.throws(()=>buildNpc({serial:1,type:"individual",year:1900}));
 assert.throws(()=>validateSeed(-1));
 assert.ok(makeRandom(1)()<1);
});


test("scenario references distinguish individual NPCs and case types",()=>{
 const one="ABCDEFGHIJKLMNOPQRST",two="UVWXYZABCDEFGHIJKLMN";
 const first=scenarioCaseNumber("audit",2026,one);
 const second=scenarioCaseNumber("audit",2026,two);
 assert.notEqual(first,second);
 assert.notEqual(first,scenarioCaseNumber("collection",2026,one));
 assert.match(first,/^URA-AUD-2026-[A-Z0-9]{12}$/);
 assert.throws(()=>scenarioCaseNumber("unknown",2026,one));
});
