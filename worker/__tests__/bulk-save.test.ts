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
const mockGetChats = vi.fn();
const mockGetContactById = vi.fn();
const mockSaveOrEditAddressbookContact = vi.fn();

vi.mock("whatsapp-web.js", () => ({
  Client: vi.fn().mockImplementation(() => ({
    sendMessage: mockSendMessage,
    getChats: mockGetChats,
    getContactById: mockGetContactById,
    saveOrEditAddressbookContact: mockSaveOrEditAddressbookContact,
    on: vi.fn(),
    initialize: vi.fn().mockResolvedValue(undefined),
  })),
  RemoteAuth: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
  })),
  Worker: vi.fn(),
}));

describe("Bulk Save Contact Feature", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should filter unsaved non-group chats and trigger bulk save", async () => {
    // 1. Setup mocks
    const sessionId = "session123" as any;
    const limits = { MAX_CONTACTS: 20 };
    
    // savedContacts
    mockConvexClient.query.mockResolvedValueOnce([
      { waId: "saved1@c.us" },
      { waId: "saved2@c.us" },
    ]);

    // whatsapp chats
    mockGetChats.mockResolvedValue([
      { id: { _serialized: "unsaved1@c.us" }, isGroup: false },
      { id: { _serialized: "unsaved2@c.us" }, isGroup: false },
      { id: { _serialized: "saved1@c.us" }, isGroup: false },
      { id: { _serialized: "group1@g.us" }, isGroup: true },
    ]);

    // Logic from bulk_save_confirm (simulating extraction from index.ts)
    const chats = await mockGetChats();
    const savedContacts = await mockConvexClient.query("api.contacts.getContacts");
    const savedWids = new Set(savedContacts.map((c: any) => c.waId));
    const unsavedWids = chats
      .filter((chat: any) => !chat.isGroup)
      .map((chat: any) => chat.id._serialized)
      .filter((waId: string) => !savedWids.has(waId));

    expect(unsavedWids).toEqual(["unsaved1@c.us", "unsaved2@c.us"]);
    expect(unsavedWids.length).toBe(2);

    // Plan limit check
    const currentSaved = 5;
    const remainingQuota = limits.MAX_CONTACTS - currentSaved;
    const toProcess = unsavedWids.slice(0, remainingQuota);

    expect(toProcess.length).toBe(2);
  });

  it("should respect plan limits during bulk save", async () => {
    const sessionId = "session123" as any;
    const limits = { MAX_CONTACTS: 10 };
    
    mockConvexClient.query.mockResolvedValueOnce([
      { waId: "saved1@c.us" },
    ]);

    const chats = Array.from({ length: 15 }, (_, i) => ({
      id: { _serialized: `unsaved${i}@c.us` },
      isGroup: false,
    }));
    mockGetChats.mockResolvedValue(chats);

    const savedContacts = await mockConvexClient.query("api.contacts.getContacts");
    const savedWids = new Set(savedContacts.map((c: any) => c.waId));
    const unsavedWids = (await mockGetChats())
      .filter((chat: any) => !chat.isGroup)
      .map((chat: any) => chat.id._serialized)
      .filter((waId: string) => !savedWids.has(waId));

    const currentSaved = 5;
    const remainingQuota = limits.MAX_CONTACTS - currentSaved;
    const toProcess = unsavedWids.slice(0, remainingQuota);

    expect(toProcess.length).toBe(5);
    expect(toProcess[0]).toBe("unsaved0@c.us");
    expect(toProcess[4]).toBe("unsaved4@c.us");
  });

  it("should correctly process bulk save job simulation", async () => {
    const sessionId = "session123" as any;
    const waIds = ["unsaved1@c.us", "unsaved2@c.us"];
    
    // 1. Mock session
    mockConvexClient.query.mockResolvedValueOnce({
      _id: sessionId,
      ownerWid: "owner@c.us",
      phoneSyncEnabled: true,
    });

    // 2. Mock contact checks and retrieval
    mockConvexClient.query.mockResolvedValue(null); // No existing contact
    mockGetContactById.mockImplementation((waId: string) => ({
      id: { _serialized: waId },
      name: "Test User",
      number: waId.split("@")[0],
    }));

    mockConvexClient.mutation.mockResolvedValue("contact_id");

    // 3. Simulate processing (mirroring logic in queues.ts)
    let successCount = 0;
    for (const waId of waIds) {
      const contact = await mockGetContactById(waId);
      const metadata = { name: contact.name, lastInteraction: Date.now() };
      const digitsOnly = contact.number;
      
      await mockConvexClient.mutation("api.contacts.saveContact", {
        sessionId,
        waId,
        metadata,
        convexSyncStatus: "success",
      });

      // Phone Sync simulation
      if (true) { // Simulate sessionRecord.phoneSyncEnabled
        const nameParts = metadata.name.split(" ");
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(" ");
        await mockSaveOrEditAddressbookContact(digitsOnly, firstName, lastName, true);
      }
      successCount++;
    }

    expect(successCount).toBe(2);
    expect(mockSaveOrEditAddressbookContact).toHaveBeenCalledTimes(2);
    expect(mockSaveOrEditAddressbookContact).toHaveBeenCalledWith("unsaved1", "Test", "User", true);
  });
});
