#!/usr/bin/env node
/**
 * Setup Verification Script for Wazbot
 * Checks if all required configuration is in place
 */

const fs = require("fs");
const path = require("path");

console.log("🔍 Checking Wazbot setup...\n");

const checks = [];

// Check 1: .env file exists and has required values
function checkEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) {
    return { pass: false, message: ".env file not found" };
  }

  const envContent = fs.readFileSync(envPath, "utf8");
  const hasConvexUrl =
    envContent.includes("CONVEX_URL=") &&
    !envContent.includes("your-deployment-name");
  const hasOwnerId =
    envContent.includes("OWNER_ID=") && envContent.match(/OWNER_ID=\w+/);

  if (!hasConvexUrl) {
    return { pass: false, message: "CONVEX_URL not set in .env" };
  }
  if (!hasOwnerId) {
    return { pass: false, message: "OWNER_ID not set in .env" };
  }

  return { pass: true, message: ".env file configured" };
}

// Check 2: .env.local exists (created by convex dev)
function checkEnvLocal() {
  const envLocalPath = path.join(__dirname, ".env.local");
  if (!fs.existsSync(envLocalPath)) {
    return {
      pass: false,
      message: ".env.local not found (run: npx convex dev)",
    };
  }

  const content = fs.readFileSync(envLocalPath, "utf8");
  if (!content.includes("CONVEX_DEPLOYMENT=")) {
    return { pass: false, message: ".env.local missing CONVEX_DEPLOYMENT" };
  }

  return { pass: true, message: ".env.local configured by Convex" };
}

// Check 3: convex/_generated exists
function checkConvexGenerated() {
  const generatedPath = path.join(__dirname, "convex", "_generated");
  if (!fs.existsSync(generatedPath)) {
    return {
      pass: false,
      message: "convex/_generated not found (run: npx convex dev)",
    };
  }

  const apiPath = path.join(generatedPath, "api.d.ts");
  const dataModelPath = path.join(generatedPath, "dataModel.d.ts");

  if (!fs.existsSync(apiPath) || !fs.existsSync(dataModelPath)) {
    return { pass: false, message: "Generated types incomplete" };
  }

  return { pass: true, message: "Convex types generated" };
}

// Check 4: node_modules exists
function checkNodeModules() {
  const nmPath = path.join(__dirname, "node_modules");
  if (!fs.existsSync(nmPath)) {
    return {
      pass: false,
      message: "node_modules not found (run: npm install)",
    };
  }
  return { pass: true, message: "Dependencies installed" };
}

// Check 5: Schema files exist
function checkSchema() {
  const schemaPath = path.join(__dirname, "convex", "schema.ts");
  const sessionsPath = path.join(__dirname, "convex", "sessions.ts");

  if (!fs.existsSync(schemaPath)) {
    return { pass: false, message: "convex/schema.ts not found" };
  }
  if (!fs.existsSync(sessionsPath)) {
    return { pass: false, message: "convex/sessions.ts not found" };
  }

  return { pass: true, message: "Convex schema files present" };
}

// Check 6: Worker files exist
function checkWorker() {
  const workerPath = path.join(__dirname, "worker", "index.ts");
  const storePath = path.join(__dirname, "worker", "convexStore.ts");

  if (!fs.existsSync(workerPath)) {
    return { pass: false, message: "worker/index.ts not found" };
  }
  if (!fs.existsSync(storePath)) {
    return { pass: false, message: "worker/convexStore.ts not found" };
  }

  return { pass: true, message: "Worker files present" };
}

// Run all checks
const results = [
  { name: "Node Modules", ...checkNodeModules() },
  { name: "Schema Files", ...checkSchema() },
  { name: "Worker Files", ...checkWorker() },
  { name: "Generated Types", ...checkConvexGenerated() },
  { name: "Environment (.env)", ...checkEnvFile() },
  { name: "Convex Config (.env.local)", ...checkEnvLocal() },
];

// Display results
let allPassed = true;
results.forEach((result) => {
  const icon = result.pass ? "✅" : "❌";
  console.log(`${icon} ${result.name}: ${result.message}`);
  if (!result.pass) allPassed = false;
});

console.log("\n" + "=".repeat(50));

if (allPassed) {
  console.log("✅ Setup complete! You can now start the worker:");
  console.log("   npx tsx worker/index.ts");
} else {
  console.log("⚠️  Setup incomplete. Please follow SETUP.md for instructions.");
  console.log("\n📖 Quick start:");
  console.log("   1. npm install");
  console.log("   2. npx convex dev (in a separate terminal)");
  console.log("   3. Update .env with your CONVEX_URL and OWNER_ID");
  console.log("   4. Run this check again: node check-setup.js");
}

process.exit(allPassed ? 0 : 1);
