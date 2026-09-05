import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const SANDBOX_DIR = path.join(process.cwd(), "data", "sandbox");

export interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  executionTimeMs: number;
  sandboxed?: boolean;
}

export interface SandboxOptions {
  timeoutMs?: number;
  maxMemoryMb?: number;
  allowNetwork?: boolean;
}

/**
 * Creates the isolated sandbox directory if not present.
 */
function ensureSandboxDir(): void {
  if (!fs.existsSync(SANDBOX_DIR)) {
    fs.mkdirSync(SANDBOX_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Generates the Python guardian wrapper code that enforces:
 *  - sys.addaudithook: blocks subprocess execution, network sockets, sensitive file reads
 *  - resource.setrlimit: enforces CPU time and memory ceilings
 *  - Clean namespace execution
 */
function buildGuardianWrapper(userCode: string, maxMemoryMb: number, timeoutSecs: number, allowNetwork: boolean): string {
  const encodedUserCode = Buffer.from(userCode, "utf-8").toString("base64");
  
  return `# -*- coding: utf-8 -*-
import sys
import base64
import os

# --- 1. Resource Limits (Linux) ---
try:
    import resource
    # Limit memory (Address Space)
    mem_bytes = ${maxMemoryMb} * 1024 * 1024
    resource.setrlimit(resource.RLIMIT_AS, (mem_bytes, mem_bytes))
    # Limit CPU time (seconds)
    cpu_limit = ${timeoutSecs}
    resource.setrlimit(resource.RLIMIT_CPU, (cpu_limit, cpu_limit + 1))
    # Limit file size write to 10MB
    resource.setrlimit(resource.RLIMIT_FSIZE, (10 * 1024 * 1024, 10 * 1024 * 1024))
    # Limit open file descriptors to 64
    resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
except Exception:
    pass

# --- 2. Security Audit Hook ---
BLOCKED_PROCESS_EVENTS = {
    'os.system', 'os.posix_spawn', 'os.posix_spawnp', 'os.spawn', 'posix.system',
    'subprocess.Popen', 'pty.spawn', '_posixsubprocess.fork_exec'
}

BLOCKED_PATH_PATTERNS = [
    '.env', '/etc/shadow', '/etc/sudoers', '/etc/passwd',
    '.ssh', 'id_rsa', 'id_ed25519', '.git', 'snow_brain.db', 'snow_rag.db'
]

def security_audit_hook(event, args):
    # Block process spawning
    if event in BLOCKED_PROCESS_EVENTS:
        raise PermissionError(f"Security Alert: Execution of external process ({event}) is strictly prohibited in Snow Sandbox.")

    # Block network sockets if network access is restricted
    if not ${allowNetwork ? "True" : "False"}:
        if event in ('socket.connect', 'socket.bind', 'socket.sendto'):
            raise PermissionError(f"Security Alert: Outbound network connection ({event}) is blocked in isolated sandbox.")

    # Block sensitive file reads / writes
    if event in ('open', 'os.remove', 'os.unlink', 'os.mkdir', 'os.rmdir'):
        if args and len(args) > 0:
            target_path = str(args[0]).lower()
            for pattern in BLOCKED_PATH_PATTERNS:
                if pattern in target_path:
                    raise PermissionError(f"Security Alert: Access to protected filesystem path '{target_path}' is denied.")

try:
    sys.addaudithook(security_audit_hook)
except Exception:
    pass

# --- 3. Execute User Payload in Isolated __main__ ---
raw_code = base64.b64decode("${encodedUserCode}").decode("utf-8")
sandbox_globals = {
    "__name__": "__main__",
    "__doc__": None,
    "__package__": None,
    "__builtins__": __builtins__
}

try:
    compiled = compile(raw_code, "<snow_sandbox>", "exec")
    exec(compiled, sandbox_globals)
except Exception as e:
    import traceback
    tb_lines = traceback.format_exc().splitlines()
    filtered_tb = [l for l in tb_lines if "buildGuardianWrapper" not in l and "raw_code" not in l]
    sys.stderr.write("\\n".join(filtered_tb) + "\\n")
    sys.exit(1)
`;
}

/**
 * Executes a Python script inside an isolated, hardened sandbox environment.
 * 
 * Protections:
 * - Scrubbed environment (NO host process.env or API keys leaked)
 * - Linux RLIMIT restrictions on memory (default 256MB) and CPU time
 * - Python 3.8+ sys.addaudithook blocking subprocesses, network calls, and secret file accesses
 * - Isolated scratch directory with automatic cleanup
 */
export async function runPythonCode(
  code: string,
  timeoutMs: number = 10000,
  options?: SandboxOptions
): Promise<ExecutionResult> {
  ensureSandboxDir();

  const maxMemoryMb = options?.maxMemoryMb || 256;
  const allowNetwork = options?.allowNetwork || false;
  const timeoutSecs = Math.max(1, Math.ceil(timeoutMs / 1000));

  const scriptId = `runner_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.py`;
  const scriptPath = path.join(SANDBOX_DIR, scriptId);

  const guardianCode = buildGuardianWrapper(code, maxMemoryMb, timeoutSecs, allowNetwork);
  fs.writeFileSync(scriptPath, guardianCode, { encoding: "utf-8", mode: 0o600 });

  const startTime = Date.now();

  // Completely scrub environment: never leak host process.env or GEMINI_API_KEY
  const sanitizedEnv: NodeJS.ProcessEnv = {
    PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
    LANG: "en_US.UTF-8",
    PYTHONUNBUFFERED: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    TMPDIR: SANDBOX_DIR
  };

  try {
    const { stdout, stderr } = await execFileAsync("python3", [scriptPath], {
      timeout: timeoutMs,
      maxBuffer: 5 * 1024 * 1024, // 5MB buffer cap
      cwd: SANDBOX_DIR,
      env: sanitizedEnv
    });

    const executionTimeMs = Date.now() - startTime;
    return {
      success: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      executionTimeMs,
      sandboxed: true
    };
  } catch (error: any) {
    const executionTimeMs = Date.now() - startTime;
    let errMsg = error.stderr ? error.stderr.trim() : error.message;

    if (error.killed) {
      errMsg = `Execution timed out after ${timeoutMs}ms (Process terminated by sandbox guardian).`;
    }

    return {
      success: false,
      stdout: error.stdout ? error.stdout.trim() : "",
      stderr: errMsg,
      executionTimeMs,
      sandboxed: true
    };
  } finally {
    try {
      if (fs.existsSync(scriptPath)) {
        fs.unlinkSync(scriptPath);
      }
    } catch {}
  }
}

