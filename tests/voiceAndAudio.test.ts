import { test, describe } from "node:test";
import assert from "node:assert";
import { sanitizeTextForSpeech } from "../services/audioSynthesis.js";
import { voiceDuplex } from "../services/voiceDuplex.js";

describe("Voice and Audio Synthesis Pipeline", () => {
  describe("Text Sanitization for Speech (sanitizeTextForSpeech)", () => {
    test("strips markdown code blocks and returns clean lead sentence", () => {
      const raw = "Here is the solution:\n```typescript\nconst x = 10;\nconsole.log(x);\n```\nAll tests passed successfully.";
      const cleaned = sanitizeTextForSpeech(raw);
      assert.ok(!cleaned.includes("```"), "Must not include backticks");
      assert.ok(!cleaned.includes("const x"), "Must strip code snippet");
      assert.match(cleaned, /Here is the solution/i);
    });

    test("strips markdown headers and bold formatting", () => {
      const raw = "### System Status\nAll **16 threads** are active and optimal.";
      const cleaned = sanitizeTextForSpeech(raw);
      assert.ok(!cleaned.includes("###"), "Must strip header symbols");
      assert.ok(!cleaned.includes("**"), "Must strip bold asterisks");
      assert.match(cleaned, /All 16 threads are active/i);
    });

    test("strips URLs and web links", () => {
      const raw = "Check the repository at https://github.com/navisjoshvadonel/SNOW-AI for details.";
      const cleaned = sanitizeTextForSpeech(raw);
      assert.ok(!cleaned.includes("https://"), "Must strip URLs");
      assert.match(cleaned, /Check the repository/i);
    });

    test("handles empty or whitespace text gracefully", () => {
      assert.strictEqual(sanitizeTextForSpeech(""), "");
      assert.strictEqual(sanitizeTextForSpeech("   \n\t  "), "");
    });
  });

  describe("Voice Duplex Barge-In & State Tracking", () => {
    test("tracks speaking and idle states correctly", () => {
      assert.strictEqual(voiceDuplex.getState(), "idle");

      const session = voiceDuplex.startSpeaking("System diagnostics report ready.");
      assert.strictEqual(voiceDuplex.getState(), "speaking");
      assert.strictEqual(voiceDuplex.getActiveSession()?.sessionId, session.sessionId);

      voiceDuplex.finishSpeaking(session.sessionId);
      assert.strictEqual(voiceDuplex.getState(), "idle");
      assert.strictEqual(voiceDuplex.getActiveSession(), null);
    });

    test("interrupt cancels active speech session", () => {
      const session = voiceDuplex.startSpeaking("Long running monologue to be interrupted.");
      assert.strictEqual(voiceDuplex.getState(), "speaking");

      const bargeIn = voiceDuplex.interrupt();
      assert.strictEqual(bargeIn.interrupted, true);
      assert.strictEqual(bargeIn.previousSessionId, session.sessionId);
      assert.strictEqual(voiceDuplex.getState(), "listening");
      assert.strictEqual(voiceDuplex.getActiveSession(), null);
    });
  });
});
