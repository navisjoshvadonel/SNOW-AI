import { test, describe } from "node:test";
import assert from "node:assert";
import { dreamCycle } from "../services/dreamCycle.js";
import {
  addEpisodicMemory,
  getRecentEpisodicMemories,
  addMemory,
  loadMemories,
  deleteMemory,
  decayMemories,
} from "../brain.js";

describe("DreamCycle & Memory Consolidation", () => {
  describe("Daemon State & Activity Tracking", () => {
    test("tracks user activity and updates idle timer", () => {
      dreamCycle.recordActivity();
      const status = dreamCycle.getStatus();

      assert.strictEqual(status.isDreaming, false);
      assert.ok(status.idleSec <= 2, "Idle seconds should be reset on activity");
    });
  });

  describe("Episodic Memory Management", () => {
    test("records and retrieves episodic memories", () => {
      const mem = addEpisodicMemory(
        "nj configured offline voice settings with Piper TTS",
        "episodic",
        "audio_config"
      );

      assert.ok(mem.id, "Episodic memory must have valid ID");
      assert.strictEqual(mem.content, "nj configured offline voice settings with Piper TTS");

      const recent = getRecentEpisodicMemories(200);
      const found = recent.find(e => e.id === mem.id);

      assert.ok(found, "Newly added episodic memory must be retrievable");
      assert.match(found.content, /Piper TTS/);
    });
  });

  describe("Semantic Knowledge Graph Operations", () => {
    test("adds, verifies, and deletes semantic memory nodes", () => {
      const target = `test_val_${Date.now()}`;
      addMemory("User", "Prefers", target, "Preference");

      const memories = loadMemories();
      const node = memories.find(m => m.target === target);
      assert.ok(node, "Semantic node must be found in database");
      assert.strictEqual(node.source, "User");
      assert.strictEqual(node.rel, "Prefers");

      // Cleanup
      deleteMemory(node.id);
      const afterDelete = loadMemories();
      assert.ok(!afterDelete.some(m => m.id === node.id), "Node must be deleted");
    });

    test("decayMemories runs safely without crashing graph DB", () => {
      const decayedCount = decayMemories(0.05, 0.15);
      assert.ok(typeof decayedCount === "number");
    });
  });
});
