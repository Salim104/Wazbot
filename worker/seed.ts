import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import * as dotenv from "dotenv";

dotenv.config();

const CONVEX_URL = process.env.CONVEX_URL || "";

if (!CONVEX_URL) {
  console.error("Missing CONVEX_URL");
  process.exit(1);
}

const client = new ConvexHttpClient(CONVEX_URL);

async function seed() {
  console.log("Seeding test data...");

  // 1. Create a test owner
  const userId = await client.mutation(api.users.create, {
    clerkId: "test_clerk_id",
    email: "test@example.com",
  });
  console.log(`Created test user: ${userId}`);

  // 2. Create a session for this owner
  const sessionId = await client.mutation(api.sessions.create, {
    ownerId: userId,
  });
  console.log(`Created test session: ${sessionId}`);

  console.log("\nUpdate your .env with:");
  console.log(`OWNER_ID=${userId}`);
}

seed().catch(console.error);
