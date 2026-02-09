import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { groupContactsByDate } from "./utils";

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

    // Opt-out inheritance logic:
    // If we have a phone number, check if ANY contact with this phone number is opted out
    let shouldBeOptedOut = false;
    if (args.phoneNumber) {
      const existingOptedOut = await ctx.db
        .query("contacts")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
        .collect();
      
      shouldBeOptedOut = existingOptedOut.some(c => c.phoneNumber === args.phoneNumber && c.isOptedOut);
    }

    let id = existing?._id;
    if (existing) {
      await ctx.db.patch(existing._id, {
        isSaved: true,
        phoneNumber: args.phoneNumber || existing.phoneNumber,
        isOptedOut: shouldBeOptedOut || existing.isOptedOut, // Inherit or keep
        metadata: args.metadata,
        convexSyncStatus: args.convexSyncStatus || existing.convexSyncStatus,
        phoneSyncStatus: args.phoneSyncStatus || existing.phoneSyncStatus,
        syncErrorMessage: args.syncErrorMessage || existing.syncErrorMessage,
        lastSyncAttempt: Date.now(),
      });
    } else {
      id = await ctx.db.insert("contacts", {
        sessionId: args.sessionId,
        waId: args.waId,
        phoneNumber: args.phoneNumber,
        isSaved: true,
        isOptedOut: shouldBeOptedOut, // Inherit
        metadata: args.metadata,
        convexSyncStatus: args.convexSyncStatus,
        phoneSyncStatus: args.phoneSyncStatus,
        syncErrorMessage: args.syncErrorMessage,
        lastSyncAttempt: Date.now(),
        retryCount: 0,
      });
    }

    // Increment metrics
    const session = await ctx.db.get(args.sessionId);
    if (session) {
      const metrics = session.metrics;
      const isNew = !existing;
      await ctx.db.patch(args.sessionId, {
        metrics: {
          ...metrics,
          saved: (metrics.saved ?? 0) + (isNew ? 1 : 0),
          unsaved: Math.max(0, (metrics.unsaved ?? 0) - (isNew ? 1 : 0)),
        },
      });
    }

    return id;
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

export const getSyncHistory = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    return groupContactsByDate(contacts);
  },
});

export const toggleOptOut = mutation({
  args: {
    sessionId: v.id("sessions"),
    waId: v.string(),
    optOut: v.boolean(),
  },
  handler: async (ctx, args) => {
    // 1. Collect all potential contact records for this person
    // We look for exact waId match OR phone number match if waId is @c.us
    const contactsToUpdate = [];
    
    // Check exact waId
    const exactMatch = await ctx.db
      .query("contacts")
      .withIndex("by_session_and_waId", (q) =>
        q.eq("sessionId", args.sessionId).eq("waId", args.waId)
      )
      .unique();
    if (exactMatch) contactsToUpdate.push(exactMatch);

    // If waId is @c.us, look for others by phone number
    if (args.waId.endsWith("@c.us")) {
      const phoneNumber = args.waId.replace("@c.us", "");
      const byPhone = await ctx.db
        .query("contacts")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
        .collect();
      
      for (const c of byPhone) {
        if (c.phoneNumber === phoneNumber && c._id !== exactMatch?._id) {
          contactsToUpdate.push(c);
        }
      }
    }

    if (contactsToUpdate.length > 0) {
      for (const contact of contactsToUpdate) {
        const updates: any = { isOptedOut: args.optOut };
        // Any contact being opted out should be considered "saved" for filtering
        if (args.optOut && !contact.isSaved) {
          updates.isSaved = true;
          // Update session metrics
          const session = await ctx.db.get(args.sessionId);
          if (session) {
            await ctx.db.patch(args.sessionId, {
              metrics: {
                ...session.metrics,
                saved: (session.metrics.saved ?? 0) + 1,
              },
            });
          }
        }
        await ctx.db.patch(contact._id, updates);
      }
      return contactsToUpdate[0]._id;
    }

    // 2. If no record exists, create a new one
    const newContactId = await ctx.db.insert("contacts", {
      sessionId: args.sessionId,
      waId: args.waId,
      phoneNumber: args.waId.endsWith("@c.us") ? args.waId.replace("@c.us", "") : undefined,
      isSaved: true,
      isOptedOut: args.optOut,
      metadata: {
        name: "Excluded Contact",
        lastInteraction: Date.now(),
      },
      retryCount: 0,
    });

    if (args.optOut) {
      const session = await ctx.db.get(args.sessionId);
      if (session) {
        await ctx.db.patch(args.sessionId, {
          metrics: {
            ...session.metrics,
            saved: (session.metrics.saved ?? 0) + 1,
          },
        });
      }
    }

    return newContactId;
  },
});

export const getExcludedContacts = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contacts")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) => q.eq(q.field("isOptedOut"), true))
      .collect();
  },
});
