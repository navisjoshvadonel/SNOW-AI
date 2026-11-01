import { test, describe } from "node:test";
import assert from "node:assert";
import {
  states,
  unionTerritories,
  historyTopics,
  regionalHeritageTopics,
  getIndiaKnowledgeStats,
  fetchWikiIntro
} from "../services/indiaKnowledgeUpdater.js";

describe("India Knowledge Updater & Regional Heritage Engine", () => {
  describe("Knowledge Catalogs Coverage", () => {
    test("contains all 28 Indian states including Tamil Nadu", () => {
      assert.strictEqual(states.length, 28);
      assert.ok(states.includes("Tamil Nadu"));
      assert.ok(states.includes("Kerala"));
      assert.ok(states.includes("Maharashtra"));
      assert.ok(states.includes("Karnataka"));
    });

    test("contains all 8 Union Territories", () => {
      assert.strictEqual(unionTerritories.length, 8);
      assert.ok(unionTerritories.includes("Delhi"));
      assert.ok(unionTerritories.includes("Puducherry"));
      assert.ok(unionTerritories.includes("Jammu and Kashmir"));
      assert.ok(unionTerritories.includes("Ladakh"));
    });

    test("contains core national history and civilization epochs", () => {
      assert.ok(historyTopics.length >= 15);
      assert.ok(historyTopics.includes("Constitution of India"));
      assert.ok(historyTopics.includes("Indian Space Research Organisation"));
      assert.ok(historyTopics.includes("Indus Valley Civilisation"));
    });

    test("contains Madurai and Tamil Nadu regional cultural heritage topics", () => {
      assert.ok(regionalHeritageTopics.length >= 8);
      assert.ok(regionalHeritageTopics.includes("Madurai"));
      assert.ok(regionalHeritageTopics.includes("Meenakshi Temple"));
      assert.ok(regionalHeritageTopics.includes("Vaigai River"));
      assert.ok(regionalHeritageTopics.includes("Thirukkural"));
      assert.ok(regionalHeritageTopics.includes("Sangam literature"));
    });
  });

  describe("Diagnostics and Resilience", () => {
    test("getIndiaKnowledgeStats returns accurate topic counts", () => {
      const stats = getIndiaKnowledgeStats();
      assert.strictEqual(stats.statesCount, 28);
      assert.strictEqual(stats.utCount, 8);
      assert.strictEqual(stats.historyCount, historyTopics.length);
      assert.strictEqual(stats.regionalHeritageCount, regionalHeritageTopics.length);
      assert.strictEqual(stats.totalTopics, 28 + 8 + historyTopics.length + regionalHeritageTopics.length);
      assert.strictEqual(typeof stats.dpoEntriesCount, "number");
    });

    test("fetchWikiIntro handles invalid or unresolvable topics gracefully", async () => {
      // Must return null within timeout without throwing unhandled exceptions
      const result = await fetchWikiIntro("NonExistentTopic_SnowAI_Test_123456789", 1500);
      assert.strictEqual(result, null);
    });
  });
});
