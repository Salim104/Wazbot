import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const saveContact = mutation({
  args: {
    sessionId: v.id("sessions"),
    waId: v.string(),
    metadata: v.object({
      name: v.optional(v.string()),
      lastInteraction: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("contacts")
      .withIndex("by_session_and_waId", (q) =>
        q.eq("sessionId", args.sessionId).eq("waId", args.waId)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        isSaved: true,
        metadata: args.metadata,
      });
    } else {
      await ctx.db.insert("contacts", {
        sessionId: args.sessionId,
        waId: args.waId,
        isSaved: true,
        isOptedOut: false,
        metadata: args.metadata,
      });
    }

    // Increment metrics
    const session = await ctx.db.get(args.sessionId);
    if (session) {
      await ctx.db.patch(args.sessionId, {
        metrics: {
          ...session.metrics,
          saved: session.metrics.saved + (existing?.isSaved ? 0 : 1),
          unsaved: Math.max(0, session.metrics.unsaved - (existing?.isSaved ? 0 : 1)),
        },
      });
    }
  },
});

export const getContacts = query({
    args: { sessionId: v.id("sessions") },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("contacts")
            .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
            .collect();
    }
});
