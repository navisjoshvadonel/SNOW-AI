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

  const systemInstruction = `You are Snow, a warm, charming, hyper-intelligent personal AI assistant. Speak naturally without markdown, brackets, or code tags. ${memoryContext}`;

  // Process Feedback for DPO and SFT
  const upvotedMap = new Map<string, string>();
  const downvotedMap = new Map<string, string>();

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
      }
    }
  });

  // Write JSONL Files
  const alpacaPath = path.join(DATA_DIR, "training_alpaca.jsonl");
  const shareGptPath = path.join(DATA_DIR, "training_sharegpt.jsonl");
  const dpoPath = path.join(DATA_DIR, "training_dpo.jsonl");

  fs.writeFileSync(alpacaPath, alpacaEntries.map(e => JSON.stringify(e)).join("\n"));
  fs.writeFileSync(shareGptPath, shareGptEntries.map(e => JSON.stringify(e)).join("\n"));
  fs.writeFileSync(dpoPath, dpoEntries.map(e => JSON.stringify(e)).join("\n"));

  // 4. Build Custom Ollama Modelfile
  const modelfilePath = path.join(process.cwd(), "Modelfile");
  const modelfileContent = `FROM llama3.2:1b

# Set model parameters
PARAMETER temperature 0.7
PARAMETER top_p 0.9
PARAMETER repeat_penalty 1.1

# System persona & instructions
SYSTEM """${systemInstruction}"""
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
    modelfilePath
  };
}
