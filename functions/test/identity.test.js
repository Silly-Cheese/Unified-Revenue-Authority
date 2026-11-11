import test from "node:test";
import assert from "node:assert/strict";
import {cleanName,validName,addressForName,COMMISSIONER_NAME} from "../lib/identity.js";
test("normalizes names consistently",()=>{
 assert.equal(cleanName("  Jordan   Vale  "),"Jordan Vale");
 assert.equal(addressForName("Jordan Vale"),addressForName("  JORDAN   VALE "));
});
test("rejects non-name and unsafe values",()=>{
 assert.equal(validName("<script>"),false);
 assert.equal(validName("A"),false);
 assert.equal(validName("Jordan Vale"),true);
});
test("official bootstrap identity uses a stable internal address",()=>{
 assert.match(addressForName(COMMISSIONER_NAME),/^[a-f0-9]{64}@accounts\.ura\.invalid$/);
});
test("unrelated fictional names receive different identifiers",()=>{
 assert.notEqual(addressForName("Jordan Vale"),addressForName("Alex Taylor"));
});