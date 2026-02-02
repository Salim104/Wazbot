import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const saveContact = mutation({
  args: {
    sessionId: v.id("sessions"),
    waId: v.string(),
    phoneNumber: v.optional(v.string()),
    metadata: v.object({
      name: v.optional(v.string()),
      lastInteraction: v.number(),
    }),
    convexSyncStatus: v.optional(v.union(v.literal("success"), v.literal("failed"), v.literal("pending"))),
    phoneSyncStatus: v.optional(v.union(v.literal("success"), v.literal("failed"), v.literal("pending"))),
    syncErrorMessage: v.optional(v.string()),
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
        phoneNumber: args.phoneNumber || existing.phoneNumber,
        metadata: args.metadata,
        convexSyncStatus: args.convexSyncStatus || existing.convexSyncStatus,
        phoneSyncStatus: args.phoneSyncStatus || existing.phoneSyncStatus,
        syncErrorMessage: args.syncErrorMessage || existing.syncErrorMessage,
        lastSyncAttempt: Date.now(),
      });
      return existing._id;
    } else {
      const id = await ctx.db.insert("contacts", {
        sessionId: args.sessionId,
        waId: args.waId,
        phoneNumber: args.phoneNumber,
        isSaved: true,
        isOptedOut: false,
        metadata: args.metadata,
        convexSyncStatus: args.convexSyncStatus,
        phoneSyncStatus: args.phoneSyncStatus,
        syncErrorMessage: args.syncErrorMessage,
        lastSyncAttempt: Date.now(),
        retryCount: 0,
      });
      return id;
    }

    // Increment metrics
    const session = await ctx.db.get(args.sessionId);
    if (session) {
      const metrics = session!.metrics;
      await ctx.db.patch(args.sessionId, {
        metrics: {
          ...metrics,
          saved: (metrics.saved ?? 0) + (existing?.isSaved ? 0 : 1),
          unsaved: Math.max(0, (metrics.unsaved ?? 0) - (existing?.isSaved ? 0 : 1)),
        },
      });
    }
  },
});

export const getContact = query({
  args: { sessionId: v.id("sessions"), waId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contacts")
      .withIndex("by_session_and_waId", (q) =>
        q.eq("sessionId", args.sessionId).eq("waId", args.waId)
      )
      .unique();
  },
});

export const getContacts = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contacts")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .collect();
  },
});

export const updateSyncStatus = mutation({
  args: {
    contactId: v.id("contacts"),
    convexSyncStatus: v.optional(v.union(v.literal("success"), v.literal("failed"), v.literal("pending"))),
    phoneSyncStatus: v.optional(v.union(v.literal("success"), v.literal("failed"), v.literal("pending"))),
    syncErrorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.contactId, {
      convexSyncStatus: args.convexSyncStatus,
      phoneSyncStatus: args.phoneSyncStatus,
      syncErrorMessage: args.syncErrorMessage,
      lastSyncAttempt: Date.now(),
    });
  },
});



