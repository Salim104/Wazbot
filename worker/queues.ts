import { Queue, Worker, Job } from 'bullmq';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api';
import { Client } from 'whatsapp-web.js';
import * as dotenv from 'dotenv';
import { Id } from '../convex/_generated/dataModel';
import { googleAuthService } from './googleAuth';

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

        // Fetch session for Google tokens
        const sessionRecord = await convexClient.query(api.sessions.getById as any, { sessionId });

        let count = 0;
        for (const waId of waIds) {
            try {
                const contact = await client.getContactById(waId);
                const metadata = { name: contact.name || contact.pushname, lastInteraction: Date.now() };
                
                // 1. Save to Convex
                const contactId = await (convexClient as any).mutation(api.contacts.saveContact, {
                    sessionId,
                    waId,
                    metadata
                });

                // (Google Sync moved below LID resolution)

                        // 3. Sync to Phone directly if enabled (Milestone 7)
                        if (sessionRecord?.phoneSyncEnabled) {
                            try {
                                const contactName = metadata.name || 'WazBot Contact';
                                const nameParts = contactName.split(' ');
                                const firstName = nameParts[0] || 'WazBot';
                                const lastName = nameParts.slice(1).join(' ') || 'Contact';
                                
                                // Resolve real number (Standard or LID)
                                let realNumber: string | undefined = contact.number;

                                // 🧠 REFINED LID RESOLUTION (from BenyFilho docs)
                                if (waId.endsWith('@lid')) {
                                    console.log(`🔍 Bulk: Attempting LID resolution for ${waId}...`);
                                    try {
                                        const resolved = await (client as any).getContactLidAndPhone([waId]);
                                        const entry = resolved && resolved[0];
                                        if (entry && (entry.phone || entry.pn)) {
                                            realNumber = entry.phone || entry.pn;
                                            console.log(`✅ Bulk: LID resolved officially: ${realNumber}`);
                                        }
                                    } catch (lidErr: any) {
                                        console.warn(`⚠️ Bulk: Official LID resolution failed: ${lidErr.message}`);
                                    }
                                }

                                // Fallback to heuristic
                                if (!realNumber || realNumber.includes('lid')) {
                                    realNumber = (contact as any).id?.user || realNumber;
                                    if (realNumber && realNumber.includes('lid')) realNumber = undefined;
                                }

                                if (realNumber) {
                                    // 🧠 THE LID FIX: Normalize to standard digits-only format
                                    const digitsOnly = realNumber.replace(/\D/g, '');

                                    if (digitsOnly) {
                                        // 1b. Re-save to Convex with phoneNumber if resolved
                                        await (convexClient as any).mutation(api.contacts.saveContact, {
                                            sessionId,
                                            waId,
                                            phoneNumber: digitsOnly, // <--- Store resolved number
                                            metadata
                                        });

                                        // 2. Sync to Google if enabled (Milestone 6)
                                        if (sessionRecord?.googleAccessToken) {
                                            try {
                                                const tokens = {
                                                    access_token: sessionRecord.googleAccessToken,
                                                    refresh_token: sessionRecord.googleRefreshToken,
                                                    expiry_date: sessionRecord.googleTokenExpiry
                                                };
                                                
                                                console.log(`🔄 Bulk-Syncing ${waId} [Resolved: ${digitsOnly}] to Google...`);
                                                const googleRes = await googleAuthService.syncContact(tokens, {
                                                    name: metadata.name,
                                                    phone: `+${digitsOnly}`
                                                });

                                                if (googleRes?.resourceName) {
                                                    await (convexClient as any).mutation(api.contacts.updateGoogleContactId, {
                                                        contactId,
                                                        googleContactId: googleRes.resourceName
                                                    });
                                                }
                                            } catch (gErr: any) {
                                                console.warn(`⚠️ Google Bulk Sync warning for ${waId}: ${gErr.message}`);
                                            }
                                        }

                                        console.log(`📱 Bulk-Syncing ${waId} [Resolved: ${digitsOnly}] directly to phone...`);
                                        
                                        // 🧠 HYBRID FIX: Use direct pupPage.evaluate to bypass library bugs
                                        // Setting syncToAddressbook=false saves to WA's internal contact list
                                        // instead of triggering the LID sync mutation that crashes
                                        try {
                                            await (client as any).pupPage.evaluate(
                                                async (phone: string, first: string, last: string, originalFrom: string) => {
                                                    // eslint-disable-next-line no-undef
                                                    const win = (globalThis as any).window ?? globalThis;
                                                    
                                                    // 🚨 CRITICAL FIX: To prevent the toString crash in getLidContactSyncMutation,
                                                    // we MUST NEVER set syncToPhone=true for any contact that is an LID account.
                                                    const isLidAccount = originalFrom.endsWith('@lid');
                                                    const isResolved = phone && /^\d+$/.test(phone) && phone.length < 20;
                                                    
                                                    const jid = isResolved ? `${phone}@c.us` : originalFrom;
                                                    const syncToPhone = isResolved && !isLidAccount;

                                                    const fullName = (first + (last ? ' ' + last : '')).trim() || 'WhatsApp User';

                                                    if (!win.Store?.AddressbookContactUtils?.saveContactAction) {
                                                        throw new Error('Store.AddressbookContactUtils.saveContactAction not found');
                                                    }

                                                    // 🧠 Robust JID Object: Prefer existing ID from Store
                                                    let widObj: any = null;
                                                    try {
                                                        const existing = win.Store.Contact?.get(originalFrom);
                                                        if (existing?.id) {
                                                            widObj = existing.id;
                                                        } else if (win.Store.WidFactory) {
                                                            const factory = win.Store.WidFactory;
                                                            const createFn = factory.create || factory.createWid;
                                                            widObj = createFn.call(factory, jid);
                                                        }
                                                    } catch (e) {
                                                        console.warn(`[Browser] Bulk: ID resolution failed for ${jid}`, e);
                                                    }

                                                    if (!widObj) widObj = jid;

                                                    return await win.Store.AddressbookContactUtils.saveContactAction(
                                                        widObj,
                                                        fullName,
                                                        null,  // type
                                                        null,  // subtype
                                                        first,
                                                        last,
                                                        syncToPhone
                                                    );
                                                },
                                                digitsOnly,
                                                firstName,
                                                lastName,
                                                waId
                                            );
                                            console.log(`✅ Contact saved to WhatsApp for ${digitsOnly}`);
                                        } catch (evalErr: any) {
                                            console.warn(`⚠️ Bulk Direct Sync internal block: ${evalErr.message}`);
                                        }
                                    } else {
                                        console.warn(`⚠️ Bulk sync: Formatted number was empty for ${waId}`);
                                    }
                                } else {
                                    console.warn(`⚠️ Bulk sync could not resolve a real number for ${waId}`);
                                }
                            } catch (nErr: any) {
                                console.warn(`⚠️ Native Bulk Sync warning for ${waId}: ${nErr.message}`);
                            }
                        }

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
