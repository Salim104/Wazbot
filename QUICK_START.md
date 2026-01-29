# 🚀 Wazbot Quick Start Guide

## ✅ Current Status

Your Convex deployment is **ACTIVE** and ready to use!

- **Deployment URL**: https://dashing-shrimp-122.convex.cloud
- **Dashboard**: https://dashboard.convex.dev/d/dashing-shrimp-122
- **Team Dashboard**: https://dashboard.convex.dev/t/sarimo-shabani/wazbot
- **Generated Types**: ✅ Ready in `convex/_generated/`
- **Environment**: ✅ `.env` configured with deployment URL

## 🎯 Next Step: Create Your Test User

You have **two options** to create a test user:

### Option 1: Using Convex Dashboard (Recommended - Easiest)

1. Open your dashboard: https://dashboard.convex.dev/d/dashing-shrimp-122

2. Click on the **"Data"** tab in the left sidebar

3. Click on the **"users"** table

4. Click the **"+ Add Document"** button (top right)

5. Enter this JSON:

   ```json
   {
     "clerkId": "test_owner_001",
     "email": "owner@wazbot.local"
   }
   ```

6. Click **"Add"**

7. Copy the generated `_id` (it will look like: `kg21234567890abcdef`)

8. Update your `.env` file:
   ```bash
   OWNER_ID=kg21234567890abcdef
   ```
   (Replace with your actual ID)

### Option 2: Using Convex Functions Tab

1. Open your dashboard: https://dashboard.convex.dev/d/dashing-shrimp-122

2. Click on the **"Functions"** tab

3. Find `users:create` in the list

4. Click on it to open the function runner

5. In the arguments box, enter:

   ```json
   {
     "clerkId": "test_owner_001",
     "email": "owner@wazbot.local"
   }
   ```

6. Click **"Run"**

7. Copy the returned user ID from the result

8. Update your `.env` file with the ID

## 📝 After Creating the User

Once you have the user ID in your `.env` file, create a session:

### Create Session via Dashboard

1. Still in the **Functions** tab

2. Find and click `sessions:create`

3. Enter:

   ```json
   {
     "ownerId": "YOUR_USER_ID_HERE"
   }
   ```

   (Use the actual ID you copied)

4. Click **"Run"**

5. You should see a session ID returned

## 🤖 Start the WhatsApp Worker

Now you're ready to start the worker!

```bash
# In your terminal
npm run worker
```

Or:

```bash
npx tsx worker/index.ts
```

### What to Expect

1. The worker will connect to Convex
2. Initialize WhatsApp Web client
3. Display a QR code in the terminal
4. Wait for you to scan it with WhatsApp

### Scan the QR Code

1. Open WhatsApp on your phone
2. Go to **Settings** → **Linked Devices**
3. Tap **"Link a Device"**
4. Scan the QR code from the terminal
5. Wait for the `READY` message

## ✅ Verification

Once connected, you should see:

**In Terminal:**

```
AUTHENTICATED
READY
```

**In Convex Dashboard (Data tab → sessions table):**

- Status changed to `CONNECTED`
- `ownerWid` and `ownerNumber` populated
- QR code cleared

## 🧪 Test the Bot

Send a message from the owner's WhatsApp number:

```
$start
```

You should receive a reply:

```
Welcome to WazBot! Menu coming soon...
```

## 📊 Check Your Setup

Run the verification script:

```bash
npm run check
```

This will show you what's configured and what's missing.

## 🎉 You're All Set!

Once everything is running:

- ✅ Convex deployment active
- ✅ User created in database
- ✅ Session created
- ✅ Worker connected to WhatsApp
- ✅ Bot responding to owner commands

## 📚 Next Steps

- Read the architecture docs in `directives/`
- Explore the 3-layer system in `CLAUDE.md`
- Check out `whatsapp-web-skill.md` for WhatsApp API reference
- Build your own menu commands!

## 🆘 Troubleshooting

**"AUTHENTICATION FAILURE"**

- Delete `.wwebjs_auth/` folder
- Restart the worker to get a fresh QR code

**"OWNER_ID not found"**

- Make sure you created the user in Convex
- Verify the ID format in `.env` is correct

**Worker won't start**

- Check that `CONVEX_URL` is set in `.env`
- Make sure `npx convex dev` ran successfully
- Verify `convex/_generated/` folder exists

---

**Need help?** Check the detailed `SETUP.md` guide or the architecture docs in `directives/`
