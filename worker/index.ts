import "dotenv/config";
import { Client, RemoteAuth } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import { ConvexHttpClient } from "convex/browser";

import { api } from "../convex/_generated/api";
import { ConvexStore } from "./convexStore";
import { Id } from "../convex/_generated/dataModel";
import { MENU_STATES, MENUS, getStatusProgress } from "./menus";
import { setupQueues, bulkSaveQueue, announcementQueue } from "./queues";

// ... (worker set up)

const CONVEX_URL = process.env.CONVEX_URL || "";
const OWNER_ID = process.env.OWNER_ID as Id<"users">; // For testing V1

if (!CONVEX_URL || !OWNER_ID) {
  console.error("Missing CONVEX_URL or OWNER_ID");
  process.exit(1);
}

const convexClient = new ConvexHttpClient(CONVEX_URL);
const store = new ConvexStore(CONVEX_URL, OWNER_ID);



// --- WINDOWS STABILITY SHIELD ---
process.on("uncaughtException", (err) => {
  if (err.message.includes("ENOENT") && err.message.includes("scandir")) {
    // Silent ignore for Windows RemoteAuth cleanup race condition
    return;
  }
  console.error("CRITICAL ERROR:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason: any) => {
  if (
    reason?.message?.includes("ENOENT") &&
    reason?.message?.includes("scandir")
  ) {
    // Silent ignore
    return;
  }
  console.error("UNHANDLED REJECTION:", reason);
});
// --------------------------------

async function initializeWorker() {
  console.log(`Starting worker for OWNER_ID: ${OWNER_ID}`);

  // 1. Get or create session in Convex
  let session = await convexClient.query(api.sessions.getByOwner, {
    ownerId: OWNER_ID,
  });

  // Auto-create session if missing but ID is provided
  if (!session && OWNER_ID) {
    console.log("Session not found, attempting to create one...");
    try {
      await (convexClient as any).mutation(api.sessions.create, {
        ownerId: OWNER_ID,
      });
      session = await convexClient.query(api.sessions.getByOwner, {
        ownerId: OWNER_ID,
      });
    } catch (e) {
      console.error(
        "Failed to auto-create session. Check if OWNER_ID is a valid User ID in Convex.",
      );
    }
  }

  if (!session) {
    console.log(
      "❌ Session still not found. Please verify your OWNER_ID in .env or provide it directly.",
    );
    process.exit(1);
  }

  const client = new Client({
    authStrategy: new RemoteAuth({
      clientId: OWNER_ID,
      store: store,
      backupSyncIntervalMs: 600000, // 10 minutes
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
    // Forced stable version to fix "markedUnread" and "ready" event hangs
    webVersionCache: {
      type: "remote",
      remotePath:
        "https://raw.githubusercontent.com/wppconnect-team/wa-version/refs/heads/main/html/2.3000.1032521188-alpha.html",
    },
  });

  client.on("qr", (qr) => {
    console.log("--- EVENT: QR RECEIVED ---");
    qrcode.generate(qr, { small: true });

    // Non-blocking mutation
    convexClient
      .mutation(api.sessions.saveQR, {
        sessionId: session!._id,
        qrCode: qr,
      })
      .catch((e) => console.error("Failed to save QR to Convex:", e));
  });

  client.on("authenticated", () => {
    console.log("--- EVENT: AUTHENTICATED ---");
    console.log("Session is valid. Syncing with WhatsApp servers...");
    console.log('Waiting for "ready" event...');
  });

  client.on("auth_failure", (msg) => {
    console.error("--- EVENT: AUTHENTICATION FAILURE ---", msg);
  });

  let isReady = false;

  client.on("ready", async () => {
    if (isReady) return;
    isReady = true;

    // 🧠 CRASH FIX (Discord recommendation):
    // Inject a mock sendSeen function to bypass the Meta-internal change
    // that causes the 'markedUnread' undefined crash in libraries.
    try {
      await (client as any).pupPage.evaluate(() => {
        const win = (globalThis as any).window ?? globalThis;
        if (win.WWebJS) {
          win.WWebJS.sendSeen = async () => true;
          console.log("✅ sendSeen mock injected successfully.");
        }
      });
    } catch (e: any) {
      console.warn(
        "⚠️ sendSeen mock injection failed (non-critical):",
        e.message,
      );
    }

    console.log("✅ WazBot is READY and ACTIVE.");
    try {
      const info = client.info;
      if (!info || !info.wid) {
        console.error("❌ Ready event fired but client info is missing!");
        return;
      }

      const ownerWid = info.wid._serialized;
      const ownerNumber = info.wid.user;

      await convexClient.mutation(api.sessions.saveOwnerDetails, {
        sessionId: session!._id,
        ownerWid,
        ownerNumber,
      });

      console.log(`Connected account: ${ownerWid}`);
      console.log("Identity synced to cloud.");
    } catch (err) {
      console.error("Error during identity sync:", err);
    }
  });

  client.on("loading_screen", (percent: any, message) => {
    if ((percent as number) % 25 === 0) {
      console.log(`Loading: ${percent}% - ${message}`);
    }
  });

  // Unified message handler
  const handleMessage = async (msg: any) => {
    const body = (msg.body || "").trim();

    // 🛑 LOOP GUARD: Absolutely ignore status/stories.
    if (msg.isStatus) return;

    // 🛡️ BOT FEEDBACK GUARD:
    // If fromMe is true, it could be the OWNER (from phone) OR the BOT (via code).
    // We ignore if it looks like one of the BOT's own menu/status messages.
    const isBotResponse =
      body.includes("WazBot") ||
      body.includes("Starting bulk") ||
      body.includes("No new unsaved") ||
      body.includes("Invalid option") ||
      body.includes("Sync successful");

    if (msg.fromMe && isBotResponse) return;

    try {
      if (!isReady) {
        console.log(
          `📩 Received message from ${msg.from} but bot is not READY yet.`,
        );
      }

      const sessionRecord = await convexClient.query(api.sessions.getByOwner, {
        ownerId: OWNER_ID,
      });
      if (!sessionRecord || !sessionRecord.ownerWid) {
        console.log("--- MSG IGNORED: No owner details yet in Convex ---");
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

      // Owner messages detection:
      // - Messages FROM owner: fromMe=true AND from=ownerWid (owner sending commands)
      // - Bot messages to ignore: fromMe=true AND to=ownerWid (bot sending menus to owner)
      // - Other contact messages: fromMe=false AND from!=ownerWid
      
      // Owner messages are those sent BY the owner (fromMe=true, from=ownerWid)
      // NOT messages sent TO the owner by the bot (fromMe=true, to=ownerWid)
      const isOwnerMessage = fromMe && from === ownerWid;
      const isBotMessageToOwner = fromMe && to === ownerWid && from !== ownerWid;

      if (isOwnerMessage) {
        console.log(`📩 Owner command: "${body.substring(0, 15)}"`);
      }

      if (isBotMessageToOwner) {
        console.log(`🤖 Bot message to owner - ignoring`);
        return; // Ignore bot's own messages to owner
      }

      if (!isOwnerMessage && !fromMe && !msg.isStatus) {
        // Milestone 3 logic: Auto-save context
        if (sessionRecord.autoSaveEnabled) {
          const contact = await msg.getContact();
          if (!contact.isMyContact) {
            const contactName =
              contact.pushname || contact.name || "WhatsApp User";
            const metadata = { name: contactName, lastInteraction: Date.now() };

            // 1. Save to Convex
            console.log(
              `💾 Saving lead to Convex: ${msg.from} (${contactName})`,
            );
            const contactId = await (convexClient as any).mutation(
              api.contacts.saveContact,
              {
                sessionId: sessionRecord._id,
                waId: msg.from,
                metadata,
              },
            );

            // 2. Resolve real number (Standard or LID)
            let realNumber = contact.number;
            let isLidContact = msg.from.endsWith("@lid");

            // 🧠 REFINED LID RESOLUTION using getContactLidAndPhone
            if (isLidContact) {
              console.log(`🔍 Attempting LID resolution for ${msg.from}...`);
              try {
                const resolved = await (client as any).getContactLidAndPhone([
                  msg.from,
                ]);
                console.log(
                  `🔍 LID resolution response:`,
                  JSON.stringify(resolved),
                );

                if (resolved && resolved.length > 0) {
                  const entry = resolved[0];
                  // Try both 'pn' (phone number) and 'phone' properties
                  const phoneNumber = entry.pn || entry.phone;

                  if (phoneNumber) {
                    // Clean the phone number - remove @c.us if present
                    realNumber = phoneNumber
                      .replace("@c.us", "")
                      .replace(/\D/g, "");
                    console.log(`✅ LID resolved to phone: ${realNumber}`);
                  } else {
                    console.warn(
                      `⚠️ LID response missing phone number:`,
                      entry,
                    );
                  }
                }
              } catch (lidErr: any) {
                console.warn(`⚠️ LID resolution API failed: ${lidErr.message}`);
              }

              // Fallback: Try to extract from contact.id.user
              if (!realNumber || realNumber.includes("lid")) {
                const userPart = (contact as any).id?.user;
                if (userPart && !userPart.includes("lid")) {
                  realNumber = userPart.replace(/\D/g, "");
                  console.log(`🔄 LID fallback to id.user: ${realNumber}`);
                } else {
                  console.warn(
                    `⚠️ Cannot resolve LID to phone number: ${msg.from}`,
                  );
                  realNumber = undefined;
                }
              }
            }

            const digitsOnly = realNumber
              ? realNumber.replace(/\D/g, "")
              : undefined;

            // 2b. Re-save to Convex with phoneNumber if resolved
            if (digitsOnly) {
              await (convexClient as any).mutation(api.contacts.saveContact, {
                sessionId: sessionRecord._id,
                waId: msg.from,
                phoneNumber: digitsOnly, // <--- Store resolved number
                metadata,
              });
            }


            // 4. Sync to Phone directly if enabled (Milestone 7)
            if (sessionRecord.phoneSyncEnabled && digitsOnly) {
              try {
                const nameParts = metadata.name.split(" ");
                const firstName = nameParts[0] || "WazBot";
                const lastName = nameParts.slice(1).join(" ") || "Contact";

                console.log(
                  `📱 Syncing to Address Book: ${digitsOnly} (${metadata.name})`,
                );

                // CRITICAL: Only enable phone sync for non-LID OR successfully resolved LID contacts
                const shouldSyncToPhone =
                  !isLidContact ||
                  (isLidContact && digitsOnly && !digitsOnly.includes("lid"));

                try {
                  if (shouldSyncToPhone) {
                    await (client as any).saveOrEditAddressbookContact(
                      digitsOnly,
                      firstName,
                      lastName,
                      true, // syncToAddressbook = true to sync to physical phone
                    );
                    console.log(
                      `✅ Native Phone Sync successful for ${digitsOnly}`,
                    );
                    
                    // Update success status
                    await (convexClient as any).mutation(api.contacts.updateSyncStatus, {
                      contactId,
                      phoneSyncStatus: "success",
                    });
                  } else {
                    // For unresolved LID contacts, just save to WhatsApp without phone sync
                    await (client as any).saveOrEditAddressbookContact(
                      digitsOnly || msg.from.replace("@lid", ""),
                      firstName,
                      lastName,
                      false, // Don't sync to phone to avoid toString crash
                    );
                    console.log(
                      `✅ Contact saved to WhatsApp only (LID not fully resolved)`,
                    );
                  }
                } catch (syncErr: any) {
                  console.warn(
                    `⚠️ Address Book Sync failed: ${syncErr.message}`,
                  );
                  // Add to retry queue
                  if (contactId) {
                    await (convexClient as any).mutation(api.retryQueue.addToRetryQueue, {
                      contactId,
                      sessionId: sessionRecord._id,
                      waId: msg.from,
                      retryType: "phone",
                      errorMessage: syncErr.message,
                    });
                  }
                }
              } catch (nativeErr: any) {
                console.warn(
                  `⚠️ Native Sync internal WA block for ${msg.from}: ${nativeErr.message}`,
                );
              }
            }
          }
        }

        return;
      }

      // --- OWNER ONLY LOGIC ---
      if (!isOwnerMessage) {
        return; // Ignore non-owner messages and bot's own messages
      }

      const currentState = sessionRecord.menuState;
      const input = body.trim();

      console.log(`Owner Input: "${input}" | State: ${currentState}`);

      // 1. Entry Point
      if (input === "$start" || currentState === MENU_STATES.IDLE || currentState === undefined) {
        console.log("Sending Main Menu to owner...");
        await (convexClient as any).mutation(api.sessions.updateMenuState, {
          sessionId: sessionRecord._id,
          menuState: MENU_STATES.MAIN_MENU,
        });
        return send(msg.from, MENUS.MAIN_MENU);
      }



      // 2. State-based numeric routing
      const choice = parseInt(input);

      switch (currentState) {
        case MENU_STATES.MAIN_MENU:
          if (choice === 1) {
            // Status
            await convexClient.mutation(api.sessions.updateMenuState, {
              sessionId: sessionRecord._id,
              menuState: MENU_STATES.STATUS_METRICS,
            });
            return send(msg.from, getStatusProgress(sessionRecord.metrics));
          } else if (choice === 2) {
            // Auto-save settings
            await convexClient.mutation(api.sessions.updateMenuState, {
              sessionId: sessionRecord._id,
              menuState: MENU_STATES.AUTO_SAVE_SETTINGS,
            });
            const text = MENUS.AUTO_SAVE_SETTINGS.replace(
              "{{status}}",
              sessionRecord.autoSaveEnabled ? "✅ Enabled" : "❌ Disabled",
            );
            return send(msg.from, text);
          } else if (choice === 3) {
            // Redirect to Bulk Save Confirm
            await convexClient.mutation(api.sessions.updateMenuState, {
              sessionId: sessionRecord._id,
              menuState: MENU_STATES.BULK_SAVE_CONFIRM,
            });
            return send(msg.from, MENUS.BULK_SAVE_CONFIRM);
          } else if (choice === 4) {
            // Announcement (Check if active)
            const activeOp = await convexClient.query(api.operations.getBySession, { 
              sessionId: sessionRecord._id, 
              type: "ANNOUNCEMENT" 
            });
            
            if (activeOp && activeOp.status === "PROCESSING") {
              await convexClient.mutation(api.sessions.updateMenuState, {
                sessionId: sessionRecord._id,
                menuState: MENU_STATES.ANNOUNCEMENT_PROGRESS,
              });
              const progressMsg = `${MENUS.ANNOUNCEMENT_PROGRESS}\n\n📊 *Progress: ${activeOp.progress}/${activeOp.total} sent*`;
              return send(msg.from, progressMsg);
            }

            // Send Announcement - Step 1: Draft
            await (convexClient as any).mutation(api.sessions.updateMenuState, {
              sessionId: sessionRecord._id,
              menuState: MENU_STATES.ANNOUNCEMENT_DRAFT,
            });
            return send(msg.from, MENUS.ANNOUNCEMENT_DRAFT);
          } else if (choice === 5) {
            // Redirect to Logout Confirm
            await convexClient.mutation(api.sessions.updateMenuState, {
              sessionId: sessionRecord._id,
              menuState: MENU_STATES.LOGOUT_CONFIRM,
            });
            return send(msg.from, MENUS.LOGOUT_CONFIRM);
          } else if (choice === 6) {
            // Redirect to Phone Sync Settings

            await convexClient.mutation(api.sessions.updateMenuState, {
              sessionId: sessionRecord._id,
              menuState: MENU_STATES.PHONE_SYNC_SETTINGS,
            });
            const text = MENUS.PHONE_SYNC_SETTINGS.replace(
              "{{status}}",
              sessionRecord.phoneSyncEnabled ? "✅ Enabled" : "❌ Disabled",
            );
            return send(msg.from, text);
          } else if (choice === 7) {
            // Redirect to Re-sync Confirm

            await (convexClient as any).mutation(api.sessions.updateMenuState, {
              sessionId: sessionRecord._id,
              menuState: MENU_STATES.RE_SYNC_CONFIRM,
            });
            return send(msg.from, MENUS.RE_SYNC_CONFIRM);
          } else if (!isNaN(choice)) {
            await send(
              msg.from,
              "Invalid option. Reply with a number from the menu.",
            );
          }
          break;

        case MENU_STATES.RE_SYNC_CONFIRM:
          if (choice === 1) {
            // Proceed with Re-sync
            const savedContacts = await convexClient.query(
              api.contacts.getContacts as any,
              { sessionId: sessionRecord._id },
            );
            const savedWids = savedContacts.map((c: any) => c.waId);

            if (savedWids.length === 0) {
              await send(msg.from, "No saved contacts found to re-sync! ❌");
              await convexClient.mutation(api.sessions.updateMenuState, {
                sessionId: sessionRecord._id,
                menuState: MENU_STATES.MAIN_MENU,
              });
              return send(msg.from, MENUS.MAIN_MENU);
            }

            await (convexClient as any).mutation(api.operations.start, {
              sessionId: sessionRecord._id,
              type: "BULK_SAVE",
              total: savedWids.length,
            });

            await bulkSaveQueue.add("bulk-save", {
              sessionId: sessionRecord._id,
              waIds: savedWids,
            });

            await convexClient.mutation(api.sessions.updateMenuState, {
              sessionId: sessionRecord._id,
              menuState: MENU_STATES.BULK_SAVE_PROGRESS,
            });

            return client.sendMessage(
              msg.from,
              `Starting re-sync for ${savedWids.length} contacts... 🔄\nI will update you as I process them.`,
            );
          } else if (choice === 2) {
            // Cancel -> Back
            await (convexClient as any).mutation(api.sessions.updateMenuState, {
              sessionId: sessionRecord._id,
              menuState: MENU_STATES.MAIN_MENU,
            });
            return send(msg.from, MENUS.MAIN_MENU);
          }
          break;

        case MENU_STATES.PHONE_SYNC_SETTINGS:
          if (choice === 1 || choice === 2) {
            const action = choice === 1 ? "Enable" : "Disable";
            const result =
              choice === 1 ? "automatically UPDATED" : "NOT updated";

            await (convexClient as any).mutation(
              api.sessions.updateDraftMessage,
              {
                sessionId: sessionRecord._id,
                draftMessage: action,
              },
            );

            await (convexClient as any).mutation(api.sessions.updateMenuState, {
              sessionId: sessionRecord._id,
              menuState: MENU_STATES.PHONE_SYNC_CONFIRM,
            });

            return send(
              msg.from,
              MENUS.PHONE_SYNC_CONFIRM.replace("{{action}}", action).replace(
                "{{result}}",
                result,
              ),
            );
          } else if (choice === 3) {
            await (convexClient as any).mutation(api.sessions.updateMenuState, {
              sessionId: sessionRecord._id,
              menuState: MENU_STATES.MAIN_MENU,
            });
            return send(msg.from, MENUS.MAIN_MENU);
          }
          break;

        case MENU_STATES.PHONE_SYNC_CONFIRM:
          if (choice === 1) {
            const action = sessionRecord.draftMessage;
            const enabled = action === "Enable";

            await (convexClient as any).mutation(api.sessions.togglePhoneSync, {
              sessionId: sessionRecord._id,
              enabled,
            });

            await send(
              msg.from,
              `Phone Sync ${enabled ? "enabled" : "disabled"}! ✅`,
            );

            await (convexClient as any).mutation(api.sessions.updateMenuState, {
              sessionId: sessionRecord._id,
              menuState: MENU_STATES.MAIN_MENU,
            });
            return send(msg.from, MENUS.MAIN_MENU);
          } else if (choice === 2) {
            await (convexClient as any).mutation(api.sessions.updateMenuState, {
              sessionId: sessionRecord._id,
              menuState: MENU_STATES.PHONE_SYNC_SETTINGS,
            });
            const text = MENUS.PHONE_SYNC_SETTINGS.replace(
              "{{status}}",
              sessionRecord.phoneSyncEnabled ? "✅ Enabled" : "❌ Disabled",
            );
            return send(msg.from, text);
          }
          break;

        case MENU_STATES.LOGOUT_CONFIRM:
          if (choice === 1) {
            await send(msg.from, "Logging out... 🚪");
            await client.logout();
          } else if (choice === 2) {
            // Cancel -> Back to main menu
            await (convexClient as any).mutation(api.sessions.updateMenuState, {
              sessionId: sessionRecord._id,
              menuState: MENU_STATES.MAIN_MENU,
            });
            return send(msg.from, MENUS.MAIN_MENU);
          }
          break;

        case MENU_STATES.BULK_SAVE_CONFIRM:
          if (choice === 1) {
            // Proceed with Bulk Save
            const chats = await client.getChats();

            // NEW: Compare with database for 100% accuracy
            const savedContacts = await convexClient.query(
              api.contacts.getContacts as any,
              { sessionId: sessionRecord._id },
            );
            const savedWids = new Set(savedContacts.map((c: any) => c.waId));

            console.log(`🔍 [Bulk Debug] Total Chats Found: ${chats.length}`);
            const privateChats = chats.filter((chat) => !chat.isGroup);
            console.log(
              `🔍 [Bulk Debug] Private Chats: ${privateChats.length}`,
            );

            const unsavedWids = privateChats
              .map((chat) => chat.id._serialized)
              .filter((waId) => {
                const isSaved = savedWids.has(waId);
                if (isSaved)
                  console.log(
                    `⏩ [Bulk Debug] Skipping ${waId}: Already in Convex DB`,
                  );
                return !isSaved;
              });

            console.log(
              `🔍 [Bulk Debug] Final Unsaved Count: ${unsavedWids.length}`,
            );

            if (unsavedWids.length === 0) {
              await send(
                msg.from,
                "No new unsaved contacts found! All good. ✅",
              );
              await convexClient.mutation(api.sessions.updateMenuState, {
                sessionId: sessionRecord._id,
                menuState: MENU_STATES.MAIN_MENU,
              });
              return send(msg.from, MENUS.MAIN_MENU);
            }

            await (convexClient as any).mutation(api.operations.start, {
              sessionId: sessionRecord._id,
              type: "BULK_SAVE",
              total: unsavedWids.length,
            });

            await bulkSaveQueue.add("bulk-save", {
              sessionId: sessionRecord._id,
              waIds: unsavedWids,
            });

            await convexClient.mutation(api.sessions.updateMenuState, {
              sessionId: sessionRecord._id,
              menuState: MENU_STATES.BULK_SAVE_PROGRESS,
            });

            return client.sendMessage(
              msg.from,
              `Starting bulk save for ${unsavedWids.length} contacts... 📥\nI will update you as I process them.`,
            );
          } else {
            // Cancel -> Back
            await convexClient.mutation(api.sessions.updateMenuState, {
              sessionId: sessionRecord._id,
              menuState: MENU_STATES.MAIN_MENU,
            });
            return client.sendMessage(msg.from, MENUS.MAIN_MENU);
          }
          break;

        case MENU_STATES.ANNOUNCEMENT_DRAFT:
          if (input === "0") {
            // Cancel
            await (convexClient as any).mutation(api.sessions.updateMenuState, {
              sessionId: sessionRecord._id,
              menuState: MENU_STATES.MAIN_MENU,
            });
            return client.sendMessage(msg.from, MENUS.MAIN_MENU);
          }
          // Save draft
          await (convexClient as any).mutation(
            api.sessions.updateDraftMessage,
            {
              sessionId: sessionRecord._id,
              draftMessage: input,
            },
          );
          await (convexClient as any).mutation(api.sessions.updateMenuState, {
            sessionId: sessionRecord._id,
            menuState: MENU_STATES.ANNOUNCEMENT_CONFIRM,
          });
          return client.sendMessage(
            msg.from,
            MENUS.ANNOUNCEMENT_CONFIRM.replace("{{message}}", input),
          );

        case MENU_STATES.ANNOUNCEMENT_CONFIRM:
          if (choice === 1) {
            // 🚀 Send Now
            const savedContacts = await convexClient.query(
              api.contacts.getContacts as any,
              { sessionId: sessionRecord._id },
            );
            const activeWids = savedContacts
              .filter((c: any) => c.isSaved)
              .map((c: any) => c.waId);

            if (activeWids.length === 0) {
              client.sendMessage(
                msg.from,
                "No active saved contacts found to send to. ❌",
              );
              await convexClient.mutation(api.sessions.updateMenuState, {
                sessionId: sessionRecord._id,
                menuState: MENU_STATES.MAIN_MENU,
              });
              return client.sendMessage(msg.from, MENUS.MAIN_MENU);
            }

            await (convexClient as any).mutation(api.operations.start, {
              sessionId: sessionRecord._id,
              type: "ANNOUNCEMENT",
              total: activeWids.length,
            });

            await (announcementQueue as any).add("announcements", {
              sessionId: sessionRecord._id,
              waIds: activeWids,
              message: sessionRecord.draftMessage,
            });

            await (convexClient as any).mutation(api.sessions.updateMenuState, {
              sessionId: sessionRecord._id,
              menuState: MENU_STATES.ANNOUNCEMENT_PROGRESS,
            });

            return client.sendMessage(
              msg.from,
              MENUS.ANNOUNCEMENT_PROGRESS + `\n\nStarting broadcast to ${activeWids.length} contacts... 📣`,
            );
          } else if (choice === 2) {
            // Edit
            await (convexClient as any).mutation(api.sessions.updateMenuState, {
              sessionId: sessionRecord._id,
              menuState: MENU_STATES.ANNOUNCEMENT_DRAFT,
            });
            return client.sendMessage(msg.from, MENUS.ANNOUNCEMENT_DRAFT);
          } else {
            // Cancel or Invalid
            await (convexClient as any).mutation(api.sessions.updateMenuState, {
              sessionId: sessionRecord._id,
              menuState: MENU_STATES.MAIN_MENU,
            });
            return client.sendMessage(msg.from, MENUS.MAIN_MENU);
          }

        case MENU_STATES.ANNOUNCEMENT_PROGRESS:
          if (choice === 1) {
            // Pause
            await convexClient.mutation(api.operations.pauseOperation, {
              sessionId: sessionRecord._id,
              type: "ANNOUNCEMENT",
            });
            await convexClient.mutation(api.sessions.updateMenuState, {
              sessionId: sessionRecord._id,
              menuState: MENU_STATES.MAIN_MENU,
            });
            return send(msg.from, "Announcement paused. ⏸️ returning to Main Menu...");
          } else if (choice === 2) {
            // Cancel / Stop
            await convexClient.mutation(api.operations.cancelOperation, {
              sessionId: sessionRecord._id,
              type: "ANNOUNCEMENT",
            });
            await convexClient.mutation(api.sessions.updateMenuState, {
              sessionId: sessionRecord._id,
              menuState: MENU_STATES.MAIN_MENU,
            });
            return send(msg.from, "Announcement stopped and cancelled. 🛑 returning to Main Menu...");
          } else {
            // Go back
            await convexClient.mutation(api.sessions.updateMenuState, {
              sessionId: sessionRecord._id,
              menuState: MENU_STATES.MAIN_MENU,
            });
            return send(msg.from, MENUS.MAIN_MENU);
          }

        case MENU_STATES.STATUS_METRICS:
          if (choice === 0) {
            // Back
            await convexClient.mutation(api.sessions.updateMenuState, {
              sessionId: sessionRecord._id,
              menuState: MENU_STATES.MAIN_MENU,
            });
            return client.sendMessage(msg.from, MENUS.MAIN_MENU);
          } else {
            client.sendMessage(
              msg.from,
              'Invalid option. Reply "0" to go back.',
            );
          }
          break;

        case MENU_STATES.AUTO_SAVE_SETTINGS:
          if (choice === 1 || choice === 2) {
            // Enable or Disable -> REDIRECT to confirm
            const action = choice === 1 ? "Enable" : "Disable";
            const result =
              choice === 1
                ? "automatically added to your database"
                : "ignored unless you manually save them";

            // Store the intended action in the generic draftMessage field for temporarily storage
            await (convexClient as any).mutation(
              api.sessions.updateDraftMessage,
              {
                sessionId: sessionRecord._id,
                draftMessage: action, // Store 'Enable' or 'Disable'
              },
            );

            await convexClient.mutation(api.sessions.updateMenuState, {
              sessionId: sessionRecord._id,
              menuState: MENU_STATES.AUTO_SAVE_CONFIRM,
            });

            return client.sendMessage(
              msg.from,
              MENUS.AUTO_SAVE_CONFIRM.replace("{{action}}", action).replace(
                "{{result}}",
                result,
              ),
            );
          } else if (choice === 3) {
            // Back
            await (convexClient as any).mutation(api.sessions.updateMenuState, {
              sessionId: sessionRecord._id,
              menuState: MENU_STATES.MAIN_MENU,
            });
            return client.sendMessage(msg.from, MENUS.MAIN_MENU);
          }
          break;

        case MENU_STATES.AUTO_SAVE_CONFIRM:
          if (choice === 1) {
            const action = sessionRecord.draftMessage; // Retrieve the action we stored
            const enabled = action === "Enable";

            await convexClient.mutation(api.sessions.toggleAutoSave, {
              sessionId: sessionRecord._id,
              enabled,
            });

            await send(
              msg.from,
              `Auto-save ${enabled ? "enabled" : "disabled"}! ✅`,
            );

            // Back to main menu
            await (convexClient as any).mutation(api.sessions.updateMenuState, {
              sessionId: sessionRecord._id,
              menuState: MENU_STATES.MAIN_MENU,
            });
            return send(msg.from, MENUS.MAIN_MENU);
          } else {
            // Back to settings menu
            await (convexClient as any).mutation(api.sessions.updateMenuState, {
              sessionId: sessionRecord._id,
              menuState: MENU_STATES.AUTO_SAVE_SETTINGS,
            });
            const text = MENUS.AUTO_SAVE_SETTINGS.replace(
              "{{status}}",
              sessionRecord.autoSaveEnabled ? "✅ Enabled" : "❌ Disabled",
            );
            return send(msg.from, text);
          }
          break;

        default:
          if (currentState !== MENU_STATES.IDLE && !isNaN(choice)) {
            await send(
              msg.from,
              "Unknown command. Type $start to see the menu.",
            );
            await (convexClient as any).mutation(api.sessions.updateMenuState, {
              sessionId: sessionRecord._id,
              menuState: MENU_STATES.IDLE,
            });
          }
      }
    } catch (globalErr: any) {
      console.error("❌ CRITICAL ERROR in handleMessage:", globalErr);
    }
  };

  // client.on('message', handleMessage); // Removed to prevent double-processing
  client.on("message_create", handleMessage);

  client.on("disconnected", async (reason) => {
    console.log("Client was logged out", reason);
    await convexClient.mutation(api.sessions.updateStatus, {
      sessionId: session!._id,
      status: "DISCONNECTED",
    });
  });

  console.log("Initializing WhatsApp client...");
  await convexClient.mutation(api.sessions.updateStatus, {
    sessionId: session!._id,
    status: "INITIALIZING",
  });

  // Milestone 3: Setup Queues
  const clientsMap = new Map();
  clientsMap.set(session!._id, client);
  setupQueues(clientsMap);


  // Milestone 3: Background Retry Processor
  async function processRetries() {
    console.log("🔄 Running background retry processor...");
    try {
      const retries = await convexClient.query(api.retryQueue.getRetryQueue, {
        sessionId: session!._id,
      });

      for (const retry of retries) {
        // Simple backoff check: retry after 2^attempts * 1 minute
        const nextAttemptTime = retry.lastAttempt + Math.pow(2, retry.attempts) * 60000;
        if (Date.now() < nextAttemptTime) continue;

        if (retry.attempts >= 3) {
          console.log(`❌ Max retries reached for ${retry.waId} (${retry.retryType})`);
          await (convexClient as any).mutation(api.retryQueue.removeFromRetryQueue, {
            retryId: retry._id,
            sessionId: session!._id,
          });
          continue;
        }

        console.log(`🔄 Retrying ${retry.retryType} sync for ${retry.waId} (Attempt ${retry.attempts + 1})...`);
        
        try {
          if (retry.retryType === "phone") {
            const contact = await client.getContactById(retry.waId);
            const digitsOnly = contact.number.replace(/\D/g, "");
            const nameParts = (retry.metadata.name || contact.name || "WazBot Contact").split(" ");
            const firstName = nameParts[0] || "WazBot";
            const lastName = nameParts.slice(1).join(" ") || "Contact";

            await (client as any).saveOrEditAddressbookContact(
              digitsOnly,
              firstName,
              lastName,
              true,
            );
            
            console.log(`✅ Retry successful for ${retry.waId}`);
            await (convexClient as any).mutation(api.contacts.updateSyncStatus, {
              contactId: retry.contactId,
              phoneSyncStatus: "success",
            });
            await (convexClient as any).mutation(api.retryQueue.removeFromRetryQueue, {
              retryId: retry._id,
              sessionId: session!._id,
            });
          }
          // Convex retries are handled by the next call's attempt or here if needed
        } catch (err: any) {
          console.warn(`⚠️ Retry attempt ${retry.attempts + 1} failed: ${err.message}`);
          await (convexClient as any).mutation(api.retryQueue.addToRetryQueue, {
            contactId: retry.contactId,
            sessionId: session!._id,
            waId: retry.waId,
            retryType: retry.retryType,
            errorMessage: err.message,
          });
        }
      }
    } catch (err) {
      console.error("❌ Error in retry processor:", err);
    }
    
    // Run every 5 minutes
    setTimeout(processRetries, 5 * 60 * 1000);
  }

  // Start retry processor
  processRetries();

  client.initialize();
}

initializeWorker().catch((err) => {
  console.error("Worker failed to start:", err);
});
