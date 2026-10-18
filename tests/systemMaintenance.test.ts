import { test, describe } from "node:test";
import assert from "node:assert";
import { systemMaintenance } from "../services/systemMaintenance.js";

describe("SystemMaintenance Staged Sudo & Safety Protocol", () => {
  describe("Staged Proposal Creation", () => {
    test("creates a staged maintenance proposal requiring operator permission", async () => {
      const proposal = await systemMaintenance.createStagedProposal("upgrade");

      assert.ok(proposal.id.startsWith("MAINT-UPGRADE-"));
      assert.strictEqual(proposal.isSudoRequired, true);
      assert.strictEqual(proposal.status, "PENDING_OPERATOR_APPROVAL");
      assert.strictEqual(proposal.dualBootSafetyCertified, true);
      assert.match(proposal.commandToExecute, /sudo apt/);
      assert.match(proposal.confirmationPrompt, /NJ/);
      assert.match(proposal.confirmationPrompt, /Windows partitions/);
    });

    test("stages full_system_maintenance with safe chaining", async () => {
      const proposal = await systemMaintenance.createStagedProposal("full_system_maintenance");

      assert.ok(proposal.id.startsWith("MAINT-FULL_SYSTEM_MAINTENANCE-"));
      assert.strictEqual(proposal.isSudoRequired, true);
      assert.strictEqual(proposal.status, "PENDING_OPERATOR_APPROVAL");
      assert.strictEqual(proposal.dualBootSafetyCertified, true);
    });
  });

  describe("Operator Sudo Approval Gate", () => {
    test("rejects execution if operator permission was denied", async () => {
      const proposal = await systemMaintenance.createStagedProposal("clean_cache");
      const result = await systemMaintenance.executeApprovedProposal(proposal.id, false);

      assert.strictEqual(result.success, false);
      assert.match(result.output, /not granted by NJ/i);
      assert.strictEqual(result.proposal?.status, "REJECTED");
    });

    test("handles non-existent proposal ID gracefully", async () => {
      const result = await systemMaintenance.executeApprovedProposal("MAINT-FAKE-99999", true);
      assert.strictEqual(result.success, false);
      assert.match(result.output, /not found/i);
    });
  });

  describe("Safe Non-Destructive Reclamation", () => {
    test("runs user-space safe maintenance sweep without sudo", async () => {
      const result = await systemMaintenance.performSafeMaintenance();
      assert.strictEqual(result.success, true);
      assert.ok(Array.isArray(result.actionsTaken));
      assert.ok(typeof result.reclaimedKb === "number");
    });
  });
});
