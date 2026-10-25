import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTheme, THEME_COLORS } from "./themeClient.ts";

test("an explicit choice wins over the device setting, in both directions", () => {
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
});

test("system follows the device", () => {
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
});

test("both themes have a status-bar colour", () => {
  assert.match(THEME_COLORS.light, /^#[0-9a-f]{6}$/i);
  assert.match(THEME_COLORS.dark, /^#[0-9a-f]{6}$/i);
  assert.notEqual(THEME_COLORS.light, THEME_COLORS.dark);
});
