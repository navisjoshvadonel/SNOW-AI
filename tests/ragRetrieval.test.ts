import { test, describe } from "node:test";
import assert from "node:assert";
import { ragSearch, ragAugmentPrompt, ragIngestFact } from "../rag.js";

describe("Offline Hybrid RAG Engine & Long-Term Memory Precision", () => {
  test("ingests and retrieves targeted fact via hybrid BM25 + dense retrieval", async () => {
    const testId = `test-offline-${Date.now()}`;
    const factText = `NJ operates the Snow offline executive assistant in Madurai, Tamil Nadu (Marker: ${testId}).`;
    await ragIngestFact("NJ", "test_marker", factText);

    const results = await ragSearch(testId, 5);
    assert.ok(results.length > 0, "Must retrieve recently ingested unique marker");
    const found = results.find(r => r.chunk.text.includes(testId));
    assert.ok(found, "Retrieved search results must contain testId marker");
    assert.strictEqual(found?.chunk.source, "user_facts");
  });

  test("retrieves regional heritage knowledge across deep historical chunks", async () => {
    const results = await ragSearch("Meenakshi Madurai Tamil Nadu", 3);
    assert.ok(results.length > 0, "Expected at least 1 match for core regional terms");
    const combined = results.map(r => r.chunk.text.toLowerCase()).join(" ");
    assert.ok(
      combined.includes("madurai") || combined.includes("meenakshi") || combined.includes("tamil"),
      "Search results must include relevant regional knowledge"
    );
  });

  test("ragAugmentPrompt formats retrieved knowledge with category tags", async () => {
    const promptContext = await ragAugmentPrompt("Madurai", 2);
    assert.ok(promptContext.length > 0, "Augmented prompt context must not be empty");
    assert.ok(promptContext.includes("RELEVANT KNOWLEDGE BASE CONTEXT"), "Must include RAG header");
  });
});
