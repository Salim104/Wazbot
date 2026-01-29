import 'dotenv/config';
import { Client, RemoteAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { ConvexHttpClient } from 'convex/browser';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { api } from '../convex/_generated/api';
import { ConvexStore } from './convexStore';
import { Id } from '../convex/_generated/dataModel';
import { MENU_STATES, MENUS, getStatusProgress } from './menus';
import { setupQueues, bulkSaveQueue, announcementQueue } from './queues';

// ... (worker set up)

const CONVEX_URL = process.env.CONVEX_URL || '';
const OWNER_ID = process.env.OWNER_ID as Id<"users">; // For testing V1

if (!CONVEX_URL || !OWNER_ID) {
    console.error('Missing CONVEX_URL or OWNER_ID');
    process.exit(1);
}

const convexClient = new ConvexHttpClient(CONVEX_URL);
const store = new ConvexStore(CONVEX_URL, OWNER_ID);

import { googleAuthService } from './googleAuth';

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
        },
        // Forced stable version to fix "markedUnread" and "ready" event hangs
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/refs/heads/main/html/2.3000.1032521188-alpha.html'
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
        console.log('Waiting for "ready" event...');
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
        try {
            if (!isReady && !msg.fromMe) {
                console.log(`📩 Received message from ${msg.from} but bot is not READY yet.`);
            }
            
            const body = msg.body || '';
            const sessionRecord = await convexClient.query(api.sessions.getByOwner, { ownerId: OWNER_ID });
            if (!sessionRecord || !sessionRecord.ownerWid) {
                console.log('--- MSG IGNORED: No owner details yet in Convex ---');
                return;
            }

            const send = async (to: string, content: string) => {
                console.log(`📤 Sending message to ${to}...`);
                try {
                    await client.sendMessage(to, content);
                    console.log(`✅ Message sent to ${to}`);
                } catch (e: any) {
                    console.error(`❌ Failed to send message to ${to}:`, e.message);
                }
            };

        const from = msg.from;
        const to = msg.to;
        const fromMe = msg.fromMe;
        const ownerWid = sessionRecord.ownerWid;

        const isOwner = from === ownerWid || (fromMe && to === ownerWid) || (fromMe && from === ownerWid);
        
        if (isOwner) {
            console.log(`📩 Owner command: "${body.substring(0, 15)}"`);
        }
        
        if (!isOwner && !fromMe && !msg.isStatus) {
            // Milestone 3 logic: Auto-save context
            if (sessionRecord.autoSaveEnabled) {
                const contact = await msg.getContact();
                if (!contact.isMyContact) {
                    const contactName = contact.pushname || contact.name || 'WhatsApp User';
                    const metadata = { name: contactName, lastInteraction: Date.now() };
                    
                    // 1. Save to Convex
                    console.log(`💾 Saving lead to Convex: ${msg.from} (${contactName})`);
                    const contactId = await (convexClient as any).mutation(api.contacts.saveContact, {
                        sessionId: sessionRecord._id,
                        waId: msg.from,
                        metadata
                    });

                    // 2. Sync to Google if connected
                    if (sessionRecord.googleAccessToken) {
                        try {
                            const tokens = {
                                access_token: sessionRecord.googleAccessToken,
                                refresh_token: sessionRecord.googleRefreshToken,
                                expiry_date: sessionRecord.googleTokenExpiry
                            };
                            
                            // Check if already synced
                            const dbContacts = await convexClient.query(api.contacts.getContacts, { sessionId: sessionRecord._id });
                            const dbContact = dbContacts.find((c: any) => c.waId === msg.from);

                            if (!dbContact?.googleContactId) {
                                console.log(`🔄 Syncing ${msg.from} to Google Contacts...`);
                                const googleRes = await googleAuthService.syncContact(tokens, {
                                    name: metadata.name,
                                    phone: `+${msg.from.split('@')[0]}`
                                });
                                
                                if (googleRes && googleRes.resourceName) {
                                    await (convexClient as any).mutation(api.contacts.updateGoogleContactId, {
                                        contactId: dbContact?._id || contactId,
                                        googleContactId: googleRes.resourceName
                                    });
                                    console.log(`✅ Synced to Google: ${googleRes.resourceName}`);
                                }
                            }
                        } catch (googleErr: any) {
                            console.warn(`⚠️ Google Sync non-critical error: ${googleErr.message}`);
                        }
                    }

                    // 3. Sync to Phone directly if enabled (Milestone 7)
                    if (sessionRecord.phoneSyncEnabled) {
                        try {
                            const nameParts = metadata.name.split(' ');
                            const firstName = nameParts[0] || 'WazBot';
                            const lastName = nameParts.slice(1).join(' ') || 'Contact';
                            
                            // 🧠 THE LID FIX (Community Solution):
                            // 1. Resolve real number from LID
                            let realNumber = contact.number;
                            if (msg.from.endsWith('@lid') && (!realNumber || realNumber.includes('lid'))) {
                                realNumber = (contact as any).id.user || realNumber;
                                if (realNumber && realNumber.includes('lid')) realNumber = undefined;
                            }

                            if (realNumber) {
                                // 2. Normalize to standard @c.us format if it hasn't been already
                                // Digits only or +digits is preferred by internal saveContactAction
                                const digitsOnly = realNumber.replace(/\D/g, '');

                                console.log(`📱 Syncing to Address Book: ${digitsOnly} (${metadata.name})`);
                                await (client as any).saveOrEditAddressbookContact(
                                    digitsOnly,
                                    firstName,
                                    lastName,
                                    true // syncToAddressbook
                                );
                                console.log(`✅ Native Phone Sync successful for ${digitsOnly}`);
                            } else {
                                console.warn(`ℹ️ Native Sync skipped for ${msg.from}: Real number could not be resolved.`);
                            }
                        } catch (nativeErr: any) {
                            console.warn(`⚠️ Native Sync internal WA block for ${msg.from}: ${nativeErr.message}`);
                            console.log('💡 TIP: Use Google Sync (Option 6) for 100% reliability with hidden numbers.');
                        }
                    }
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
            return send(msg.from, MENUS.MAIN_MENU);
        }

        if (input.startsWith('$auth ')) {
            const code = input.substring(6).trim();
            try {
                const tokens = await googleAuthService.getTokensFromCode(code);
                await (convexClient as any).mutation(api.sessions.saveGoogleTokens, {
                    sessionId: sessionRecord._id,
                    accessToken: tokens.access_token,
                    refreshToken: tokens.refresh_token,
                    expiryDate: tokens.expiry_date
                });
                await client.sendMessage(msg.from, '✅ Google Account connected successfully! WazBot will now sync contacts to your phone automatically.');
                
                // Return to main menu
                await (convexClient as any).mutation(api.sessions.updateMenuState, {
                    sessionId: sessionRecord._id,
                    menuState: MENU_STATES.MAIN_MENU
                });
                return send(msg.from, MENUS.MAIN_MENU);
            } catch (err: any) {
                return send(msg.from, `❌ Failed to connect Google Account: ${err.message}`);
            }
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
                    return send(msg.from, getStatusProgress(sessionRecord.metrics));
                } else if (choice === 2) {
                    // Auto-save settings
                    await convexClient.mutation(api.sessions.updateMenuState, {
                        sessionId: sessionRecord._id,
                        menuState: MENU_STATES.AUTO_SAVE_SETTINGS
                    });
                    const text = MENUS.AUTO_SAVE_SETTINGS.replace('{{status}}', sessionRecord.autoSaveEnabled ? '✅ Enabled' : '❌ Disabled');
                    return send(msg.from, text);
                } else if (choice === 3) {
                    // Redirect to Bulk Save Confirm
                    await convexClient.mutation(api.sessions.updateMenuState, {
                        sessionId: sessionRecord._id,
                        menuState: MENU_STATES.BULK_SAVE_CONFIRM
                    });
                    return send(msg.from, MENUS.BULK_SAVE_CONFIRM);
                } else if (choice === 4) {
                    // Send Announcement - Step 1: Draft
                    await (convexClient as any).mutation(api.sessions.updateMenuState, {
                        sessionId: sessionRecord._id,
                        menuState: MENU_STATES.ANNOUNCEMENT_DRAFT
                    });
                    return send(msg.from, MENUS.ANNOUNCEMENT_DRAFT);
                } else if (choice === 5) {
                    // Redirect to Logout Confirm
                    await convexClient.mutation(api.sessions.updateMenuState, {
                        sessionId: sessionRecord._id,
                        menuState: MENU_STATES.LOGOUT_CONFIRM
                    });
                    return send(msg.from, MENUS.LOGOUT_CONFIRM);
                } else if (choice === 6) {
                    // Redirect to Google Sync Confirm
                    await convexClient.mutation(api.sessions.updateMenuState, {
                        sessionId: sessionRecord._id,
                        menuState: MENU_STATES.GOOGLE_SYNC_CONFIRM
                    });
                    return send(msg.from, MENUS.GOOGLE_SYNC_CONFIRM);
                } else if (choice === 7) {
                    // Redirect to Phone Sync Settings
                    await convexClient.mutation(api.sessions.updateMenuState, {
                        sessionId: sessionRecord._id,
                        menuState: MENU_STATES.PHONE_SYNC_SETTINGS
                    });
                    const text = MENUS.PHONE_SYNC_SETTINGS.replace('{{status}}', sessionRecord.phoneSyncEnabled ? '✅ Enabled' : '❌ Disabled');
                    return send(msg.from, text);
                } else if (!isNaN(choice)) {
                    await send(msg.from, 'Invalid option. Reply with a number from the menu.');
                }
                break;

            case MENU_STATES.GOOGLE_SYNC_CONFIRM:
                if (choice === 1) {
                    const authUrl = googleAuthService.getAuthUrl();
                    await send(msg.from, `*Google Authorization Link*\n\n1. Open this link: ${authUrl}\n2. Sign in and authorize.\n3. You will be redirected to a page (e.g., localhost). Copy the 'code=' parameter from the URL.\n4. Send it here like this: *$auth YOUR_CODE*`);
                } else if (choice === 2) {
                    // Cancel -> Back
                    await (convexClient as any).mutation(api.sessions.updateMenuState, {
                        sessionId: sessionRecord._id,
                        menuState: MENU_STATES.MAIN_MENU
                    });
                    return send(msg.from, MENUS.MAIN_MENU);
                }
                break;

            case MENU_STATES.PHONE_SYNC_SETTINGS:
                if (choice === 1 || choice === 2) {
                    const action = choice === 1 ? 'Enable' : 'Disable';
                    const result = choice === 1 ? 'automatically UPDATED' : 'NOT updated';
                    
                    await (convexClient as any).mutation(api.sessions.updateDraftMessage, {
                        sessionId: sessionRecord._id,
                        draftMessage: action
                    });

                    await (convexClient as any).mutation(api.sessions.updateMenuState, {
                        sessionId: sessionRecord._id,
                        menuState: MENU_STATES.PHONE_SYNC_CONFIRM
                    });

                    return send(msg.from, MENUS.PHONE_SYNC_CONFIRM
                        .replace('{{action}}', action)
                        .replace('{{result}}', result)
                    );
                } else if (choice === 3) {
                    await (convexClient as any).mutation(api.sessions.updateMenuState, {
                        sessionId: sessionRecord._id,
                        menuState: MENU_STATES.MAIN_MENU
                    });
                    return send(msg.from, MENUS.MAIN_MENU);
                }
                break;

            case MENU_STATES.PHONE_SYNC_CONFIRM:
                if (choice === 1) {
                    const action = sessionRecord.draftMessage;
                    const enabled = action === 'Enable';
                    
                    await (convexClient as any).mutation(api.sessions.togglePhoneSync, { 
                        sessionId: sessionRecord._id, 
                        enabled 
                    });
                    
                    await send(msg.from, `Phone Sync ${enabled ? 'enabled' : 'disabled'}! ✅`);
                    
                    await (convexClient as any).mutation(api.sessions.updateMenuState, {
                        sessionId: sessionRecord._id,
                        menuState: MENU_STATES.MAIN_MENU
                    });
                    return send(msg.from, MENUS.MAIN_MENU);
                } else if (choice === 2) {
                    await (convexClient as any).mutation(api.sessions.updateMenuState, {
                        sessionId: sessionRecord._id,
                        menuState: MENU_STATES.PHONE_SYNC_SETTINGS
                    });
                    const text = MENUS.PHONE_SYNC_SETTINGS.replace('{{status}}', sessionRecord.phoneSyncEnabled ? '✅ Enabled' : '❌ Disabled');
                    return send(msg.from, text);
                }
                break;

            case MENU_STATES.LOGOUT_CONFIRM:
                if (choice === 1) {
                    await send(msg.from, 'Logging out... 🚪');
                    await client.logout();
                } else if (choice === 2) {
                    // Cancel -> Back to main menu
                    await (convexClient as any).mutation(api.sessions.updateMenuState, {
                        sessionId: sessionRecord._id,
                        menuState: MENU_STATES.MAIN_MENU
                    });
                    return send(msg.from, MENUS.MAIN_MENU);
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
                    
                    await send(msg.from, `Auto-save ${enabled ? 'enabled' : 'disabled'}! ✅`);
                    
                    // Back to main menu
                    await (convexClient as any).mutation(api.sessions.updateMenuState, {
                        sessionId: sessionRecord._id,
                        menuState: MENU_STATES.MAIN_MENU
                    });
                    return send(msg.from, MENUS.MAIN_MENU);
                } else {
                    // Back to settings menu
                    await (convexClient as any).mutation(api.sessions.updateMenuState, {
                        sessionId: sessionRecord._id,
                        menuState: MENU_STATES.AUTO_SAVE_SETTINGS
                    });
                    const text = MENUS.AUTO_SAVE_SETTINGS.replace('{{status}}', sessionRecord.autoSaveEnabled ? '✅ Enabled' : '❌ Disabled');
                    return send(msg.from, text);
                }
                break;

            default:
                if (currentState !== MENU_STATES.IDLE && !isNaN(choice)) {
                    await send(msg.from, 'Unknown command. Type $start to see the menu.');
                    await (convexClient as any).mutation(api.sessions.updateMenuState, {
                        sessionId: sessionRecord._id,
                        menuState: MENU_STATES.IDLE
                    });
                }
        }
    } catch (globalErr: any) {
        console.error('❌ CRITICAL ERROR in handleMessage:', globalErr);
    }
};

    // client.on('message', handleMessage); // Removed to prevent double-processing
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
