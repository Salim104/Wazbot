import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const addToRetryQueue = mutation({
  args: {
    contactId: v.id("contacts"),
    sessionId: v.id("sessions"),
    waId: v.string(),
    retryType: v.union(v.literal("convex"), v.literal("phone")),
    errorMessage: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // Check if already in queue
    const existing = await ctx.db
      .query("retryQueue")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) => q.and(
        q.eq(q.field("contactId"), args.contactId),
        q.eq(q.field("retryType"), args.retryType)
      ))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        attempts: existing.attempts + 1,
        lastAttempt: Date.now(),
        errorMessage: args.errorMessage,
      });
    } else {
      await ctx.db.insert("retryQueue", {
        contactId: args.contactId,
        sessionId: args.sessionId,
        waId: args.waId,
        retryType: args.retryType,
        attempts: 1,
        lastAttempt: Date.now(),
        errorMessage: args.errorMessage,
        metadata: args.metadata || {},
      });
    }

    // Update pending retries metric
    const session = await ctx.db.get(args.sessionId);
    if (session) {
      await ctx.db.patch(args.sessionId, {
        metrics: {
          ...session.metrics,
          pendingRetries: (session.metrics.pendingRetries ?? 0) + (existing ? 0 : 1),
          // Increment specific failure metrics
          convexSyncFailed: (session.metrics.convexSyncFailed ?? 0) + (args.retryType === "convex" ? 1 : 0),
          phoneSyncFailed: (session.metrics.phoneSyncFailed ?? 0) + (args.retryType === "phone" ? 1 : 0),
        }
      });
    }
  },
});

export const getRetryQueue = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("retryQueue")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .collect();
  },
});

export const removeFromRetryQueue = mutation({
  args: { 
    retryId: v.id("retryQueue"),
    sessionId: v.id("sessions")
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.retryId);
    
    // Decrement pending retries metric
    const session = await ctx.db.get(args.sessionId);
    if (session) {
      await ctx.db.patch(args.sessionId, {
        metrics: {
          ...session.metrics,
          pendingRetries: Math.max(0, (session.metrics.pendingRetries ?? 0) - 1),
        }
      });
    }
  },
});
