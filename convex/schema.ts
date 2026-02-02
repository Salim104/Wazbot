import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
  }).index("by_clerkId", ["clerkId"]),

  sessions: defineTable({
    ownerId: v.id("users"),
    ownerWid: v.optional(v.string()),
    ownerNumber: v.optional(v.string()),
    status: v.union(
      v.literal("INITIALIZING"),
      v.literal("WAIT_QR"),
      v.literal("CONNECTED"),
      v.literal("DISCONNECTED")
    ),
    storageId: v.optional(v.string()), // ID of the session bundle in Convex storage
    qrCode: v.optional(v.string()),
    menuState: v.string(), // e.g., "IDLE", "MAIN_MENU"
    draftMessage: v.optional(v.string()), // Temporary storage for current announcement draft
    lastActivity: v.number(), // timestamp for timeout logic
    autoSaveEnabled: v.boolean(),
    phoneSyncEnabled: v.optional(v.boolean()),

    metrics: v.object({
      saved: v.number(),
      unsaved: v.number(),
      announcementsSent: v.number(),
      convexSyncFailed: v.number(),
      phoneSyncFailed: v.number(),
      pendingRetries: v.number(),
    }),
  }).index("by_ownerId", ["ownerId"]),

  contacts: defineTable({
    sessionId: v.id("sessions"),
    waId: v.string(), // full serialized WID
    phoneNumber: v.optional(v.string()), // resolved real phone number

    isSaved: v.boolean(),
    isOptedOut: v.boolean(),
    convexSyncStatus: v.optional(v.union(v.literal("success"), v.literal("failed"), v.literal("pending"))),
    phoneSyncStatus: v.optional(v.union(v.literal("success"), v.literal("failed"), v.literal("pending"))),
    lastSyncAttempt: v.optional(v.number()),
    syncErrorMessage: v.optional(v.string()),
    retryCount: v.optional(v.number()),
    metadata: v.object({
      name: v.optional(v.string()),
      lastInteraction: v.number(),
    }),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_waId", ["waId"])
    .index("by_session_and_waId", ["sessionId", "waId"]),

  operations: defineTable({
    sessionId: v.id("sessions"),
    type: v.union(v.literal("BULK_SAVE"), v.literal("ANNOUNCEMENT")),
    status: v.union(
      v.literal("PENDING"),
      v.literal("PROCESSING"),
      v.literal("COMPLETED"),
      v.literal("FAILED"),
      v.literal("PAUSED"),
      v.literal("CANCELLED"),
    ),
    progress: v.number(),
    total: v.number(),
    errorMessage: v.optional(v.string()),
  }).index("by_sessionId", ["sessionId"]),

  messages: defineTable({
    sessionId: v.id("sessions"),
    waId: v.string(),
    body: v.string(),
    fromMe: v.boolean(),
    timestamp: v.number(),
  }).index("by_sessionId", ["sessionId"]),

  retryQueue: defineTable({
    contactId: v.id("contacts"),
    sessionId: v.id("sessions"),
    waId: v.string(),
    retryType: v.union(v.literal("convex"), v.literal("phone")),
    attempts: v.number(),
    lastAttempt: v.number(),
    errorMessage: v.string(),
    metadata: v.any(),
  }).index("by_sessionId", ["sessionId"]),
});

