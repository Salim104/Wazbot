---
name: whatsapp-web-skill
description: Comprehensive guide and reference for whatsapp-web.js. Use when building WhatsApp automation, handling messages, media, sessions, and integrating with SaaS architectures. Provides core API details, authentication strategies, and safety considerations.
---

# Whatsapp Web Skill

A developer reference for building automations with [whatsapp-web.js](https://docs.wwebjs.dev/), a Node.js library that connects to WhatsApp Web via Puppeteer.

## Overview

`whatsapp-web.js` operates by launching a headless browser (Puppeteer) and injecting code into the WhatsApp Web application. It interacts with the internal functions of the web app to provide a high-level API for developers.

- **Source Docs**: [Documentation](https://docs.wwebjs.dev/), [Guide](https://wwebjs.2hoch1.dev/guide)
- **Mechanism**: Managed browser instance using Puppeteer.
- **Environment**: Node.js v18+.

## Core Capabilities

- **Messaging**: Send/receive text, media, locations, contacts, and buttons.
- **Media**: Handle images, videos, audio, and documents (using `MessageMedia`).
- **Sessions**: Persistence and authentication management.
- **Groups**: Create groups, manage participants, and listen for activity.
- **Status/Stories**: Read and post status updates.
- **Business Features**: Support for labels, product catalogs, and customer notes.

## Authentication & Persistence

To avoid scanning the QR code on every restart, use an `authStrategy`.

### LocalAuth
Stores session data locally in a folder (default: `.wwebjs_auth`).
```javascript
const { Client, LocalAuth } = require('whatsapp-web.js');
const client = new Client({
    authStrategy: new LocalAuth()
});
```

### RemoteAuth
Stores session data in a remote database or store (e.g., MongoDB, AWS S3). Requires a `RemoteWebCache`.
```javascript
const { Client, RemoteAuth } = require('whatsapp-web.js');
const client = new Client({
    authStrategy: new RemoteAuth({
        store: store,
        backupSyncIntervalMs: 300000
    })
});
```

## Important Events & APIs

### Key Events
- `qr`: Triggered when a QR code is received. Scan this to log in.
- `ready`: Triggered when the client is fully logged in and ready.
- `authenticated`: Triggered when the session is correctly authenticated.
- `auth_failure`: Triggered when authentication fails.
- `message`: Triggered for every incoming message.
- `message_create`: Triggered for every message created (including yours).
- `disconnected`: Triggered when the client is logged out.

### Primary Objects
- **Client**: The main entry point. Use `client.initialize()` to start.
- **Message**: Represents a message. Properties: `body`, `from`, `to`, `fromMe`, `hasMedia`, `timestamp`.
- **Chat**: Represents a conversation. Methods: `sendMessage()`, `archive()`, `delete()`.
- **Contact**: Represents a user or group. Properties: `id`, `name`, `number`, `isGroup`.

## SaaS Integration Guide

### Multi-Session Management
In a SaaS environment where multiple users/accounts are managed:
1.  **Client Factory**: Instantiation of `Client` instances for each user.
2.  **ClientId**: Use the `clientId` option in `LocalAuth` to separate session files.
    ```javascript
    new LocalAuth({ clientId: "user_123" })
    ```
3.  **Persistence Store**: Use `RemoteAuth` to sync sessions across distributed containers or servers.

### Handling Messages
- **Sender vs Owner**: 
    - `message.fromMe === true`: Message was sent by the account owner.
    - `message.fromMe === false`: Message was received from someone else.
    - Use `message.author` (in groups) to see who specifically sent a message.
- **Responding**:
    - Use `message.reply('text')` to quote the original message.
    - Use `client.sendMessage(chatId, 'text')` for a standard response.

### Recommended Data to Store
- `wid`: The unique WhatsApp ID (`[number]@c.us`).
- `sessionStatus`: `initialising`, `ready`, `disconnected`.
- `lastSeen`: Timestamp of the last interaction.
- `authenticationMeta`: For `RemoteAuth` sync status.

## Limitations & Safety

> [!WARNING]
> WhatsApp does not allow bots or unofficial clients. Using this library carries a **risk of being blocked**.

- **Rate Limiting**: Avoid sending too many messages in a short burst. Mimic human behavior with delays.
- **Safety**: Do not spam. Respond primarily to inbound messages rather than initiating outbound cold-messages.
- **Resource Usage**: Each `Client` instance starts a Puppeteer browser. This is memory-intensive. For many sessions, consider resource-efficient strategies or clustering.
- **Video/GIF Caveat**: Some media types (videos/gifs) may require a full Chrome installation instead of the default Chromium.

---
*Reference: [wwebjs.2hoch1.dev](https://wwebjs.2hoch1.dev/), [docs.wwebjs.dev](https://docs.wwebjs.dev/)*
