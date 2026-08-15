import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const SCRATCH_DIR = path.join(process.cwd(), "data", "sandbox");

export interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  executionTimeMs: number;
}

/**
 * Executes a Python script in a controlled sandbox environment.
 * Supports calculations, data manipulation, dynamic script generation, and system queries.
 */
export async function runPythonCode(code: string, timeoutMs: number = 10000): Promise<ExecutionResult> {
  if (!fs.existsSync(SCRATCH_DIR)) {
    fs.mkdirSync(SCRATCH_DIR, { recursive: true });
  }

  const scriptPath = path.join(SCRATCH_DIR, `script_${Date.now()}.py`);
  fs.writeFileSync(scriptPath, code, "utf-8");

  const startTime = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync("python3", [scriptPath], {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024 * 5, // 5MB output buffer
      cwd: SCRATCH_DIR
    });

    const executionTimeMs = Date.now() - startTime;
    // Clean up temporary script
    fs.unlink(scriptPath, () => {});

    return {
      success: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      executionTimeMs
    };
  } catch (error: any) {
    const executionTimeMs = Date.now() - startTime;
    fs.unlink(scriptPath, () => {});

    return {
      success: false,
      stdout: error.stdout ? error.stdout.trim() : "",
      stderr: error.stderr ? error.stderr.trim() : error.message,
      executionTimeMs
    };
  }
}
