import { Queue, Worker, Job } from 'bullmq';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api';
import { Client } from 'whatsapp-web.js';
import * as dotenv from 'dotenv';
import { Id } from '../convex/_generated/dataModel';

dotenv.config();

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
const CONVEX_URL = process.env.CONVEX_URL || '';

const connection = { host: REDIS_HOST, port: REDIS_PORT };
const convexClient = new ConvexHttpClient(CONVEX_URL);

// Queues
export const bulkSaveQueue = new Queue('bulk-save', { connection });
export const announcementQueue = new Queue('announcements', { connection });

export function setupQueues(whatsappClients: Map<Id<"sessions">, Client>) {
    
    // 1. Bulk Save Worker
    const bulkWorker = new Worker('bulk-save', async (job: Job) => {
        const { sessionId, waIds } = job.data;
        const client = whatsappClients.get(sessionId);
        if (!client) throw new Error(`Client not found for session ${sessionId}`);

        let count = 0;
        for (const waId of waIds) {
            try {
                const contact = await client.getContactById(waId);
                // In V1, we simulate "saving" for now or trigger the actual save if possible
                // WWebJS save() might depend on context, so we'll log it as "tracked" in Convex.
                
                await convexClient.mutation(api.contacts.saveContact, {
                    sessionId,
                    waId,
                    metadata: { name: contact.name || contact.pushname, lastInteraction: Date.now() }
                });

                count++;
                // Progress update
                await convexClient.mutation(api.operations.updateProgress, {
                    sessionId,
                    type: 'BULK_SAVE',
                    progress: count,
                    total: waIds.length
                });

                // Throttling to prevent bans
                await new Promise(resolve => setTimeout(resolve, 5000 + Math.random() * 5000));
            } catch (err) {
                console.error(`Failed to save contact ${waId}:`, err);
            }
        }
    }, { connection, concurrency: 1 });

    bulkWorker.on('completed', async (job) => {
        console.log(`Bulk save completed for session ${job.data.sessionId}`);
        await convexClient.mutation(api.operations.complete, {
            sessionId: job.data.sessionId,
            type: 'BULK_SAVE'
        });
    });

    // 2. Announcement Worker
    const announcemetWorker = new Worker('announcements', async (job: Job) => {
        const { sessionId, waIds, message } = job.data;
        const client = whatsappClients.get(sessionId);
        if (!client) throw new Error(`Client not found for session ${sessionId}`);

        let count = 0;
        for (const waId of waIds) {
            try {
                // Check if opted out in Convex before sending
                const contact = await convexClient.query(api.contacts.getContact as any, { sessionId, waId });
                if (contact?.isOptedOut) {
                    console.log(`Skipping opted-out contact ${waId}`);
                    continue;
                }

                await client.sendMessage(waId, `${message}\n\n_Reply STOP to opt-out_`);
                
                count++;
                // Progress update
                await convexClient.mutation(api.operations.updateProgress, {
                    sessionId,
                    type: 'ANNOUNCEMENT',
                    progress: count,
                    total: waIds.length
                });

                // Throttling: 20-40 seconds
                const delay = 20000 + Math.random() * 20000;
                await new Promise(resolve => setTimeout(resolve, delay));
            } catch (err) {
                console.error(`Failed to send announcement to ${waId}:`, err);
            }
        }
    }, { connection, concurrency: 1 });

    announcemetWorker.on('completed', async (job) => {
        console.log(`Announcement completed for session ${job.data.sessionId}`);
        await convexClient.mutation(api.operations.complete, {
            sessionId: job.data.sessionId,
            type: 'ANNOUNCEMENT'
        });
    });

    return { bulkWorker, announcemetWorker };
}
