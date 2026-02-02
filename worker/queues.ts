import { Queue, Worker, Job } from "bullmq";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { Client } from "whatsapp-web.js";
import * as dotenv from "dotenv";
import { Id } from "../convex/_generated/dataModel";

dotenv.config();

const connection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379"),
};

const CONVEX_URL = process.env.CONVEX_URL!;
const convexClient = new ConvexHttpClient(CONVEX_URL);

export const bulkSaveQueue = new Queue("bulk-save", { connection });
export const announcementQueue = new Queue("announcements", { connection });

export function setupQueues(whatsappClients: Map<Id<"sessions">, Client>) {
  // 1. Bulk Save Worker
  const bulkWorker = new Worker(
    "bulk-save",
    async (job: Job) => {
      const { sessionId, waIds } = job.data;
      const client = whatsappClients.get(sessionId);
      if (!client) throw new Error(`Client not found for session ${sessionId}`);

      const sessionRecord = await convexClient.query(api.sessions.getById, { sessionId });

      let successCount = 0;
      let failCount = 0;
      const failedContacts: any[] = [];
      let currentDelay = 5000;

      for (const waId of waIds) {
        try {
          // Idempotency: Skip if already saved correctly
          const existing = await convexClient.query(api.contacts.getContact, {
            sessionId,
            waId,
          });

          if (existing && existing.convexSyncStatus === "success") {
            successCount++;
            continue;
          }

          const contact = await client.getContactById(waId);
          const metadata = {
            name: contact.name || contact.pushname || "Unknown",
            lastInteraction: Date.now(),
          };

          // Save to Convex
          let contactId: Id<"contacts">;
          try {
            contactId = await (convexClient as any).mutation(api.contacts.saveContact, {
              sessionId,
              waId,
              metadata,
              convexSyncStatus: "success",
            });
          } catch (err) {
            failCount++;
            failedContacts.push({ waId, reason: "Convex Save Failed" });
            continue;
          }

          // Resolve LID
          let digitsOnly = contact.number.replace(/\D/g, "");
          const isLidContact = waId.includes("@lid");

          if (isLidContact) {
            try {
              const lidInfo = await (client as any).getContactLidAndPhone(waId);
              if (lidInfo && lidInfo.phoneNumber) {
                digitsOnly = lidInfo.phoneNumber.replace(/\D/g, "");
                await (convexClient as any).mutation(api.contacts.saveContact, {
                  sessionId,
                  waId,
                  phoneNumber: digitsOnly,
                  metadata,
                });
              }
            } catch (e) {
              console.warn(`LID Resolution failed for ${waId}`);
            }
          }

          // Phone Sync
          if (sessionRecord?.phoneSyncEnabled) {
            try {
              const nameParts = metadata.name.split(" ");
              const firstName = nameParts[0] || "WazBot";
              const lastName = nameParts.slice(1).join(" ") || "Contact";
              const shouldSync = !isLidContact || (isLidContact && digitsOnly && !digitsOnly.includes("lid"));

              if (shouldSync) {
                await (client as any).saveOrEditAddressbookContact(digitsOnly, firstName, lastName, true);
                await (convexClient as any).mutation(api.contacts.updateSyncStatus, {
                  contactId,
                  phoneSyncStatus: "success",
                });
              }
            } catch (err: any) {
              await (convexClient as any).mutation(api.retryQueue.addToRetryQueue, {
                contactId,
                sessionId,
                waId,
                retryType: "phone",
                errorMessage: err.message,
                metadata: { name: metadata.name },
              });
              if (err.message.includes("rate limit") || err.message.includes("429")) {
                currentDelay = Math.min(currentDelay * 2, 60000);
              }
            }
          }

          successCount++;
          currentDelay = Math.max(5000, currentDelay - 500);
        } catch (err: any) {
          failCount++;
          failedContacts.push({ waId, reason: err.message });
        }

        await (convexClient as any).mutation(api.operations.updateProgress, {
          sessionId,
          type: "BULK_SAVE",
          progress: successCount + failCount,
          total: waIds.length,
        });

        await new Promise(r => setTimeout(r, currentDelay));
      }

      // Report
      const report = `*✅ Bulk Save Complete!*\n\n📊 *Results:*\n• ${successCount}/${waIds.length} successful\n• ${failCount} failed\n${failedContacts.length > 0 ? `\n*❌ Errors:*\n${failedContacts.slice(0, 5).map(c => `- ${c.waId}: ${c.reason}`).join("\n")}` : ""}`;
      await client.sendMessage(sessionRecord!.ownerId + "@c.us", report);
    },
    { connection, concurrency: 1 }
  );

  // 2. Announcement Worker
  const announcementWorker = new Worker(
    "announcements",
    async (job: Job) => {
      const { sessionId, waIds, message } = job.data;
      const client = whatsappClients.get(sessionId);
      if (!client) throw new Error(`Client not found for session ${sessionId}`);

      const sessionRecord = await convexClient.query(api.sessions.getById, { sessionId });
      
      let sentCount = 0;
      let failCount = 0;
      const startTime = Date.now();

      for (const waId of waIds) {
        // Check for pause/cancel
        const op = await convexClient.query(api.operations.getBySession, { sessionId, type: "ANNOUNCEMENT" });
        if (op?.status === "PAUSED") {
          console.log("⏸️ Announcement paused");
          break; // Stop loop, BullMQ will keep job active or we handle restart logic
        }
        if (op?.status === "CANCELLED") {
          console.log("❌ Announcement cancelled");
          break;
        }

        try {
          console.log(`📣 Sending announcement to ${waId}: "${message}"`);
          await client.sendMessage(waId, message);
          sentCount++;
          
          await (convexClient as any).mutation(api.sessions.incrementAnnouncementsSent, { sessionId });
        } catch (err) {
          failCount++;
        }

        await (convexClient as any).mutation(api.operations.updateProgress, {
          sessionId,
          type: "ANNOUNCEMENT",
          progress: sentCount + failCount,
          total: waIds.length,
        });

        await new Promise(r => setTimeout(r, 10000)); // Fixed 10s delay
      }

      const report = `*✅ Announcement Complete!*\n\n• Sent: ${sentCount}\n• Failed: ${failCount}\n• Duration: ${Math.round((Date.now() - startTime) / 60000)}m`;
      await client.sendMessage(sessionRecord!.ownerId + "@c.us", report);
    },
    { connection, concurrency: 1 }
  );

  bulkWorker.on("completed", (job) => {
    convexClient.mutation(api.operations.complete, { sessionId: job.data.sessionId, type: "BULK_SAVE" });
  });

  announcementWorker.on("completed", (job) => {
    convexClient.mutation(api.operations.complete, { sessionId: job.data.sessionId, type: "ANNOUNCEMENT" });
  });

  return { bulkWorker, announcementWorker };
}
