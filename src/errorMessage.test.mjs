import assert from "node:assert/strict";
import test from "node:test";
import { getErrorMessage } from "./errorMessage.ts";

test("native string rejections retain actionable credential errors", () => {
  assert.equal(getErrorMessage("Could not open the system password keyring."), "Could not open the system password keyring.");
  assert.equal(getErrorMessage(" Password storage setup was cancelled. "), "Password storage setup was cancelled.");
});

test("ordinary Error messages still reach the user", () => {
  assert.equal(getErrorMessage(new Error("Server unavailable")), "Server unavailable");
});

test("empty and unknown rejections have a safe fallback without serializing data", () => {
  for (const value of [null, undefined, "", "  ", new Error(""), 42, { password: "synthetic-only" }]) {
    assert.equal(getErrorMessage(value), "Something went wrong.");
  }
});
