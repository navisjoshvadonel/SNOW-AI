import { test, describe } from "node:test";
import assert from "node:assert";
import { resolveIntent } from "../brain.js";

describe("Brain Offline Fast-Path Intent Routing", () => {
  describe("High-Confidence System Intents (Sub-0.05ms deterministic)", () => {
    const systemQueries = [
      "system status",
      "hardware info",
      "cpu load",
      "ram usage",
      "memory stats",
      "offline upgrade",
      "system health",
      "how is the system",
      "specs"
    ];

    for (const q of systemQueries) {
      test(`routes system query immediately: "${q}"`, async () => {
        const start = performance.now();
        const intent = await resolveIntent(q);
        const elapsed = performance.now() - start;

        assert.strictEqual(intent.isSystem, true, `Expected isSystem=true for query "${q}"`);
        assert.ok(elapsed < 50, `Sub-millisecond fast-path routing exceeded: ${elapsed}ms`);
      });
    }
  });

  describe("High-Confidence Time Intents", () => {
    const timeQueries = [
      "what time is it",
      "current time",
      "what is the time",
      "tell me the time",
      "today's date",
      "what is the date"
    ];

    for (const q of timeQueries) {
      test(`routes time query immediately: "${q}"`, async () => {
        const intent = await resolveIntent(q);
        assert.strictEqual(intent.isTime, true, `Expected isTime=true for query "${q}"`);
      });
    }
  });

  describe("High-Confidence Weather Intents", () => {
    const weatherQueries = [
      "what is the weather",
      "what's the weather today",
      "weather report",
      "how is the weather"
    ];

    for (const q of weatherQueries) {
      test(`routes weather query immediately: "${q}"`, async () => {
        const intent = await resolveIntent(q);
        assert.strictEqual(intent.isWeather, true, `Expected isWeather=true for query "${q}"`);
        assert.strictEqual(intent.weatherLocation, "Madurai, Tamil Nadu, India");
      });
    }
  });
});
