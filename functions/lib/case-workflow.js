// Generation 4 — deterministic, inspectable case transitions for RP workflows.
import {canAccessTaxpayerRecord} from "./portal-access.js";
export const CASE_TYPES=["audit","appeal","collection","investigation"];
export const CASE_TRANSITIONS={
 audit:{open:["information_requested","under_review","closed"],information_requested:["under_review","closed"],
  under_review:["information_requested","proposed_adjustment","resolved","closed"],
  proposed_adjustment:["under_review","resolved","closed"],resolved:["closed"],closed:[]},
 appeal:{submitted:["under_review","information_requested"],information_requested:["under_review"],
  under_review:["information_requested","awaiting_decision","resolved"],
  awaiting_decision:["under_review","resolved"],resolved:["closed"],closed:[]},
 collection:{open:["contacted","arrangement_pending","resolved","closed"],
  contacted:["arrangement_pending","resolved","closed"],
  arrangement_pending:["contacted","resolved","closed"],resolved:["closed"],closed:[]},
 investigation:{open:["gathering","closed"],gathering:["referred","closed"],referred:["closed"],closed:[]}
};
export function canAdvance(kind,current,next){
 return Boolean(CASE_TRANSITIONS[kind]?.[current]?.includes(next));
}
export function initialCaseStatus(kind){
 if(!CASE_TYPES.includes(kind))throw new Error("Invalid agency case type.");
 return kind==="appeal"?"submitted":"open";
}
export function canCitizenReadCase(uid,taxpayerId,record){
 return record.kind!=="investigation" &&
 canAccessTaxpayerRecord({uid,taxpayerId},record);
}
