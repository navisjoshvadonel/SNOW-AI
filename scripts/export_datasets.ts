import { exportFineTuningDatasets } from "../dataset_exporter.js";

async function main() {
  console.log("Exporting fine-tuning datasets...");
  const stats = await exportFineTuningDatasets();
  console.log("Export completed!", stats);
}

main().catch(console.error);
