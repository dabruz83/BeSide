const test = require("node:test");
const assert = require("node:assert/strict");

test("multi-select answers preserve every selection and allow toggling", async () => {
  const { selectedValues, toggleAnswer } = await import("./src/lib/agencyMarketingAnswers.mjs");
  let answer = toggleAnswer("", "Professionale", true);
  answer = toggleAnswer(answer, "Semplice", true);
  assert.deepEqual(selectedValues(answer), ["Professionale", "Semplice"]);
  answer = toggleAnswer(answer, "Professionale", true);
  assert.deepEqual(selectedValues(answer), ["Semplice"]);
});

test("older single-value answers remain editable", async () => {
  const { selectedValues, toggleAnswer } = await import("./src/lib/agencyMarketingAnswers.mjs");
  assert.deepEqual(selectedValues("Professionale"), ["Professionale"]);
  assert.equal(toggleAnswer("Post", "Reel", false), "Reel");
});

test("post, carousel and reel select the matching generation action", async () => {
  const { generatedAction } = await import("./src/lib/agencyMarketingAnswers.mjs");
  assert.equal(generatedAction("Post"), "post");
  assert.equal(generatedAction("Carosello"), "carousel");
  assert.equal(generatedAction("Reel"), "reel");
});
