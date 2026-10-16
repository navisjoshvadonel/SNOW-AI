import { createAutonomousGoal, getAutonomousGoals, getGoalWithSubtasks, deleteAutonomousGoal } from "../brain";

async function main() {
  console.log("=== SEEDING SNOW AUTONOMOUS GOALS ===");

  const shouldClean = process.argv.includes("--clean") || process.argv.includes("--force");
  if (shouldClean) {
    const prev = getAutonomousGoals();
    for (const p of prev) {
      deleteAutonomousGoal(p.id);
      console.log(`[CLEAN] Removed previous goal: ${p.title} (${p.id})`);
    }
  }

  // Check existing goals
  const existing = getAutonomousGoals();
  console.log(`Current goals in database: ${existing.length}`);

  // Goal 1: Daily Morning System Briefing
  const g1Title = "Daily Morning System Briefing";
  const g1Desc = "Pre-compute weather for Madurai, Git cleanliness, and telemetry summary.";
  const existingG1 = existing.find(g => g.title === g1Title);
  if (!existingG1) {
    const g1 = createAutonomousGoal(g1Title, g1Desc, 1);
    console.log(`[SEED] ✅ Created Goal 1: "${g1Title}" (ID: ${g1.id}, Priority: 1)`);
  } else {
    console.log(`[SEED] Goal 1 already exists: ID: ${existingG1.id}, Status: ${existingG1.status}`);
  }

  // Goal 2: Proactive Git & Workspace Health
  const g2Title = "Proactive Git & Workspace Health";
  const g2Desc = "Automated verification of clean state and repo integrity.";
  const existingG2 = existing.find(g => g.title === g2Title);
  if (!existingG2) {
    const g2 = createAutonomousGoal(g2Title, g2Desc, 2);
    console.log(`[SEED] ✅ Created Goal 2: "${g2Title}" (ID: ${g2.id}, Priority: 2)`);
  } else {
    console.log(`[SEED] Goal 2 already exists: ID: ${existingG2.id}, Status: ${existingG2.status}`);
  }

  console.log("\n=== ALL GOALS IN SNOW BRAIN ===");
  const all = getAutonomousGoals();
  for (const g of all) {
    const withSubtasks = getGoalWithSubtasks(g.id);
    console.log(`- [${g.status.toUpperCase()}] ${g.title} (Priority: ${g.priority}, Progress: ${g.progressPct}%, Subtasks: ${withSubtasks?.subtasks?.length || 0})`);
  }
}

main().catch(err => {
  console.error("Seeding error:", err);
  process.exit(1);
});
