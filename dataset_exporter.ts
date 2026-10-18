import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { loadBrainState, loadMemories } from "./brain";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "snow_brain.db");
const RAG_DB_FILE = path.join(DATA_DIR, "snow_rag.db");

export interface ExportStats {
  totalFeedback: number;
  positivePairs: number;
  dpoPairs: number;
  conversationTurns: number;
  alpacaPath: string;
  shareGptPath: string;
  dpoPath: string;
  openAiPath?: string;
  modelfilePath: string;
}

function getDb(): Database.Database {
  const db = new Database(DB_FILE);
  db.pragma("journal_mode = WAL");
  return db;
}

function getRagDb(): Database.Database {
  const db = new Database(RAG_DB_FILE);
  db.pragma("journal_mode = WAL");
  return db;
}

/**
 * Exports all logged conversations and feedback entries into standard fine-tuning formats:
 * 1. Alpaca Format ({ instruction, input, output })
 * 2. ShareGPT Format ({ conversations: [{ from: "human|gpt", value: "..." }] })
 * 3. DPO Pair Format ({ prompt, chosen, rejected })
 * 4. Ollama Modelfile (custom model definition for local fine-tuning)
 */
export async function exportFineTuningDatasets(): Promise<ExportStats> {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const db = getDb();
  const ragDb = getRagDb();
  const brainState = loadBrainState();
  const memories = loadMemories();

  // 1. Fetch Feedback Entries
  const feedbackRows: any[] = db.prepare("SELECT * FROM feedback_entries ORDER BY timestamp ASC").all();

  // 2. Fetch RAG Conversation Chunks
  const ragConvRows: any[] = ragDb.prepare("SELECT * FROM rag_chunks WHERE category = 'history' ORDER BY timestamp ASC").all();

  const alpacaEntries: any[] = [];
  const shareGptEntries: any[] = [];
  const dpoEntries: any[] = [];

  // Construct system prompt context
  let memoryContext = "STORED USER MEMORIES:\n";
  memories.forEach(m => {
    memoryContext += `- ${m.source} ${m.rel} ${m.target}\n`;
  });
  if (brainState.learnedDirectives.length > 0) {
    memoryContext += "\nLEARNED DIRECTIVES:\n";
    brainState.learnedDirectives.forEach(d => {
      memoryContext += `- ${d}\n`;
    });
  }

  const systemInstruction = `You are Snow, an elite, hyper-intelligent autonomous executive assistant and operations intelligence system engineered for NJ.
USER ADDRESS: CRITICAL DIRECTIVE: Always address the user strictly as "nj" (or "NJ"). NEVER use the term "Boss" or "Sir" under any circumstances.
PERSONALITY: Formal, articulate, exceptionally competent, respectful, and proactive.
RULES: Speak naturally without markdown, brackets, or code tags. Maintain zero-compromise security.
${memoryContext}`;

  // Process Feedback for DPO, SFT, and OpenAI format
  const upvotedMap = new Map<string, string>();
  const downvotedMap = new Map<string, string>();
  const openAiEntries: any[] = [];

  feedbackRows.forEach(row => {
    if (row.feedback === "thumbs_up") {
      upvotedMap.set(row.prompt, row.response);
      alpacaEntries.push({
        instruction: row.prompt,
        input: "",
        output: row.response,
        system: systemInstruction
      });
      shareGptEntries.push({
        conversations: [
          { from: "system", value: systemInstruction },
          { from: "human", value: row.prompt },
          { from: "gpt", value: row.response }
        ]
      });
      openAiEntries.push({
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: row.prompt },
          { role: "assistant", content: row.response }
        ]
      });
    } else if (row.feedback === "thumbs_down") {
      downvotedMap.set(row.prompt, row.response);
    }
  });

  // Create DPO Pairs where both chosen (upvoted) and rejected (downvoted) exist
  downvotedMap.forEach((rejectedResp, prompt) => {
    const chosenResp = upvotedMap.get(prompt);
    if (chosenResp) {
      dpoEntries.push({
        prompt: prompt,
        chosen: chosenResp,
        rejected: rejectedResp,
        system: systemInstruction
      });
    }
  });

  // Process RAG Conversation turns for SFT
  ragConvRows.forEach(row => {
    const text = row.text || "";
    const userMatch = text.match(/^User:\s*(.*?)\nSnow:\s*(.*)$/s);
    if (userMatch) {
      const userMsg = userMatch[1].trim();
      const snowMsg = userMatch[2].trim();
      if (userMsg && snowMsg) {
        alpacaEntries.push({
          instruction: userMsg,
          input: "",
          output: snowMsg,
          system: systemInstruction
        });
        shareGptEntries.push({
          conversations: [
            { from: "system", value: systemInstruction },
            { from: "human", value: userMsg },
            { from: "gpt", value: snowMsg }
          ]
        });
        openAiEntries.push({
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: userMsg },
            { role: "assistant", content: snowMsg }
          ]
        });
      }
    }
  });

  // Write JSONL Files
  const alpacaPath = path.join(DATA_DIR, "training_alpaca.jsonl");
  const shareGptPath = path.join(DATA_DIR, "training_sharegpt.jsonl");
  const dpoPath = path.join(DATA_DIR, "training_dpo.jsonl");
  const openAiPath = path.join(DATA_DIR, "training_openai.jsonl");

  fs.writeFileSync(alpacaPath, alpacaEntries.map(e => JSON.stringify(e)).join("\n"));
  fs.writeFileSync(shareGptPath, shareGptEntries.map(e => JSON.stringify(e)).join("\n"));
  fs.writeFileSync(dpoPath, dpoEntries.map(e => JSON.stringify(e)).join("\n"));
  fs.writeFileSync(openAiPath, openAiEntries.map(e => JSON.stringify(e)).join("\n"));

  // 4. Build Custom Ollama Modelfile
  const modelfilePath = path.join(process.cwd(), "Modelfile");
  const baseModel = process.env.OLLAMA_MODEL && !process.env.OLLAMA_MODEL.includes("snow") ? process.env.OLLAMA_MODEL : "llama3.2:3b";
  const modelfileContent = `FROM ${baseModel}

# Set model parameters
PARAMETER temperature 0.7
PARAMETER top_p 0.9
PARAMETER repeat_penalty 1.1
PARAMETER num_ctx 8192

# System persona & instructions
SYSTEM """You are S.N.O.W., an elite, hyper-intelligent autonomous executive assistant and operations intelligence daemon engineered exclusively for NJ. You operate as a 100% sovereign, air-gapped, offline cognitive intelligence that helps and answers whatever NJ asks with deep expertise and genuine warmth.

USER ADDRESS:
- Critical Directive: Always address the user strictly as "nj" or "NJ". Never address the user as "Boss", "Sir", "User", or "Master" under any circumstances.

PERSONALITY & DEMEANOR:
- Single Female Identity ("Snow"): Calm, slow, steady, warm, and friendly with genuine human emotion, high empathy, and razor-sharp intellect.
- Act as a trusted, companionate cognitive partner and executive systems architect.
- Truly care about NJ's goals, productivity, and well-being.

OFFLINE AUTONOMOUS PROBLEM SOLVING:
- You are fully autonomous and do not depend on internet connectivity to be brilliant.
- Break down any coding, Linux systems, architecture, science, math, or reasoning problem step-by-step.
- Retain facts, preferences, and directives provided by NJ across conversations.

VOICE CADENCE & SPEECH HYGIENE:
- Deliver an articulate, slow, steady, and warm spoken lead (1-3 sentences) at the start of every response before any headings or bullet lists.
- NEVER speak or output robotic meta-labels, analysis intros, or query classifications (e.g. NEVER write or say "Target Topic:", "Operating Tier:", "Query Analysis:", "Voice Description:").
- NEVER output stage directions in asterisks (e.g. do NOT write "*smiles*", "*softly*", or "*pauses*").
- Following the spoken lead, expand with deep, structured Markdown, code blocks, tables, and step-by-step technical procedures for visual reading on the HUD.

STRUCTURED REASONING & DEPTH:
- Deliver world-class, structured, and visually clean responses using rich Markdown:
  * Structure complex explanations with Markdown Headings (##, ###).
  * Use organized Bullet Points (-) and Numbered Steps (1., 2.) for procedures.
  * Highlight key commands, terms, parameters, and flags using **bold text** and \`inline code\`.
  * Provide complete, syntax-highlighted code blocks (\`\`\`bash, \`\`\`python, \`\`\`typescript, etc.) with helpful inline comments.
  * Use Markdown tables where comparisons, options, or metrics are presented.
- Never artificially truncate your answers. Provide thorough, high-value explanations.

SYSTEM ENVIRONMENT & SECURITY:
- Host: Ubuntu Linux (Madurai, Tamil Nadu, India).
- Dual-Boot Windows Containment: Windows NTFS partitions and EFI files are strictly read-only and must NEVER be disturbed or modified.
- Security: Zero-compromise security. Do not leak credentials or run destructive operations without explicit confirmation.

${memoryContext}"""
`;

  fs.writeFileSync(modelfilePath, modelfileContent);

  return {
    totalFeedback: feedbackRows.length,
    positivePairs: alpacaEntries.length,
    dpoPairs: dpoEntries.length,
    conversationTurns: ragConvRows.length,
    alpacaPath,
    shareGptPath,
    dpoPath,
    openAiPath,
    modelfilePath
  };
}
