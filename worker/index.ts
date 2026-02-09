import "dotenv/config";
import { Client, RemoteAuth } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import { ConvexHttpClient } from "convex/browser";

import { api } from "../web/convex/_generated/api";
import { ConvexStore } from "./convexStore";
import { Id } from "../convex/_generated/dataModel";
import { MENU_STATES, MENUS, getStatusProgress } from "./menus";
import { setupQueues, bulkSaveQueue, announcementQueue } from "./queues";

// ... (worker set up)

const CONVEX_URL = process.env.CONVEX_URL || "";

if (!CONVEX_URL) {
  console.error("Missing CONVEX_URL");
  process.exit(1);
}

const convexClient = new ConvexHttpClient(CONVEX_URL);

import { PLANS } from "./constants/plans";

// --- WINDOWS STABILITY SHIELD ---
process.on("uncaughtException", (err) => {
  if (err.message.includes("ENOENT") && err.message.includes("scandir")) return;
  console.error("CRITICAL ERROR:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason: any) => {
  if (reason?.message?.includes("ENOENT") && reason?.message?.includes("scandir")) return;
  console.error("UNHANDLED REJECTION:", reason);
});
// --------------------------------

class ClientManager {
  public clients: Map<Id<"sessions">, Client> = new Map();

  async startAll() {
    console.log("🚀 Starting WazBot Multi-Session Worker...");
    const sessions = await convexClient.query(api.sessions.getAll);
    console.log(`📡 Found ${sessions.length} sessions in database.`);

    for (const session of sessions) {
      await this.initSession(session);
    }

    // Initialize Queues once
    setupQueues(this.clients);

    // Periodically sync new sessions (e.g., every 30s)
    setInterval(() => this.syncNewSessions(), 30000);
  }

  async syncNewSessions() {
    const sessions = await convexClient.query(api.sessions.getAll);
    for (const session of sessions) {
      if (!this.clients.has(session._id)) {
        await this.initSession(session);
      }
    }
  }

  async initSession(sessionRecord: any) {
    const sessionId = sessionRecord._id;
    const ownerId = sessionRecord.ownerId;

    if (this.clients.has(sessionId)) return;

    console.log(`📦 Initializing session [${sessionId}] for user ${ownerId}`);

    const clientStore = new ConvexStore(CONVEX_URL, ownerId);

    const client = new Client({
      authStrategy: new RemoteAuth({
        clientId: sessionId, // UNIQUE SESSION ID
        store: clientStore,
        backupSyncIntervalMs: 600000,
      }),
      puppeteer: {
        headless: process.env.HEADLESS !== "false",
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-gpu",
        ],
      },
      webVersionCache: {
        type: "remote",
        remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/refs/heads/main/html/2.3000.1032521188-alpha.html",
      },
    });

    this.clients.set(sessionId, client);
    this.setupClientHandlers(client, sessionId, ownerId);
    
    console.log(`[${sessionId}] Initializing WhatsApp client...`);
    await convexClient.mutation(api.sessions.updateStatus, {
      sessionId,
      status: "INITIALIZING",
    }).catch(e => console.error(`[${sessionId}] Failed to set INITIALIZING:`, e.message));

    client.initialize().catch(err => {
        console.error(`[${sessionId}] Init Failed:`, err.message);
    });

    // Start background tasks for this session
    this.startBackgroundTasks(client, sessionId);
  }

  private setupClientHandlers(client: Client, sessionId: Id<"sessions">, ownerId: Id<"users">) {
    client.on("qr", async (qr) => {
      console.log(`[${sessionId}] QR RECEIVED`);
      // Optional: only show QR in term for local testing if env var set
      if (process.env.SHOW_QR_IN_TERM === "true") {
        qrcode.generate(qr, { small: true });
      }

      await convexClient.mutation(api.sessions.saveQR, {
        sessionId,
        qrCode: qr,
      }).catch((e) => console.error(`[${sessionId}] Failed to save QR:`, e.message));
    });

    client.on("ready", async () => {
      console.log(`[${sessionId}] ✅ READY and ACTIVE`);
      
      // Inject sendSeen mock
      try {
        await (client as any).pupPage.evaluate(() => {
          const win = (globalThis as any).window ?? globalThis;
          if (win.WWebJS) {
            win.WWebJS.sendSeen = async () => true;
          }
        });
      } catch (e) {}

      const info = client.info;
      if (info && info.wid) {
        await convexClient.mutation(api.sessions.saveOwnerDetails, {
          sessionId,
          ownerWid: info.wid._serialized,
          ownerNumber: info.wid.user,
        });
      }
    });

    client.on("authenticated", () => {
        console.log(`[${sessionId}] 🔐 AUTHENTICATED`);
    });

    client.on("auth_failure", (msg) => {
        console.error(`[${sessionId}] ❌ AUTH FAILURE:`, msg);
    });

    client.on("disconnected", async (reason) => {
        console.log(`[${sessionId}] 🚪 DISCONNECTED:`, reason);
        await convexClient.mutation(api.sessions.updateStatus, {
            sessionId,
            status: "DISCONNECTED",
        });
    });

    // Unified message handler
    const handler = async (msg: any) => {
        await this.handleMessage(client, sessionId, ownerId, msg);
    };
    client.on("message_create", handler);
  }

  private async handleMessage(client: Client, sessionId: Id<"sessions">, ownerId: Id<"users">, msg: any) {
    const body = (msg.body || "").trim();
    if (msg.isStatus) return;

    // Bot feedback guard
    const isBotResponse =
      body.includes("WazBot") ||
      body.includes("Starting bulk") ||
      body.includes("No new unsaved") ||
      body.includes("Invalid option") ||
      body.includes("Sync successful") ||
      body.includes("Plan limit reached");

    if (msg.fromMe && isBotResponse) return;

    try {
      const sessionRecord = await convexClient.query(api.sessions.getById, { sessionId });
      if (!sessionRecord || !sessionRecord.ownerWid) return;

      const user = await convexClient.query(api.users.getById, { userId: ownerId });
      const plan = (user?.plan || "FREE") as "FREE" | "PRO";
      const limits = PLANS[plan];

      const send = async (to: string, content: string) => {
        try {
          await client.sendMessage(to, content);
        } catch (e: any) {
          console.error(`[${sessionId}] Send failed: ${e.message}`);
        }
      };

      const from = msg.from;
      const to = msg.to;
      const fromMe = msg.fromMe;
      const ownerWid = sessionRecord.ownerWid;
      
      const isOwnerMessage = fromMe && from === ownerWid;
      const isBotMessageToOwner = fromMe && to === ownerWid && from !== ownerWid;

      if (isBotMessageToOwner) return;

      if (!isOwnerMessage && !fromMe && !msg.isStatus) {
        // --- AUTO-SAVE LOGIC ---
        if (sessionRecord.autoSaveEnabled) {
          // CHECK LIMITS
          const currentSaved = sessionRecord.metrics?.saved || 0;
          if (currentSaved >= limits.MAX_CONTACTS) {
            console.log(`[${sessionId}] 🛑 PLAN LIMIT: ${currentSaved}/${limits.MAX_CONTACTS} contacts. Skipping auto-save.`);
            // Silent ignore for auto-save, we don't want to spam the user's customers
            return;
          }

          const contact = await msg.getContact();
          if (!contact.isMyContact) {
            const contactName = contact.pushname || contact.name || "WhatsApp User";
            const metadata = { name: contactName, lastInteraction: Date.now() };

            const contactId = await (convexClient as any).mutation(api.contacts.saveContact, {
              sessionId,
              waId: msg.from,
              metadata,
            });

            // LID resolution and phone sync (same as before)
            let realNumber = contact.number;
            let isLidContact = msg.from.endsWith("@lid");

            if (isLidContact) {
              try {
                const resolved = await (client as any).getContactLidAndPhone([msg.from]);
                if (resolved && resolved.length > 0) {
                  const phoneNumber = resolved[0].pn || resolved[0].phone;
                  if (phoneNumber) realNumber = phoneNumber.replace("@c.us", "").replace(/\D/g, "");
                }
              } catch (e) {}
            }

            const digitsOnly = realNumber ? realNumber.replace(/\D/g, "") : undefined;
            if (digitsOnly) {
              await (convexClient as any).mutation(api.contacts.saveContact, {
                sessionId,
                waId: msg.from,
                phoneNumber: digitsOnly,
                metadata,
              });
            }

            if (sessionRecord.phoneSyncEnabled && digitsOnly) {
              // ... existing phone sync logic ...
              // (keeping briefly for brevity, same as original but within class)
              try {
                const nameParts = metadata.name.split(" ");
                const firstName = nameParts[0] || "WazBot";
                const lastName = nameParts.slice(1).join(" ") || "Contact";
                const shouldSync = !isLidContact || (isLidContact && digitsOnly && !digitsOnly.includes("lid"));
                if (shouldSync) {
                   await (client as any).saveOrEditAddressbookContact(digitsOnly, firstName, lastName, true);
                   await (convexClient as any).mutation(api.contacts.updateSyncStatus, { contactId, phoneSyncStatus: "success" });
                }
              } catch (e) {}
            }
          }
        }
        return;
      }

      // --- OWNER ONLY LOGIC ---
      if (!isOwnerMessage) return;

      const currentState = sessionRecord.menuState;
      const input = body.trim();
      const choice = parseInt(input);

      if (input === "$start" || currentState === MENU_STATES.IDLE || currentState === undefined) {
        await convexClient.mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.MAIN_MENU });
        return send(msg.from, MENUS.MAIN_MENU);
      }

      switch (currentState) {
        case MENU_STATES.MAIN_MENU:
          if (choice === 1) {
            await convexClient.mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.STATUS_METRICS });
            return send(msg.from, getStatusProgress(sessionRecord.metrics));
          } else if (choice === 2) {
            await convexClient.mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.AUTO_SAVE_SETTINGS });
            const text = (MENUS as any).SYNC_SETTINGS
              .replace("{{autoSave}}", sessionRecord.autoSaveEnabled ? "✅ Enabled" : "❌ Disabled")
              .replace("{{phoneSync}}", sessionRecord.phoneSyncEnabled ? "✅ Enabled" : "❌ Disabled");
            return send(msg.from, text);
          } else if (choice === 3) {
            // Bulk Save limit check
            const currentSaved = sessionRecord.metrics?.saved || 0;
            if (currentSaved >= limits.MAX_CONTACTS) {
                return send(msg.from, `🛑 *Plan Limit Reached!*\n\nYour ${plan} plan allows up to ${limits.MAX_CONTACTS} contacts. You currently have ${currentSaved} saved.\n\nPlease upgrade to WazBot Pro (R150) for up to 500+ contacts!`);
            }
            await convexClient.mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.BULK_SAVE_CONFIRM });
            return send(msg.from, MENUS.BULK_SAVE_CONFIRM);
          } else if (choice === 4) {
             // Announcement limit check
             const sentCount = sessionRecord.metrics?.announcementsSent || 0;
             if (sentCount >= limits.MAX_ANNOUNCEMENTS) {
                 return send(msg.from, `🛑 *Plan Limit Reached!*\n\nYour ${plan} plan allows up to ${limits.MAX_ANNOUNCEMENTS} announcements. You have already used them.\n\nPlease upgrade to WazBot Pro (R150) for 20 announcements!`);
             }
             
            const activeOp = await convexClient.query(api.operations.getBySession, { sessionId, type: "ANNOUNCEMENT" });
            if (activeOp && activeOp.status === "PROCESSING") {
              await convexClient.mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.ANNOUNCEMENT_PROGRESS });
              return send(msg.from, `${MENUS.ANNOUNCEMENT_PROGRESS}\n\n📊 *Progress: ${activeOp.progress}/${activeOp.total} sent*`);
            }
            await convexClient.mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.ANNOUNCEMENT_DRAFT });
            return send(msg.from, MENUS.ANNOUNCEMENT_DRAFT);
          } else if (choice === 5) {
            const excludedContacts = await convexClient.query(api.contacts.getExcludedContacts, { sessionId });
            await convexClient.mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.EXCLUSION_MENU });
            const text = MENUS.EXCLUSION_MENU.replace("{{count}}", excludedContacts.length.toString());
            return send(msg.from, text);
          } else if (choice === 6) {
            await convexClient.mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.LOGOUT_CONFIRM });
            return send(msg.from, MENUS.LOGOUT_CONFIRM);
          } else if (!isNaN(choice)) {
            return send(msg.from, "Invalid option. Reply with a number (1-6).");
          }
          break;

        case MENU_STATES.LOGOUT_CONFIRM:
          if (choice === 1) {
            await send(msg.from, "Logging out... 🚪");
            await client.logout();
            this.clients.delete(sessionId);
          } else if (choice === 2) {
            await convexClient.mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.MAIN_MENU });
            return send(msg.from, MENUS.MAIN_MENU);
          }
          break;

        case MENU_STATES.BULK_SAVE_CONFIRM:
          if (choice === 1) {
            const chats = await client.getChats();
            const savedContacts = await convexClient.query(api.contacts.getContacts as any, { sessionId });
            const savedWids = new Set(savedContacts.map((c: any) => c.waId));
            const unsavedWids = chats
              .filter(chat => !chat.isGroup)
              .map(chat => chat.id._serialized)
              .filter(waId => !savedWids.has(waId));

            if (unsavedWids.length === 0) {
              await send(msg.from, "No new unsaved contacts found! All good. ✅");
              await convexClient.mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.MAIN_MENU });
              return send(msg.from, MENUS.MAIN_MENU);
            }

            // Slice based on remaining plan quota
            const currentSaved = sessionRecord.metrics?.saved || 0;
            const remainingQuota = limits.MAX_CONTACTS - currentSaved;
            const toProcess = unsavedWids.slice(0, remainingQuota);

            if (toProcess.length === 0) {
               return send(msg.from, `🛑 *Limit Reached!* Update to Pro to save more.`);
            }

            await (convexClient as any).mutation(api.operations.start, { sessionId, type: "BULK_SAVE", total: toProcess.length });
            await bulkSaveQueue.add("bulk-save", { sessionId, waIds: toProcess });
            await convexClient.mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.BULK_SAVE_PROGRESS });
            return send(msg.from, `Starting bulk save for ${toProcess.length} contacts... 📥`);
          } else {
            await convexClient.mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.MAIN_MENU });
            return send(msg.from, MENUS.MAIN_MENU);
          }
          break;

        case MENU_STATES.ANNOUNCEMENT_DRAFT:
          if (input === "0") {
            await convexClient.mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.MAIN_MENU });
            return send(msg.from, MENUS.MAIN_MENU);
          }
          await (convexClient as any).mutation(api.sessions.updateDraftMessage, { sessionId, draftMessage: input });
          await (convexClient as any).mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.ANNOUNCEMENT_CONFIRM });
          return send(msg.from, MENUS.ANNOUNCEMENT_CONFIRM.replace("{{message}}", input));

        case MENU_STATES.ANNOUNCEMENT_CONFIRM:
          if (choice === 1) {
            let savedContacts = await convexClient.query(api.contacts.getContacts as any, { sessionId });
            
            // --- Contact Enrichment ---
            // Resolve missing phone numbers for @lid contacts to ensure exclusions work
            const lidContactsToResolve = savedContacts.filter((c: any) => c.waId.endsWith("@lid") && !c.phoneNumber);
            if (lidContactsToResolve.length > 0) {
              console.log(`[${sessionId}] Enriching ${lidContactsToResolve.length} @lid contacts...`);
              try {
                const lids = lidContactsToResolve.map((c: any) => c.waId);
                const resolved = await (client as any).getContactLidAndPhone(lids);
                
                for (const item of resolved) {
                  const pn = item.pn || item.phone;
                  if (pn) {
                    const digits = pn.replace("@c.us", "").replace(/\D/g, "");
                    const original = lidContactsToResolve.find((c: any) => c.waId === item.id._serialized);
                    if (original) {
                      await (convexClient as any).mutation(api.contacts.saveContact, {
                        sessionId,
                        waId: original.waId,
                        phoneNumber: digits,
                        metadata: original.metadata
                      });
                      console.log(`[${sessionId}] Resolved ${original.waId} -> ${digits}`);
                    }
                  }
                }
                // Refresh contacts after enrichment
                savedContacts = await convexClient.query(api.contacts.getContacts as any, { sessionId });
              } catch (e) {
                console.error(`[${sessionId}] Enrichment failed:`, e);
              }
            }

            // Debug logging
            console.log(`[${sessionId}] Total contacts: ${savedContacts.length}`);
            console.log(`[${sessionId}] Contacts breakdown:`, savedContacts.map((c: any) => ({
              waId: c.waId,
              phoneNumber: c.phoneNumber,
              isSaved: c.isSaved,
              isOptedOut: c.isOptedOut,
              name: c.metadata?.name
            })));
            
            // Filter out excluded contacts
            const activeWids = savedContacts
              .filter((c: any) => c.isSaved && !c.isOptedOut)
              .map((c: any) => c.waId);
            const excludedCount = savedContacts.filter((c: any) => c.isSaved && c.isOptedOut).length;
            
            console.log(`[${sessionId}] Active recipients: ${activeWids.length}, Excluded: ${excludedCount}`);
            console.log(`[${sessionId}] Will send to:`, activeWids);
            
            if (activeWids.length === 0) {
              await send(msg.from, "No active saved contacts found. ❌");
              await convexClient.mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.MAIN_MENU });
              return send(msg.from, MENUS.MAIN_MENU);
            }
            
            await (convexClient as any).mutation(api.operations.start, { sessionId, type: "ANNOUNCEMENT", total: activeWids.length });
            await (announcementQueue as any).add("announcements", { sessionId, waIds: activeWids, message: sessionRecord.draftMessage });
            await (convexClient as any).mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.ANNOUNCEMENT_PROGRESS });
            const excludedMsg = excludedCount > 0 ? `\n\n🚫 _${excludedCount} excluded contact(s) will not receive this._` : "";
            return send(msg.from, MENUS.ANNOUNCEMENT_PROGRESS + `\n\nStarting broadcast... 📣${excludedMsg}`);
          } else if (choice === 2) {
            await convexClient.mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.ANNOUNCEMENT_DRAFT });
            return send(msg.from, MENUS.ANNOUNCEMENT_DRAFT);
          } else {
            await convexClient.mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.MAIN_MENU });
            return send(msg.from, MENUS.MAIN_MENU);
          }
          break;
        
        case MENU_STATES.ANNOUNCEMENT_PROGRESS:
          if (choice === 1) {
            // Pause announcement
            await (convexClient as any).mutation(api.operations.pauseOperation, { sessionId, type: "ANNOUNCEMENT" });
            await send(msg.from, "⏸️ Announcement paused. The broadcast has been stopped.");
            await convexClient.mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.MAIN_MENU });
            return send(msg.from, MENUS.MAIN_MENU);
          } else if (choice === 2) {
            // Cancel announcement
            await (convexClient as any).mutation(api.operations.cancelOperation, { sessionId, type: "ANNOUNCEMENT" });
            await send(msg.from, "❌ Announcement cancelled. The broadcast has been stopped.");
            await convexClient.mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.MAIN_MENU });
            return send(msg.from, MENUS.MAIN_MENU);
          }
          break;
        
        case MENU_STATES.STATUS_METRICS:
          if (choice === 0) {
            await convexClient.mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.MAIN_MENU });
            return send(msg.from, MENUS.MAIN_MENU);
          }
          break;

        case MENU_STATES.AUTO_SAVE_SETTINGS:
          if (choice === 1) {
            const action = sessionRecord.autoSaveEnabled ? "Disable" : "Enable";
            const result = sessionRecord.autoSaveEnabled ? "ignored" : "automatically saved";
            await (convexClient as any).mutation(api.sessions.updateDraftMessage, { sessionId, draftMessage: action });
            await convexClient.mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.AUTO_SAVE_CONFIRM });
            return send(msg.from, MENUS.AUTO_SAVE_CONFIRM.replace("{{action}}", action).replace("{{result}}", result));
          } else if (choice === 2) {
            const action = sessionRecord.phoneSyncEnabled ? "Disable" : "Enable";
            const result = sessionRecord.phoneSyncEnabled ? "stop syncing with" : "sync to";
            await (convexClient as any).mutation(api.sessions.updateDraftMessage, { sessionId, draftMessage: action });
            await convexClient.mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.PHONE_SYNC_CONFIRM });
            return send(msg.from, (MENUS as any).PHONE_SYNC_CONFIRM.replace("{{action}}", action).replace("{{result}}", result));
          } else if (choice === 3) {
            await convexClient.mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.MAIN_MENU });
            return send(msg.from, MENUS.MAIN_MENU);
          }
          break;

        case MENU_STATES.AUTO_SAVE_CONFIRM:
          if (choice === 1) {
            const enabled = sessionRecord.draftMessage === "Enable";
            await convexClient.mutation(api.sessions.toggleAutoSave, { sessionId, enabled });
            await send(msg.from, `Auto-save ${enabled ? "enabled" : "disabled"}! ✅`);
            await convexClient.mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.MAIN_MENU });
            return send(msg.from, MENUS.MAIN_MENU);
          } else {
            await convexClient.mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.AUTO_SAVE_SETTINGS });
            const text = (MENUS as any).SYNC_SETTINGS
              .replace("{{autoSave}}", sessionRecord.autoSaveEnabled ? "✅ Enabled" : "❌ Disabled")
              .replace("{{phoneSync}}", sessionRecord.phoneSyncEnabled ? "✅ Enabled" : "❌ Disabled");
            return send(msg.from, text);
          }
          break;

        case MENU_STATES.PHONE_SYNC_CONFIRM:
          if (choice === 1) {
            const enabled = sessionRecord.draftMessage === "Enable";
            await (convexClient as any).mutation(api.sessions.togglePhoneSync, { sessionId, enabled });
            await send(msg.from, `Phone Sync ${enabled ? "enabled" : "disabled"}! ✅`);
            await convexClient.mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.MAIN_MENU });
            return send(msg.from, MENUS.MAIN_MENU);
          } else {
            await convexClient.mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.AUTO_SAVE_SETTINGS });
            const text = (MENUS as any).SYNC_SETTINGS
              .replace("{{autoSave}}", sessionRecord.autoSaveEnabled ? "✅ Enabled" : "❌ Disabled")
              .replace("{{phoneSync}}", sessionRecord.phoneSyncEnabled ? "✅ Enabled" : "❌ Disabled");
            return send(msg.from, text);
          }
          break;

        case MENU_STATES.EXCLUSION_MENU:
          if (choice === 1) {
            // View excluded numbers
            const excluded = await convexClient.query(api.contacts.getExcludedContacts, { sessionId });
            if (excluded.length === 0) {
              return send(msg.from, "No excluded contacts. ✅\n\n0. ⬅️ Back");
            }
            const list = excluded.map((c: any, i: number) => `${i + 1}. ${c.metadata?.name || "Unknown"} (${c.waId.split("@")[0]})`).join("\n");
            return send(msg.from, MENUS.EXCLUSION_VIEW.replace("{{list}}", list));
          } else if (choice === 2) {
            // Add number to exclusion
            await convexClient.mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.EXCLUSION_ADD });
            return send(msg.from, MENUS.EXCLUSION_ADD);
          } else if (choice === 3) {
            // Remove number from exclusion
            const excluded = await convexClient.query(api.contacts.getExcludedContacts, { sessionId });
            if (excluded.length === 0) {
              return send(msg.from, "No excluded contacts to remove. ✅");
            }
            const list = excluded.map((c: any, i: number) => `${i + 1}. ${c.metadata?.name || "Unknown"} (${c.waId.split("@")[0]})`).join("\n");
            await (convexClient as any).mutation(api.sessions.updateDraftMessage, { sessionId, draftMessage: JSON.stringify(excluded.map((c: any) => c.waId)) });
            await convexClient.mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.EXCLUSION_REMOVE });
            return send(msg.from, MENUS.EXCLUSION_REMOVE.replace("{{list}}", list));
          } else if (choice === 4 || choice === 0) {
            // Back to main menu
            await convexClient.mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.MAIN_MENU });
            return send(msg.from, MENUS.MAIN_MENU);
          }
          break;

        case MENU_STATES.EXCLUSION_ADD:
          if (input === "0") {
            await convexClient.mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.EXCLUSION_MENU });
            const excludedContacts = await convexClient.query(api.contacts.getExcludedContacts, { sessionId });
            const text = MENUS.EXCLUSION_MENU.replace("{{count}}", excludedContacts.length.toString());
            return send(msg.from, text);
          }
          // Validate phone number format (digits only)
          const phoneNumber = input.replace(/\D/g, "");
          if (phoneNumber.length < 10 || phoneNumber.length > 15) {
            return send(msg.from, "❌ Invalid phone number. Please enter a valid number with country code (10-15 digits).\n\nTry again or reply '0' to cancel.");
          }
          const waId = phoneNumber + "@c.us";
          
          await (convexClient as any).mutation(api.contacts.toggleOptOut, { sessionId, waId, optOut: true });
          
          await send(msg.from, `✅ Number *${phoneNumber}* added to exclusion list.\n\nThis contact will NOT receive announcements.`);
          await convexClient.mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.MAIN_MENU });
          return send(msg.from, MENUS.MAIN_MENU);

        case MENU_STATES.EXCLUSION_REMOVE:
          if (input === "0") {
            await convexClient.mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.EXCLUSION_MENU });
            const excludedContacts = await convexClient.query(api.contacts.getExcludedContacts, { sessionId });
            const text = MENUS.EXCLUSION_MENU.replace("{{count}}", excludedContacts.length.toString());
            return send(msg.from, text);
          }
          const removeChoice = parseInt(input);
          const excludedList = JSON.parse(sessionRecord.draftMessage || "[]");
          if (isNaN(removeChoice) || removeChoice < 1 || removeChoice > excludedList.length) {
            return send(msg.from, "❌ Invalid choice. Please enter a number from the list or '0' to cancel.");
          }
          const waIdToRemove = excludedList[removeChoice - 1];
          await (convexClient as any).mutation(api.contacts.toggleOptOut, { sessionId, waId: waIdToRemove, optOut: false });
          await send(msg.from, `✅ Contact removed from exclusion list.\n\nThey can now receive announcements.`);
          await convexClient.mutation(api.sessions.updateMenuState, { sessionId, menuState: MENU_STATES.MAIN_MENU });
          return send(msg.from, MENUS.MAIN_MENU);
      }
    } catch (e) {
      console.error(`[${sessionId}] Error:`, e);
    }
  }

  private startBackgroundTasks(client: Client, sessionId: Id<"sessions">) {
    const processRetries = async () => {
      try {
        const retries = await convexClient.query(api.retryQueue.getRetryQueue, { sessionId });
        for (const retry of retries) {
          const nextAttemptTime = retry.lastAttempt + Math.pow(2, retry.attempts) * 60000;
          if (Date.now() < nextAttemptTime) continue;
          if (retry.attempts >= 3) {
            await (convexClient as any).mutation(api.retryQueue.removeFromRetryQueue, { retryId: retry._id, sessionId });
            continue;
          }
          // Simple phone sync retry
          if (retry.retryType === "phone") {
             const contact = await client.getContactById(retry.waId);
             const digitsOnly = contact.number.replace(/\D/g, "");
             const nameParts = (retry.metadata.name || "WazBot Contact").split(" ");
             await (client as any).saveOrEditAddressbookContact(digitsOnly, nameParts[0], nameParts[1] || "Contact", true);
             await (convexClient as any).mutation(api.contacts.updateSyncStatus, { contactId: retry.contactId, phoneSyncStatus: "success" });
             await (convexClient as any).mutation(api.retryQueue.removeFromRetryQueue, { retryId: retry._id, sessionId });
          }
        }
      } catch (e) {}
      setTimeout(processRetries, 5 * 60 * 1000);
    };
    const processPairingRequest = async () => {
      try {
        const session = await convexClient.query(api.sessions.getById, { sessionId });
        if (session && session.pairingPhoneNumber && !session.pairingCode && session.status !== "CONNECTED") {
          console.log(`[${sessionId}] 📲 Generating pairing code for ${session.pairingPhoneNumber}...`);
          try {
            const code = await client.requestPairingCode(session.pairingPhoneNumber);
            if (code) {
              console.log(`[${sessionId}] 🔑 Pairing code generated: ${code}`);
              await convexClient.mutation(api.sessions.savePairingCode, {
                sessionId,
                pairingCode: code,
              });
            }
          } catch (e: any) {
            console.error(`[${sessionId}] Pairing code failed:`, e.message);
            // Optionally clear the number so they can try again or wait
          }
        }
      } catch (e) {}
      setTimeout(processPairingRequest, 10000); // Check every 10s
    };
    processPairingRequest();
    processRetries();
  }
}

// Start everything
const manager = new ClientManager();
manager.startAll().catch(err => {
    console.error("CRITICAL: Failed to start Client Manager", err);
});
