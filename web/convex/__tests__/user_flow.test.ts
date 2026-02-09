import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.*s");

describe("User & Session Lifecycle", () => {
  it("should create a user and a linked session atomically", async () => {
    const t = convexTest(schema, modules);

    // 1. Create User
    const clerkId = "user_123";
    const email = "test@example.com";
    const userId = await t.mutation(api.users.create, { clerkId, email });

    // 2. Verify User Exists
    const user = await t.query(api.users.getById, { userId });
    expect(user).toMatchObject({ clerkId, email, plan: "FREE" });

    // 3. Create Session
    const sessionId = await t.mutation(api.sessions.create, { ownerId: userId });
    
    // 4. Verify Session is linked and initialized correctly
    const session = await t.query(api.sessions.getById, { sessionId });
    expect(session).toMatchObject({
      ownerId: userId,
      status: "INITIALIZING",
      metrics: {
        saved: 0,
        unsaved: 0,
        announcementsSent: 0
      }
    });
  });

  it("should be idempotent when creating existing users", async () => {
     const t = convexTest(schema, modules);
     const clerkId = "repeat_user";
     
     const id1 = await t.mutation(api.users.create, { clerkId, email: "1@test.com" });
     const id2 = await t.mutation(api.users.create, { clerkId, email: "2@test.com" });
     
     expect(id1).toBe(id2);
  });

  it("should promote a user to admin with correct secret", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.mutation(api.users.create, { clerkId: "clerk_admin", email: "admin@test.com" });

    await t.mutation(api.users.setAdmin, { userId, secret: "wazbot_admin_2026" });
    
    const user = await t.query(api.users.getById, { userId });
    expect(user?.isAdmin).toBe(true);
  });
});
