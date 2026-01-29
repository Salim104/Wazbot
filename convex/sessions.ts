import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

export const getByOwner = query({
  args: { ownerId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", args.ownerId))
      .unique();
  },
});

export const create = mutation({
  args: { ownerId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.insert("sessions", {
      ownerId: args.ownerId,
      status: "INITIALIZING",
      menuState: "IDLE",
      lastActivity: Date.now(),
      autoSaveEnabled: false,
      phoneSyncEnabled: false,
      metrics: {
        saved: 0,
        unsaved: 0,
        announcementsSent: 0,
      },
    });
  },
});

export const updateStatus = mutation({
  args: {
    sessionId: v.id("sessions"),
    status: v.union(
      v.literal("INITIALIZING"),
      v.literal("WAIT_QR"),
      v.literal("CONNECTED"),
      v.literal("DISCONNECTED")
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, { status: args.status });
  },
});

export const saveQR = mutation({
  args: {
    sessionId: v.id("sessions"),
    qrCode: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, {
      qrCode: args.qrCode,
      status: "WAIT_QR",
    });
  },
});

export const saveOwnerDetails = mutation({
  args: {
    sessionId: v.id("sessions"),
    ownerWid: v.string(),
    ownerNumber: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, {
      ownerWid: args.ownerWid,
      ownerNumber: args.ownerNumber,
      status: "CONNECTED",
      qrCode: undefined, // Clear QR once connected
    });
  },
});

export const updateActivity = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, { lastActivity: Date.now() });
  },
});

export const updateMenuState = mutation({
  args: {
    sessionId: v.id("sessions"),
    menuState: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, {
      menuState: args.menuState,
      lastActivity: Date.now(),
    });

    // Schedule inactivity check in 10 minutes
    await ctx.scheduler.runAfter(10 * 60 * 1000, api.sessions.checkTimeout, {
      sessionId: args.sessionId,
    });
  },
});

export const checkTimeout = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;

    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    if (session.lastActivity < tenMinutesAgo && session.menuState !== "IDLE") {
      await ctx.db.patch(args.sessionId, {
        menuState: "IDLE",
      });
    }
  },
});

export const toggleAutoSave = mutation({
  args: {
    sessionId: v.id("sessions"),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, { autoSaveEnabled: args.enabled });
  },
});

export const updateStorageId = mutation({
  args: {
    ownerId: v.id("users"),
    storageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", args.ownerId))
      .unique();
    if (session) {
      await ctx.db.patch(session._id, { storageId: args.storageId });
    }
  },
});

export const togglePhoneSync = mutation({
  args: {
    sessionId: v.id("sessions"),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, { phoneSyncEnabled: args.enabled });
  },
});
export const updateDraftMessage = mutation({
  args: {
    sessionId: v.id("sessions"),
    draftMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, { draftMessage: args.draftMessage });
  },
});
export const updateInitialMetrics = mutation({
  args: {
    sessionId: v.id("sessions"),
    unsavedCount: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (session) {
      await ctx.db.patch(args.sessionId, {
        metrics: {
          ...session.metrics,
          unsaved: args.unsavedCount,
        },
      });
    }
  },
});
export const getById = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sessionId);
  },
});

export const saveGoogleTokens = mutation({
  args: {
    sessionId: v.id("sessions"),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    expiryDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const patch: any = {
      googleAccessToken: args.accessToken,
      googleTokenExpiry: args.expiryDate,
    };
    if (args.refreshToken) {
      patch.googleRefreshToken = args.refreshToken;
    }
    await ctx.db.patch(args.sessionId, patch);
  },
});
