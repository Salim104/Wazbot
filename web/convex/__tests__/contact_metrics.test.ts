import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.*s");

describe("Contact Metrics Integration", () => {
  it("should increment 'saved' metric when a new contact is saved", async () => {
    const t = convexTest(schema, modules);

    // 1. Setup User and Session
    const userId = await t.mutation(api.users.create, { clerkId: "user_a", email: "a@test.com" });
    const sessionId = await t.mutation(api.sessions.create, { ownerId: userId });

    // 2. Save a new contact
    await t.mutation(api.contacts.saveContact, {
      sessionId,
      waId: "12345@c.us",
      metadata: { lastInteraction: Date.now() }
    });

    // 3. Check Session Metrics
    const session = await t.query(api.sessions.getById, { sessionId });
    expect(session?.metrics.saved).toBe(1);
  });
});
