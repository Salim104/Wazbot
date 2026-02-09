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
    PHONE_SYNC_CONFIRM: 'PHONE_SYNC_CONFIRM',
    EXCLUSION_MENU: 'EXCLUSION_MENU',
    EXCLUSION_ADD: 'EXCLUSION_ADD',
    EXCLUSION_REMOVE: 'EXCLUSION_REMOVE',
};

export const MENUS = {
    MAIN_MENU: `*WazBot Main Menu*
1. 📊 View Status & Progress
2. ⚙️ Auto-save Settings
3. 📥 Start Bulk Contact Save
4. 📣 Send Announcement
5. 🚫 Manage Exclusions
6. 🚪 Logout

_Reply with a number (1 to 6) to choose._`,

    SYNC_SETTINGS: `*⚙️ Sync Settings*
1. Auto-save: {{autoSave}}
2. Phone Sync: {{phoneSync}}

1. 📥 Toggle Auto-save
2. 📱 Toggle Phone Sync
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

    PHONE_SYNC_CONFIRM: `*📱 Confirm Phone Sync {{action}}?*
WazBot will {{result}} your phone address book when saving contacts.

1. ✅ Confirm
2. ❌ Cancel`,

    EXCLUSION_MENU: `*🚫 Exclusion List*
Excluded contacts will NOT receive announcements.

Currently Excluded: {{count}}

1. 👀 View Excluded Numbers
2. ➕ Add Number to Exclusion
3. ➖ Remove Number from Exclusion
4. ⬅️ Back to Main Menu`,

    EXCLUSION_ADD: `*➕ Add to Exclusion List*
Type the phone number to exclude (with country code).

*Example:* 27605229784

_Or reply '0' to cancel._`,

    EXCLUSION_REMOVE: `*➖ Remove from Exclusion List*
{{list}}

_Type the number to remove, or '0' to cancel._`,

    EXCLUSION_VIEW: `*👀 Excluded Numbers*
{{list}}

0. ⬅️ Back`,
};

export function getStatusProgress(metrics: any) {
    return `*WazBot Status*
✅ Saved: ${metrics.saved}
❓ Unsaved: ${metrics.unsaved}
📢 Announcements Sent: ${metrics.announcementsSent}

*Sync Health:*
📱 Phone Sync Failures: ${metrics.phoneSyncFailed || 0}
🔄 Pending Retries: ${metrics.pendingRetries || 0}

0. ⬅️ Back`;
}
