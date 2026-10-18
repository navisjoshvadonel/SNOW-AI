import { test, describe } from "node:test";
import assert from "node:assert";
import { linuxSystemActuator } from "../services/linuxSystemActuator.js";

describe("LinuxSystemActuator Native Control & Telemetry", () => {
  test("queries audio status without throwing", async () => {
    const status = await linuxSystemActuator.getAudioStatus();
    assert.ok(typeof status.volumePct === "number");
    assert.ok(typeof status.muted === "boolean");
    assert.ok(typeof status.success === "boolean");
  });

  test("queries system resource vitals (CPU, RAM, Disk)", async () => {
    const resources = await linuxSystemActuator.getSystemResources();
    if (resources) {
      assert.ok(typeof resources.cpuPct === "number");
      assert.ok(typeof resources.memoryPct === "number");
      assert.ok(typeof resources.diskRootPct === "number");
      assert.ok(resources.cpuPct >= 0 && resources.cpuPct <= 100);
      assert.ok(resources.memoryPct >= 0 && resources.memoryPct <= 100);
      assert.ok(resources.diskRootPct >= 0 && resources.diskRootPct <= 100);
    }
  });

  test("lists open windows with resilient fallback", async () => {
    const windows = await linuxSystemActuator.listOpenWindows();
    assert.ok(Array.isArray(windows), "Must return an array of windows");
  });

  test("rejects empty application launch requests safely", async () => {
    const res = await linuxSystemActuator.launchApplication("");
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.app, "");
  });

  test("generates unified actuator state snapshot", async () => {
    const state = await linuxSystemActuator.getSystemActuatorState();
    assert.ok(state.timestamp);
    assert.ok(typeof state.windowsCount === "number");
    assert.ok(state.audio);
  });
});
