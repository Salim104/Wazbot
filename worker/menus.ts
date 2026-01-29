export const MENU_STATES = {
    IDLE: 'IDLE',
    MAIN_MENU: 'MAIN_MENU',
    STATUS_METRICS: 'STATUS_METRICS',
    AUTO_SAVE_SETTINGS: 'AUTO_SAVE_SETTINGS',
    BULK_SAVE_PROGRESS: 'BULK_SAVE_PROGRESS',
    ANNOUNCEMENT_DRAFT: 'ANNOUNCEMENT_DRAFT',
    ANNOUNCEMENT_CONFIRM: 'ANNOUNCEMENT_CONFIRM',
    LOGOUT_CONFIRM: 'LOGOUT_CONFIRM',
    BULK_SAVE_CONFIRM: 'BULK_SAVE_CONFIRM',
    AUTO_SAVE_CONFIRM: 'AUTO_SAVE_CONFIRM',
};

export const MENUS = {
    MAIN_MENU: `*WazBot Main Menu*
1. 📊 View Status & Progress
2. ⚙️ Auto-save Settings
3. 📥 Start Bulk Contact Save
4. 📣 Send Announcement
5. 🚪 Logout

_Reply with a number to choose._`,

    AUTO_SAVE_SETTINGS: `*Auto-save Settings*
Current: {{status}}

1. ✅ Enable Auto-save
2. ❌ Disable Auto-save
3. ⬅️ Back to Main Menu`,

    ANNOUNCEMENT_DRAFT: `*Draft Announcement*
Type the message you want to send to your saved contacts. 

_Or reply '0' to cancel._`,

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
};

export function getStatusProgress(metrics: any) {
    return `*WazBot Status*
✅ Saved: ${metrics.saved}
❓ Unsaved: ${metrics.unsaved}
📢 Sent: ${metrics.announcementsSent}

0. ⬅️ Back`;
}
