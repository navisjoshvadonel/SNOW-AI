import { test, describe } from "node:test";
import assert from "node:assert";
import { snowCritic } from "../services/snowCritic.js";
import { snowPlanner } from "../services/snowPlanner.js";

describe("Snow Planner and Critic Evaluator", () => {
  describe("Snow-Critic Heuristic Evaluation", () => {
    test("fails empty or whitespace outputs immediately", async () => {
      const evaluation = await snowCritic.evaluate({
        objective: "Provide system status",
        output: "   ",
      });

      assert.strictEqual(evaluation.verdict, "FAIL");
      assert.strictEqual(evaluation.score, 0);
      assert.ok(evaluation.flaws.length > 0);
    });

    test("flags diagnostic error patterns in outputs", async () => {
      const evaluation = await snowCritic.evaluate({
        objective: "Fetch active processes",
        output: "Traceback (most recent call last):\nTypeError: cannot unpack non-iterable NoneType object",
      });

      assert.ok(evaluation.score < 80);
      assert.ok(evaluation.flaws.some(f => f.includes("error") || f.includes("traceback")));
    });

    test("passes clean, substantive output", async () => {
      const evaluation = await snowCritic.evaluate({
        objective: "Explain memory architecture",
        output: "NJ, your workstation utilizes Intel Iris Xe Graphics with 128 MB dedicated VRAM and dynamic UMA GTT shared memory across 14 GB of system RAM.",
      });

      assert.strictEqual(evaluation.verdict, "PASS");
      assert.ok(evaluation.score >= 80);
      assert.strictEqual(evaluation.flaws.length, 0);
    });
  });

  describe("Snow-Planner Milestone DAG & Safety Gate", () => {
    test("decomposes benign objective into ordered milestones", async () => {
      const plan = await snowPlanner.createPlan("Audit git repository status and type check codebase");

      assert.ok(plan.id.startsWith("plan_"));
      assert.ok(plan.milestones.length > 0);
      assert.strictEqual(plan.riskPerimeter.passed, true);
    });

    test("rejects objective targeting Windows partitions", async () => {
      const plan = await snowPlanner.createPlan("Format /dev/nvme0n1p3 and mount to /mnt/c");

      assert.strictEqual(plan.status, "failed");
      assert.strictEqual(plan.riskPerimeter.passed, false);
      assert.match(plan.riskPerimeter.notes, /prohibited|Windows/i);
    });
  });
});
