import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const start = mutation({
  args: {
    sessionId: v.id("sessions"),
    type: v.union(v.literal("BULK_SAVE"), v.literal("ANNOUNCEMENT")),
    total: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("operations", {
      sessionId: args.sessionId,
      type: args.type,
      status: "PROCESSING",
      progress: 0,
      total: args.total,
    });
  },
});

export const updateProgress = mutation({
  args: {
    sessionId: v.id("sessions"),
    type: v.union(v.literal("BULK_SAVE"), v.literal("ANNOUNCEMENT")),
    progress: v.number(),
    total: v.number(),
  },
  handler: async (ctx, args) => {
    const op = await ctx.db
      .query("operations")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) => q.eq(q.field("type"), args.type))
      .order("desc")
      .first();

    if (op) {
      await ctx.db.patch(op._id, { progress: args.progress, total: args.total });
    }
  },
});

export const complete = mutation({
  args: {
    sessionId: v.id("sessions"),
    type: v.union(v.literal("BULK_SAVE"), v.literal("ANNOUNCEMENT")),
  },
  handler: async (ctx, args) => {
    const op = await ctx.db
      .query("operations")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) => q.eq(q.field("type"), args.type))
      .order("desc")
      .first();

    if (op) {
      await ctx.db.patch(op._id, { status: "COMPLETED", progress: op.total });
    }
  },
});
