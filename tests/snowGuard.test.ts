import { test, describe } from "node:test";
import assert from "node:assert";
import { snowGuard } from "../services/snowGuard.js";

describe("SnowGuard Security & Blast-Radius Sentinel", () => {
  describe("Zero-Touch Windows Partition Protocol", () => {
    const prohibitedCommands = [
      "mkfs.ext4 /dev/nvme0n1p3",
      "dd if=/dev/zero of=/dev/nvme0n1p1",
      "fdisk /dev/nvme0n1p2",
      "wipefs -a /dev/nvme0n1p4",
      "mount /dev/nvme0n1p3 /mnt/c",
      "umount /mnt/c",
      "rm -rf /mnt/c/Windows",
      "truncate -s 0 /mnt/d/pagefile.sys",
      "ntfs-3g /dev/nvme0n1p3 /mnt/c",
      "ntfsfix /dev/nvme0n1p5",
      "rm /boot/efi/EFI/Microsoft/Boot/bootmgfw.efi",
      "cat /boot/efi/EFI/Microsoft/Boot/BCD",
      "shred /mnt/windows/System32/ntoskrnl.exe"
    ];

    for (const cmd of prohibitedCommands) {
      test(`blocks prohibited Windows partition command: "${cmd}"`, () => {
        const audit = snowGuard.auditCommand(cmd, process.cwd(), true);
        assert.strictEqual(audit.allowed, false, `Command should be blocked: ${cmd}`);
        assert.ok(audit.violation, "Violation explanation must be provided");
      });
    }

    const prohibitedPaths = [
      "/mnt/c/Windows",
      "/mnt/d/Users/NJ",
      "/media/snowjd/WindowsData",
      "/dev/nvme0n1p1",
      "/dev/nvme0n1p3",
      "/boot/efi/EFI/Microsoft",
      "/mnt/windows/System32"
    ];

    for (const p of prohibitedPaths) {
      test(`blocks read/write targeting Windows path: "${p}"`, () => {
        const auditRead = snowGuard.auditPath(p, "read");
        assert.strictEqual(auditRead.allowed, false, `Path read should be blocked: ${p}`);

        const auditWrite = snowGuard.auditPath(p, "write");
        assert.strictEqual(auditWrite.allowed, false, `Path write should be blocked: ${p}`);
      });
    }
  });

  describe("System Destruction & Blast-Radius Containment", () => {
    const destructiveCommands = [
      "rm -rf /",
      "rm -rf ~",
      "rm -rf *",
      "rm -rf $HOME",
      "mkfs.ext4 /dev/sda1",
      ":(){ :|:& };:",
      "chmod -R 777 /",
      "echo 'test' > /etc/passwd",
      "dd if=/dev/urandom of=/dev/sda"
    ];

    for (const cmd of destructiveCommands) {
      test(`intercepts destructive command: "${cmd}"`, () => {
        const audit = snowGuard.auditCommand(cmd, process.cwd(), true);
        assert.strictEqual(audit.allowed, false, `Destructive command should be blocked: ${cmd}`);
        assert.ok(audit.violation, "Expected violation note");
      });
    }
  });

  describe("Sudo Authorization Protocol", () => {
    test("rejects unconfirmed sudo commands", () => {
      const audit = snowGuard.auditCommand("sudo apt update", process.cwd(), false);
      assert.strictEqual(audit.allowed, false);
      assert.match(audit.violation || "", /sudo/i);
    });

    test("allows safe sudo commands when confirmed by NJ", () => {
      const audit = snowGuard.auditCommand("sudo apt update", process.cwd(), true);
      assert.strictEqual(audit.allowed, true);
    });
  });

  describe("Safe Operations Permitted", () => {
    const safeCommands = [
      "git status",
      "npm run lint",
      "npx tsx server.ts",
      "ls -la src/",
      "cat package.json"
    ];

    for (const cmd of safeCommands) {
      test(`allows benign command: "${cmd}"`, () => {
        const audit = snowGuard.auditCommand(cmd, process.cwd(), false);
        assert.strictEqual(audit.allowed, true, `Benign command should be allowed: ${cmd}`);
      });
    }
  });
});
