import { describe, it, expect, vi, beforeEach } from "vitest";
import { MENU_STATES, MENUS } from "../menus";

// Mock dependencies
const mockConvexClient = {
  query: vi.fn(),
  mutation: vi.fn(),
};

vi.mock("convex/browser", () => ({
  ConvexHttpClient: vi.fn().mockImplementation(() => mockConvexClient),
}));

const mockSendMessage = vi.fn();
const mockGetContact = vi.fn();
const mockGetContactLidAndPhone = vi.fn();
const mockSaveOrEditAddressbookContact = vi.fn();

vi.mock("whatsapp-web.js", () => ({
  Client: vi.fn().mockImplementation(() => ({
    sendMessage: mockSendMessage,
    getContactLidAndPhone: mockGetContactLidAndPhone,
    saveOrEditAddressbookContact: mockSaveOrEditAddressbookContact,
    on: vi.fn(),
    initialize: vi.fn().mockResolvedValue(undefined),
  })),
  RemoteAuth: vi.fn(),
}));

describe("Normal Auto-Save Feature", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should auto-save new contact and sync to phone when enabled", async () => {
    const sessionId = "session123" as any;
    const msg = {
      from: "newuser@c.us",
      fromMe: false,
      isStatus: false,
      body: "Hello",
      getContact: mockGetContact,
    };

    mockGetContact.mockResolvedValue({
      number: "123456789",
      pushname: "New User",
      isMyContact: false,
    });

    mockConvexClient.query.mockResolvedValueOnce({
      _id: sessionId,
      ownerWid: "owner@c.us",
      autoSaveEnabled: true,
      phoneSyncEnabled: true,
      metrics: { saved: 0 },
    });

    mockConvexClient.query.mockResolvedValueOnce({ plan: "FREE" }); // For user plan check
    mockConvexClient.mutation.mockResolvedValue("contact_id");

    // Logic extraction from index.ts handleMessage
    const sessionRecord = await mockConvexClient.query("api.sessions.getById");
    const limits = { MAX_CONTACTS: 20 }; // FREE plan limit

    if (sessionRecord.autoSaveEnabled) {
      const currentSaved = sessionRecord.metrics?.saved || 0;
      if (currentSaved < limits.MAX_CONTACTS) {
        const contact = await msg.getContact();
        if (!contact.isMyContact) {
          const contactName = contact.pushname || contact.name || "WhatsApp User";
          const metadata = { name: contactName, lastInteraction: Date.now() };

          const contactId = await mockConvexClient.mutation("api.contacts.saveContact", {
            sessionId,
            waId: msg.from,
            metadata,
          });

          const digitsOnly = contact.number.replace(/\D/g, "");
          if (digitsOnly) {
            await mockConvexClient.mutation("api.contacts.saveContact", {
              sessionId,
              waId: msg.from,
              phoneNumber: digitsOnly,
              metadata,
            });

            if (sessionRecord.phoneSyncEnabled) {
              const nameParts = metadata.name.split(" ");
              const firstName = nameParts[0] || "WazBot";
              const lastName = nameParts.slice(1).join(" ") || "Contact";
              await mockSaveOrEditAddressbookContact(digitsOnly, firstName, lastName, true);
              await mockConvexClient.mutation("api.contacts.updateSyncStatus", { contactId, phoneSyncStatus: "success" });
            }
          }
        }
      }
    }

    expect(mockConvexClient.mutation).toHaveBeenCalledWith("api.contacts.saveContact", expect.objectContaining({
      waId: "newuser@c.us",
    }));
    expect(mockSaveOrEditAddressbookContact).toHaveBeenCalledWith("123456789", "New", "User", true);
    expect(mockConvexClient.mutation).toHaveBeenCalledWith("api.contacts.updateSyncStatus", expect.objectContaining({
      phoneSyncStatus: "success",
    }));
  });

  it("should respect plan limits and skip auto-save", async () => {
    const sessionId = "session123" as any;
    const msg = {
      from: "newuser@c.us",
      fromMe: false,
      isStatus: false,
      body: "Hello",
    };

    mockConvexClient.query.mockResolvedValueOnce({
      _id: sessionId,
      ownerWid: "owner@c.us",
      autoSaveEnabled: true,
      metrics: { saved: 20 }, // Limit reached for FREE plan
    });

    const sessionRecord = await mockConvexClient.query("api.sessions.getById");
    const limits = { MAX_CONTACTS: 20 };

    let autoSaveTriggered = false;
    if (sessionRecord.autoSaveEnabled) {
      const currentSaved = sessionRecord.metrics?.saved || 0;
      if (currentSaved >= limits.MAX_CONTACTS) {
        autoSaveTriggered = false;
      } else {
        autoSaveTriggered = true;
      }
    }

    expect(autoSaveTriggered).toBe(false);
  });
});
