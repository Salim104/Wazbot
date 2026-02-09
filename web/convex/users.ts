import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: { clerkId: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    // Check if existing
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();
    if (existing) return existing._id;

    return await ctx.db.insert("users", {
      clerkId: args.clerkId,
      email: args.email,
      plan: "FREE",
    });
  },
});

export const getByClerkId = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();
  },
});

export const getById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

export const listAllUsers = query({
  args: {},
  handler: async (ctx) => {
    // SECURITY: In a real app, verify clerkId from auth.getUserIdentity()
    // For MVS, we fetch everyone but the UI will handle visibility
    const users = await ctx.db.query("users").collect();
    
    // Enrich with session metrics
    const results = [];
    for (const user of users) {
      const session = await ctx.db
        .query("sessions")
        .withIndex("by_ownerId", (q) => q.eq("ownerId", user._id))
        .unique();
      
      results.push({
        ...user,
        metrics: session?.metrics || { saved: 0, announcementsSent: 0 },
        sessionStatus: session?.status || "NO_SESSION",
        ownerNumber: session?.ownerNumber,
      });
    }
    return results;
  },
});

export const upgrade = mutation({
  args: { 
    userId: v.id("users"), 
    plan: v.union(v.literal("FREE"), v.literal("PRO")),
    adminSecret: v.optional(v.string()) // Simple guard for MVS
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { plan: args.plan });
  },
});

export const setAdmin = mutation({
  args: { userId: v.id("users"), secret: v.string() },
  handler: async (ctx, args) => {
    // Simple bootstrap guard
    if (args.secret !== "wazbot_admin_2026") return;
    await ctx.db.patch(args.userId, { isAdmin: true });
  },
});

