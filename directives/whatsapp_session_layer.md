# WhatsApp Session Layer Design

This layer manages the lifecycle, authentication, and security of individual WhatsApp accounts within the SaaS.

## 1. Session Storage & Persistence

For a SaaS architecture, **`RemoteAuth`** is the recommended strategy. It allows session data to be stored centrally, enabling load balancing and failover across multiple worker nodes.

### Persistence Mechanism
1.  **Storage Engine**: Use a `RemoteWebCache` implementation (e.g., S3 or a custom Convex file store).
2.  **Session Key**: Every session is identified by `ownerId` (e.g., `user_123`).
3.  **Authentication Flow**:
    - The `Client` is initialized with `RemoteAuth({ clientId: ownerId, store: myStore })`.
    - On the first run, the `qr` event emits a string for the UI.
    - Upon successful scan, `wwebjs` creates a session bundle.
    - The `remote_session_saved` event triggers, and the bundle is pushed to the central store.

## 2. Reconnection & Lifecycle Handling

Headless browsers are prone to crashes or network timeouts. The session layer must be resilient.

- **Automatic Reconnection**: `whatsapp-web.js` handles basics, but the worker must monitor the `disconnected` event.
- **Heartbeat**: A periodic check on `client.getState()` (targeting `CONNECTED`).
- **Cold Boot Recovery**:
    - On worker startup, query Convex for all `ownerId`s with `status: "CONNECTED"`.
    - Iterate and call `client.initialize()` for each. 
    - `RemoteAuth` will automatically fetch the bundle from the store and attempt a headless login.

## 3. Post-Login Detection (Owner Number)

Once the client is `ready`, we must capture and persist the owner's own WhatsApp ID (WID) to enforce security rules.

### The `ready` Event Logic:
```javascript
client.on('ready', () => {
    // client.info contains information about the authenticated account
    const ownerWid = client.info.wid._serialized;
    const ownerNumber = client.info.wid.user;

    // Persist this to Convex so the Identity check doesn't need 
    // to query the WWebJS client for every message.
    updateOwnerDetails(ownerId, { ownerWid, ownerNumber });
});
```

## 4. Message Distinction & Enforcement

All inbound messages trigger the `message` event. The system must immediately branch logic based on the sender's identity.

### Identity Branching Logic
```javascript
client.on('message', async (msg) => {
    const session = await getSessionFromConvex(ownerId);
    
    // ownerWid was captured during the 'ready' event
    if (msg.from === session.ownerWid) {
        // BRANCH A: OWNER MODE
        handleOwnerCommand(msg);
    } else {
        // BRANCH B: CUSTOMER MODE
        logCustomerInteraction(msg);
        // NO automated response is sent here to avoid spamming customers
    }
});
```

### Why use `msg.from === ownerWid`?
- **Security**: Ensures that even if a customer types a menu command (e.g., "!settings"), nothing happens.
- **State Separation**: The `menuState` in Convex is only relevant for the `ownerId`. Customers do not have a `menuState`.

## 5. Security Architecture Summary

| Feature | Implementation | Purpose |
| :--- | :--- | :--- |
| **Persistence** | `RemoteAuth` + Cloud Store | Surfacer restarts/scaling |
| **Owner Identity** | `client.info.wid` | Trusted source for "Is Owner?" check |
| **Command Filter** | Initial condition in `message` event | Prevents customer access to bot menus |
| **Rate Limiting** | BullMQ Outbound Queue | Mimics human behavior / prevents bans |
