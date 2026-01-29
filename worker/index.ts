import { Client, RemoteAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api';
import { ConvexStore } from './convexStore';
import * as dotenv from 'dotenv';
import { Id } from '../convex/_generated/dataModel';
import { MENU_STATES, MENUS, getStatusProgress } from './menus';
import { setupQueues, bulkSaveQueue, announcementQueue } from './queues';

dotenv.config();

// ... (worker set up)

const CONVEX_URL = process.env.CONVEX_URL || '';
const OWNER_ID = process.env.OWNER_ID as Id<"users">; // For testing V1

if (!CONVEX_URL || !OWNER_ID) {
    console.error('Missing CONVEX_URL or OWNER_ID');
    process.exit(1);
}

const convexClient = new ConvexHttpClient(CONVEX_URL);
const store = new ConvexStore(CONVEX_URL, OWNER_ID);

// --- WINDOWS STABILITY SHIELD ---
process.on('uncaughtException', (err) => {
    if (err.message.includes('ENOENT') && err.message.includes('scandir')) {
        // Silent ignore for Windows RemoteAuth cleanup race condition
        return;
    }
    console.error('CRITICAL ERROR:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
    if (reason?.message?.includes('ENOENT') && reason?.message?.includes('scandir')) {
        // Silent ignore
        return;
    }
    console.error('UNHANDLED REJECTION:', reason);
});
// --------------------------------

async function initializeWorker() {
    console.log(`Starting worker for OWNER_ID: ${OWNER_ID}`);
    
    // 1. Get or create session in Convex
    let session = await convexClient.query(api.sessions.getByOwner, { ownerId: OWNER_ID });
    
    // Auto-create session if missing but ID is provided
    if (!session && OWNER_ID) {
        console.log('Session not found, attempting to create one...');
        try {
            await (convexClient as any).mutation(api.sessions.create, { ownerId: OWNER_ID });
            session = await convexClient.query(api.sessions.getByOwner, { ownerId: OWNER_ID });
        } catch (e) {
            console.error('Failed to auto-create session. Check if OWNER_ID is a valid User ID in Convex.');
        }
    }

    if (!session) {
        console.log('❌ Session still not found. Please verify your OWNER_ID in .env or provide it directly.');
        process.exit(1);
    }

    const client = new Client({
        authStrategy: new RemoteAuth({
            clientId: OWNER_ID,
            store: store,
            backupSyncIntervalMs: 600000 // 10 minutes
        }),
        puppeteer: {
            headless: process.env.HEADLESS !== 'false',
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        }
    });

    client.on('qr', (qr) => {
        console.log('--- EVENT: QR RECEIVED ---');
        qrcode.generate(qr, { small: true });
        
        // Non-blocking mutation
        convexClient.mutation(api.sessions.saveQR, {
            sessionId: session!._id,
            qrCode: qr
        }).catch(e => console.error('Failed to save QR to Convex:', e));
    });

    client.on('authenticated', () => {
        console.log('--- EVENT: AUTHENTICATED ---');
        console.log('Session is valid. Syncing with WhatsApp servers...');
    });

    client.on('auth_failure', msg => {
        console.error('--- EVENT: AUTHENTICATION FAILURE ---', msg);
    });

    let isReady = false;
    
    client.on('ready', async () => {
        if (isReady) return; 
        isReady = true;

        console.log('✅ WazBot is READY and ACTIVE.');
        try {
            const info = client.info;
            if (!info || !info.wid) {
                console.error('❌ Ready event fired but client info is missing!');
                return;
            }

            const ownerWid = info.wid._serialized;
            const ownerNumber = info.wid.user;

            await convexClient.mutation(api.sessions.saveOwnerDetails, {
                sessionId: session!._id,
                ownerWid,
                ownerNumber
            });

            console.log(`Connected account: ${ownerWid}`);
            console.log('Identity synced to cloud.');

        } catch (err) {
            console.error('Error during identity sync:', err);
        }
    });

    client.on('loading_screen', (percent: any, message) => {
        if ((percent as number) % 25 === 0) {
            console.log(`Loading: ${percent}% - ${message}`);
        }
    });

    // Unified message handler
    const handleMessage = async (msg: any) => {
        const body = msg.body || '';
        const sessionRecord = await convexClient.query(api.sessions.getByOwner, { ownerId: OWNER_ID });
        if (!sessionRecord || !sessionRecord.ownerWid) {
            console.log('--- MSG IGNORED: No owner details yet in Convex ---');
            return;
        }

        const from = msg.from;
        const to = msg.to;
        const fromMe = msg.fromMe;
        const ownerWid = sessionRecord.ownerWid;

        const isOwner = from === ownerWid || (fromMe && to === ownerWid) || (fromMe && from === ownerWid);
        
        if (isOwner) {
            console.log(`📩 Owner command: "${body.substring(0, 15)}"`);
        }
        
        if (!isOwner) {
            // Milestone 3 logic: Auto-save context
            if (sessionRecord.autoSaveEnabled) {
                const contact = await msg.getContact();
                if (!contact.isMyContact) {
                    console.log(`Auto-saving contact: ${msg.from}`);
                    await (convexClient as any).mutation(api.contacts.saveContact, {
                        sessionId: sessionRecord._id,
                        waId: msg.from,
                        metadata: { name: contact.pushname || contact.name, lastInteraction: Date.now() }
                    });
                }
            }

            // Milestone 4: STOP handling
            if (body.trim().toUpperCase() === 'STOP') {
                console.log(`Contact ${msg.from} opted out.`);
                await (convexClient as any).mutation(api.contacts.toggleOptOut, {
                    sessionId: sessionRecord._id,
                    waId: msg.from,
                    optedOut: true
                });
                msg.reply('You have been opted out of future announcements. ✅');
            }
            return;
        }

        // --- OWNER ONLY LOGIC ---
        const currentState = sessionRecord.menuState;
        const input = body.trim();

        console.log(`Owner Input: "${input}" | State: ${currentState}`);

        // 1. Entry Point
        if (input === '$start') {
            console.log('Sending Main Menu to owner...');
            await (convexClient as any).mutation(api.sessions.updateMenuState, {
                sessionId: sessionRecord._id,
                menuState: MENU_STATES.MAIN_MENU
            });
            return client.sendMessage(msg.from, MENUS.MAIN_MENU);
        }

        // 2. State-based numeric routing
        const choice = parseInt(input);

        switch (currentState) {
            case MENU_STATES.MAIN_MENU:
                if (choice === 1) {
                    // Status
                    await convexClient.mutation(api.sessions.updateMenuState, {
                        sessionId: sessionRecord._id,
                        menuState: MENU_STATES.STATUS_METRICS
                    });
                    return client.sendMessage(msg.from, getStatusProgress(sessionRecord.metrics));
                } else if (choice === 2) {
                    // Auto-save settings
                    await convexClient.mutation(api.sessions.updateMenuState, {
                        sessionId: sessionRecord._id,
                        menuState: MENU_STATES.AUTO_SAVE_SETTINGS
                    });
                    const text = MENUS.AUTO_SAVE_SETTINGS.replace('{{status}}', sessionRecord.autoSaveEnabled ? '✅ Enabled' : '❌ Disabled');
                    return client.sendMessage(msg.from, text);
                } else if (choice === 3) {
                    // Redirect to Bulk Save Confirm
                    await convexClient.mutation(api.sessions.updateMenuState, {
                        sessionId: sessionRecord._id,
                        menuState: MENU_STATES.BULK_SAVE_CONFIRM
                    });
                    return client.sendMessage(msg.from, MENUS.BULK_SAVE_CONFIRM);
                } else if (choice === 4) {
                    // Send Announcement - Step 1: Draft
                    await (convexClient as any).mutation(api.sessions.updateMenuState, {
                        sessionId: sessionRecord._id,
                        menuState: MENU_STATES.ANNOUNCEMENT_DRAFT
                    });
                    return client.sendMessage(msg.from, MENUS.ANNOUNCEMENT_DRAFT);
                } else if (choice === 5) {
                    // Redirect to Logout Confirm
                    await convexClient.mutation(api.sessions.updateMenuState, {
                        sessionId: sessionRecord._id,
                        menuState: MENU_STATES.LOGOUT_CONFIRM
                    });
                    return client.sendMessage(msg.from, MENUS.LOGOUT_CONFIRM);
                } else {
                    client.sendMessage(msg.from, 'Invalid option. Reply with a number from the menu.');
                }
                break;

            case MENU_STATES.LOGOUT_CONFIRM:
                if (choice === 1) {
                    await client.sendMessage(msg.from, 'Logging out... 🚪');
                    await client.logout();
                } else {
                    // Cancel -> Back to main menu
                    await convexClient.mutation(api.sessions.updateMenuState, {
                        sessionId: sessionRecord._id,
                        menuState: MENU_STATES.MAIN_MENU
                    });
                    return client.sendMessage(msg.from, MENUS.MAIN_MENU);
                }
                break;

            case MENU_STATES.BULK_SAVE_CONFIRM:
                if (choice === 1) {
                    // Proceed with Bulk Save
                    const chats = await client.getChats();
                    const unsavedWids = chats
                        .filter(chat => !chat.isGroup && !chat.name)
                        .map(chat => chat.id._serialized);

                    if (unsavedWids.length === 0) {
                        client.sendMessage(msg.from, 'No unsaved contacts found! All good. ✅');
                        await convexClient.mutation(api.sessions.updateMenuState, {
                            sessionId: sessionRecord._id,
                            menuState: MENU_STATES.MAIN_MENU
                        });
                        return client.sendMessage(msg.from, MENUS.MAIN_MENU);
                    }

                    await (convexClient as any).mutation(api.operations.start, {
                        sessionId: sessionRecord._id,
                        type: 'BULK_SAVE',
                        total: unsavedWids.length
                    });

                    await bulkSaveQueue.add('bulk-save', {
                        sessionId: sessionRecord._id,
                        waIds: unsavedWids
                    });

                    await convexClient.mutation(api.sessions.updateMenuState, {
                        sessionId: sessionRecord._id,
                        menuState: MENU_STATES.BULK_SAVE_PROGRESS
                    });

                    return client.sendMessage(msg.from, `Starting bulk save for ${unsavedWids.length} contacts... 📥\nI will update you as I process them.`);
                } else {
                    // Cancel -> Back
                    await convexClient.mutation(api.sessions.updateMenuState, {
                        sessionId: sessionRecord._id,
                        menuState: MENU_STATES.MAIN_MENU
                    });
                    return client.sendMessage(msg.from, MENUS.MAIN_MENU);
                }
                break;

            case MENU_STATES.ANNOUNCEMENT_DRAFT:
                if (input === '0') {
                    // Cancel
                    await (convexClient as any).mutation(api.sessions.updateMenuState, {
                        sessionId: sessionRecord._id,
                        menuState: MENU_STATES.MAIN_MENU
                    });
                    return client.sendMessage(msg.from, MENUS.MAIN_MENU);
                }
                // Save draft
                await (convexClient as any).mutation(api.sessions.updateDraftMessage, {
                    sessionId: sessionRecord._id,
                    draftMessage: input
                });
                await (convexClient as any).mutation(api.sessions.updateMenuState, {
                    sessionId: sessionRecord._id,
                    menuState: MENU_STATES.ANNOUNCEMENT_CONFIRM
                });
                return client.sendMessage(msg.from, MENUS.ANNOUNCEMENT_CONFIRM.replace('{{message}}', input));

            case MENU_STATES.ANNOUNCEMENT_CONFIRM:
                if (choice === 1) {
                    // 🚀 Send Now
                    const savedContacts = await convexClient.query(api.contacts.getContacts as any, { sessionId: sessionRecord._id });
                    const activeWids = savedContacts
                        .filter((c: any) => c.isSaved && !c.isOptedOut)
                        .map((c: any) => c.waId);

                    if (activeWids.length === 0) {
                        client.sendMessage(msg.from, 'No active saved contacts found to send to. ❌');
                        await convexClient.mutation(api.sessions.updateMenuState, {
                            sessionId: sessionRecord._id,
                            menuState: MENU_STATES.MAIN_MENU
                        });
                        return client.sendMessage(msg.from, MENUS.MAIN_MENU);
                    }

                    await (convexClient as any).mutation(api.operations.start, {
                        sessionId: sessionRecord._id,
                        type: 'ANNOUNCEMENT',
                        total: activeWids.length
                    });

                    await (announcementQueue as any).add('announcements', {
                        sessionId: sessionRecord._id,
                        waIds: activeWids,
                        message: sessionRecord.draftMessage
                    });

                    await (convexClient as any).mutation(api.sessions.updateMenuState, {
                        sessionId: sessionRecord._id,
                        menuState: MENU_STATES.MAIN_MENU
                    });

                    return client.sendMessage(msg.from, `Sending announcement to ${activeWids.length} contacts... 📣\nI will notify you when finished.`);
                } else if (choice === 2) {
                    // Edit
                    await (convexClient as any).mutation(api.sessions.updateMenuState, {
                        sessionId: sessionRecord._id,
                        menuState: MENU_STATES.ANNOUNCEMENT_DRAFT
                    });
                    return client.sendMessage(msg.from, MENUS.ANNOUNCEMENT_DRAFT);
                } else {
                    // Cancel or Invalid
                    await (convexClient as any).mutation(api.sessions.updateMenuState, {
                        sessionId: sessionRecord._id,
                        menuState: MENU_STATES.MAIN_MENU
                    });
                    return client.sendMessage(msg.from, MENUS.MAIN_MENU);
                }

            case MENU_STATES.STATUS_METRICS:
                if (choice === 0) {
                    // Back
                    await convexClient.mutation(api.sessions.updateMenuState, {
                        sessionId: sessionRecord._id,
                        menuState: MENU_STATES.MAIN_MENU
                    });
                    return client.sendMessage(msg.from, MENUS.MAIN_MENU);
                } else {
                    client.sendMessage(msg.from, 'Invalid option. Reply "0" to go back.');
                }
                break;

            case MENU_STATES.AUTO_SAVE_SETTINGS:
                if (choice === 1 || choice === 2) {
                    // Enable or Disable -> REDIRECT to confirm
                    const action = choice === 1 ? 'Enable' : 'Disable';
                    const result = choice === 1 ? 'automatically added to your database' : 'ignored unless you manually save them';
                    
                    // Store the intended action in the generic draftMessage field for temporarily storage
                    await (convexClient as any).mutation(api.sessions.updateDraftMessage, {
                        sessionId: sessionRecord._id,
                        draftMessage: action // Store 'Enable' or 'Disable'
                    });

                    await convexClient.mutation(api.sessions.updateMenuState, {
                        sessionId: sessionRecord._id,
                        menuState: MENU_STATES.AUTO_SAVE_CONFIRM
                    });

                    return client.sendMessage(msg.from, MENUS.AUTO_SAVE_CONFIRM
                        .replace('{{action}}', action)
                        .replace('{{result}}', result)
                    );
                } else if (choice === 3) {
                    // Back
                    await (convexClient as any).mutation(api.sessions.updateMenuState, {
                        sessionId: sessionRecord._id,
                        menuState: MENU_STATES.MAIN_MENU
                    });
                    return client.sendMessage(msg.from, MENUS.MAIN_MENU);
                }
                break;

            case MENU_STATES.AUTO_SAVE_CONFIRM:
                if (choice === 1) {
                    const action = sessionRecord.draftMessage; // Retrieve the action we stored
                    const enabled = action === 'Enable';
                    
                    await convexClient.mutation(api.sessions.toggleAutoSave, { 
                        sessionId: sessionRecord._id, 
                        enabled 
                    });
                    
                    await client.sendMessage(msg.from, `Auto-save ${enabled ? 'enabled' : 'disabled'}! ✅`);
                    
                    // Back to main menu
                    await (convexClient as any).mutation(api.sessions.updateMenuState, {
                        sessionId: sessionRecord._id,
                        menuState: MENU_STATES.MAIN_MENU
                    });
                    return client.sendMessage(msg.from, MENUS.MAIN_MENU);
                } else {
                    // Back to settings menu
                    await (convexClient as any).mutation(api.sessions.updateMenuState, {
                        sessionId: sessionRecord._id,
                        menuState: MENU_STATES.AUTO_SAVE_SETTINGS
                    });
                    const text = MENUS.AUTO_SAVE_SETTINGS.replace('{{status}}', sessionRecord.autoSaveEnabled ? '✅ Enabled' : '❌ Disabled');
                    return client.sendMessage(msg.from, text);
                }
                break;

            default:
                if (currentState !== MENU_STATES.IDLE) {
                    await client.sendMessage(msg.from, 'Type $start to see the menu.');
                    await (convexClient as any).mutation(api.sessions.updateMenuState, {
                        sessionId: sessionRecord._id,
                        menuState: MENU_STATES.IDLE
                    });
                }
        }
    };

    client.on('message', handleMessage);
    client.on('message_create', handleMessage);

    client.on('disconnected', async (reason) => {
        console.log('Client was logged out', reason);
        await convexClient.mutation(api.sessions.updateStatus, {
            sessionId: session!._id,
            status: 'DISCONNECTED'
        });
    });

    console.log('Initializing WhatsApp client...');
    await convexClient.mutation(api.sessions.updateStatus, {
        sessionId: session!._id,
        status: 'INITIALIZING'
    });
    
    // Milestone 3: Setup Queues
    const clientsMap = new Map();
    clientsMap.set(session!._id, client);
    setupQueues(clientsMap);
    
    client.initialize();
}

initializeWorker().catch(err => {
    console.error('Worker failed to start:', err);
});
