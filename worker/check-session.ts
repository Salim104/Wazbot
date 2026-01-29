import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import * as dotenv from "dotenv";

dotenv.config();

const CONVEX_URL = process.env.CONVEX_URL || "";
const OWNER_ID = process.env.OWNER_ID || "";

const client = new ConvexHttpClient(CONVEX_URL);

async function check() {
  console.log(`Checking Convex URL: ${CONVEX_URL}`);
  console.log(`Checking OWNER_ID: ${OWNER_ID}`);

  if (!OWNER_ID) {
    console.error("OWNER_ID is empty in .env");
    return;
  }

  // @ts-ignore
  const session = await client.query(api.sessions.getByOwner, { ownerId: OWNER_ID });
  if (session) {
    console.log("✅ Session found:", session._id);
    console.log("Status:", session.status);
    console.log("Owner WID:", session.ownerWid);
    console.log("Storage ID:", session.storageId);
  } else {
    console.log("❌ No session found for this OWNER_ID.");
  }
}

check().catch(console.error);
