# 🤖 Wazbot - WhatsApp Automation SaaS

A multi-tenant WhatsApp automation platform built with a 3-layer architecture that separates AI orchestration from deterministic execution for maximum reliability.

## 🏗️ Architecture

Wazbot uses a unique **3-layer architecture**:

```
┌─────────────────────────────────────────────────┐
│  Layer 1: Directives (What to do)              │
│  - SOPs in Markdown                             │
│  - Goals, inputs, tools, outputs, edge cases   │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  Layer 2: Orchestration (Decision making)      │
│  - AI Agent for intelligent routing            │
│  - Error handling & self-improvement           │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  Layer 3: Execution (Doing the work)           │
│  - Deterministic Python/Node.js scripts        │
│  - WhatsApp automation worker                  │
│  - API integrations                            │
└─────────────────────────────────────────────────┘
```

**Why this works:** By pushing complexity into deterministic code, we avoid the compound error problem of AI-only solutions. The AI focuses on decision-making, while reliable scripts handle execution.

## 🚀 Quick Start

### Prerequisites

- Node.js v18+
- A Convex account (free at [convex.dev](https://convex.dev))
- WhatsApp account for testing

### Installation

```bash
# 1. Install dependencies
npm install

# 2. Check setup status
npm run check

# 3. Initialize Convex (interactive)
npm run dev
```

Follow the prompts to:

- Log in to Convex
- Create a new project named `wazbot`
- Set up your development deployment

### Configuration

After `npx convex dev` completes, update `.env`:

```bash
CONVEX_URL=https://your-deployment.convex.cloud
CONVEX_DEPLOYMENT=dev:your-deployment
OWNER_ID=  # Get this after creating a user in Convex
```

**📖 For detailed setup instructions, see [SETUP.md](./SETUP.md)**

## ✨ Key Features
- **Auto Contact Save**: Automatically captures and saves new contact numbers from incoming messages.
- **Bulk Save**: Scans all active chats and groups to harvest contacts efficiently.
- **Native Phone Sync**: Directly synchronizes contacts to your physical phone's address book.
- **Announcement System**: Send broadcast messages to saved contacts efficiently.
- **Sync & Retry Logic**: Robust background processing with exponential backoff for failed sync operations.
- **Real-time Metrics**: Detailed dashboard showing sync health and announcement progress.
des and metrics
- **Multi-tenant Ready**: Each business owner gets isolated WhatsApp sessions
- **Self-Annealing**: System learns from errors and improves directives automatically

## 📦 Tech Stack

| Layer         | Technology                     |
| ------------- | ------------------------------ |
| **Database**  | Convex (real-time, serverless) |
| **Queue**     | BullMQ + Redis                 |
| **WhatsApp**  | whatsapp-web.js + Puppeteer    |
| **Worker**    | Node.js + TypeScript           |
| **Dashboard** | Next.js (planned)              |
| **Auth**      | Clerk (planned)                |

## 🗂️ Project Structure

```
wazbot/
├── convex/              # Convex serverless functions
│   ├── schema.ts        # Database schema
│   ├── sessions.ts      # Session management
│   ├── users.ts         # User operations
│   └── storage.ts       # File storage for WhatsApp sessions
├── worker/              # WhatsApp worker process
│   ├── index.ts         # Main worker entry point
│   └── convexStore.ts   # Custom RemoteAuth store
├── directives/          # SOPs and architecture docs
│   ├── whatsapp_saas_architecture.md
│   └── whatsapp_session_layer.md
├── execution/           # Deterministic scripts (Python)
├── .env                 # Environment configuration
├── SETUP.md            # Detailed setup guide
└── check-setup.js      # Setup verification script
```

## 🔐 Security Architecture

The system enforces strict identity verification:

1. **Owner Detection**: Captures `ownerWid` during WhatsApp authentication
2. **Message Filtering**: Every message checks `msg.from === ownerWid`
3. **Branch Logic**:
   - **Owner messages** → Interactive menu & bot commands
   - **Customer messages** → Silent logging only

This prevents customers from accidentally (or maliciously) triggering owner commands.

## 🛠️ Development Workflow

Run these in separate terminals:

```bash
# Terminal 1: Convex development (auto-reloads on changes)
npm run dev

# Terminal 2: WhatsApp worker
npm run worker
```

Edit files in `convex/` or `worker/` and they'll update automatically (Convex hot-reloads, worker needs manual restart).

## 🧪 Testing

Once running, send `$start` from the owner's WhatsApp number to test the bot.

Check the Convex Dashboard to see:

- Session status (`CONNECTED`, `DISCONNECTED`, etc.)
- Message logs
- Contact database
- Metrics

## 📚 Documentation

- **[SETUP.md](./SETUP.md)** - Detailed setup and troubleshooting
- **[CLAUDE.md](./CLAUDE.md)** - 3-layer architecture philosophy
- **[directives/](./directives/)** - System architecture and SOPs
- **[whatsapp-web-skill.md](./whatsapp-web-skill.md)** - whatsapp-web.js reference

## 🎨 Design Philosophy

**Self-Annealing System**: When errors occur, the system:

1. Diagnoses the issue
2. Fixes the underlying tool/script
3. Tests the fix
4. Updates directives with learnings
5. Emerges stronger

This creates a **continuously improving** system where failures become opportunities for growth.

## 🔄 Roadmap

- [x] Core 3-layer architecture
- [x] WhatsApp session management
- [x] Owner identity verification
- [x] Convex integration
- [ ] Next.js management dashboard
- [ ] Clerk authentication
- [ ] BullMQ job queue integration
- [ ] Contact auto-save feature
- [ ] Bulk announcement system
- [ ] Multi-tenant scaling
- [ ] Production deployment guide

## 🤝 Contributing

This project follows a unique development methodology:

1. Update directives when you learn something new
2. Push complexity into deterministic scripts
3. Let AI orchestrate, not execute
4. Test thoroughly before committing

## 📄 License

[Add your license here]

## 💬 Support

For issues, questions, or contributions, please [create an issue](../../issues).

---

**Built with the belief that AI + deterministic code > AI alone.**
