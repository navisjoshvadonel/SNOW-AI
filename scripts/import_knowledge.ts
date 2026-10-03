import fs from "fs";
import path from "path";
import { ragIngest } from "../rag.js"; // Assuming rag.ts is imported like this

const DATA_DIR = path.join(process.cwd(), "data");

async function importAlpacaDataset() {
  console.log("Fetching Alpaca dataset from GitHub...");
  const dataPath = path.join(process.cwd(), "data", "alpaca_data.json");
  const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

  console.log(`Fetched ${data.length} items. Processing a sample of 200 items for knowledge base...`);
  
  // We take a sample to avoid taking too long in the ingestion process
  const sample = data.slice(0, 200);
  
  // 1. Ingest into RAG database
  for (let i = 0; i < sample.length; i++) {
    const item = sample[i];
    const text = `Instruction: ${item.instruction}\nInput: ${item.input}\nOutput: ${item.output}`;
    await ragIngest(text, `alpaca_dataset_${i}`, "fact");
    if (i % 50 === 0 && i > 0) {
      console.log(`Ingested ${i} items into RAG...`);
    }
  }
  console.log("Successfully ingested into RAG database.");

  // 2. Append to training_alpaca.jsonl for fine-tuning
  const alpacaPath = path.join(DATA_DIR, "training_alpaca.jsonl");
  let newEntries = "";
  for (const item of data.slice(0, 1000)) { // Add 1000 items to the training dataset
    const entry = {
      instruction: item.instruction,
      input: item.input,
      output: item.output,
      system: "You are an intelligent assistant."
    };
    newEntries += JSON.stringify(entry) + "\n";
  }
  
  fs.appendFileSync(alpacaPath, newEntries);
  console.log(`Appended 1000 items to ${alpacaPath} for model fine-tuning.`);
}

importAlpacaDataset().catch(console.error);
