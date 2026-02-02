export const MENU_STATES = {
    IDLE: 'IDLE',
    MAIN_MENU: 'MAIN_MENU',
    STATUS_METRICS: 'STATUS_METRICS',
    AUTO_SAVE_SETTINGS: 'AUTO_SAVE_SETTINGS',
    BULK_SAVE_PROGRESS: 'BULK_SAVE_PROGRESS',
    ANNOUNCEMENT_DRAFT: 'ANNOUNCEMENT_DRAFT',
    ANNOUNCEMENT_PROGRESS: 'ANNOUNCEMENT_PROGRESS',
    ANNOUNCEMENT_CONFIRM: 'ANNOUNCEMENT_CONFIRM',
    LOGOUT_CONFIRM: 'LOGOUT_CONFIRM',
    BULK_SAVE_CONFIRM: 'BULK_SAVE_CONFIRM',
    AUTO_SAVE_CONFIRM: 'AUTO_SAVE_CONFIRM',

    PHONE_SYNC_SETTINGS: 'PHONE_SYNC_SETTINGS',
    PHONE_SYNC_CONFIRM: 'PHONE_SYNC_CONFIRM',
    RE_SYNC_CONFIRM: 'RE_SYNC_CONFIRM',
};

export const MENUS = {
    MAIN_MENU: `*WazBot Main Menu*
1. 📊 View Status & Progress
2. ⚙️ Auto-save Settings
3. 📥 Start Bulk Contact Save
4. 📣 Send Announcement
5. 🚪 Logout
6. 📱 Phone Contact Sync (Native)
7. 🔄 Re-sync All Contacts

_Reply with a number to choose._`,

    AUTO_SAVE_SETTINGS: `*Auto-save Settings*
Current: {{status}}

1. ✅ Enable Auto-save
2. ❌ Disable Auto-save
3. ⬅️ Back to Main Menu`,

    ANNOUNCEMENT_DRAFT: `*📣 Send Announcement (Step 1)*
Type the message you want to send to all your saved contacts. 

_Or reply '0' to cancel._`,

    ANNOUNCEMENT_PROGRESS: `*📣 Announcement in Progress*
Sending messages...

1. ⏸️ Pause
2. ❌ Cancel`,

    ANNOUNCEMENT_CONFIRM: `*Confirm Announcement*
Your message:
"{{message}}"

1. 🚀 Send Now
2. ✍️ Edit Message
3. ❌ Cancel`,

    LOGOUT_CONFIRM: `*🚪 Confirm Logout?*
This will disconnect WazBot from your WhatsApp. You will need to scan the QR code again to reconnect.

1. ✅ Yes, Logout
2. ❌ Cancel`,

    BULK_SAVE_CONFIRM: `*📥 Confirm Bulk Save?*
WazBot will scan ALL your chats and save any unlisted numbers. This might take a few minutes.

1. ✅ Start Saving
2. ❌ Cancel`,

    AUTO_SAVE_CONFIRM: `*⚙️ Confirm Auto-save {{action}}?*
New contacts who message you will be {{result}}.

1. ✅ Confirm
2. ❌ Cancel`,


    PHONE_SYNC_SETTINGS: `*📱 Native Phone Sync*
Directly save contacts to your phone's address book.
Current Status: {{status}}

1. ✅ Enable
2. ❌ Disable
3. 🔙 Back`,

    PHONE_SYNC_CONFIRM: `*⚠️ Confirm Phone Sync {{action}}?*
New contacts will be {{result}} to your phone's physical address book.

1. ✅ Confirm
2. ❌ Cancel`,

    RE_SYNC_CONFIRM: `*🔄 Confirm Re-sync All Contacts?*
This will attempt to sync ALL your already-saved contacts to Google (if connected) and your Phone's Address Book.

1. ✅ Start Re-sync
2. ❌ Cancel`,
};

export function getStatusProgress(metrics: any) {
    return `*WazBot Status*
✅ Saved: ${metrics.saved}
❓ Unsaved: ${metrics.unsaved}
📢 Announcements Sent: ${metrics.announcementsSent}

*Sync Health:*
💾 Convex Failures: ${metrics.convexSyncFailed || 0}
📱 Phone Sync Failures: ${metrics.phoneSyncFailed || 0}
🔄 Pending Retries: ${metrics.pendingRetries || 0}

0. ⬅️ Back`;
}
