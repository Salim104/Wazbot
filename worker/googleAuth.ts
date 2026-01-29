import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export class GoogleAuthService {
    private oauth2Client: OAuth2Client;

    constructor() {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/callback';

        if (!clientId || !clientSecret) {
            console.warn('⚠️ GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing in .env');
        }

        this.oauth2Client = new google.auth.OAuth2(
            clientId,
            clientSecret,
            redirectUri
        );
    }

    /**
     * Generate the authorization URL for the user to visit
     */
    getAuthUrl() {
        return this.oauth2Client.generateAuthUrl({
            access_type: 'offline', // Required to get a refresh token
            scope: [
                'https://www.googleapis.com/auth/contacts',
                'https://www.googleapis.com/auth/userinfo.profile'
            ],
            prompt: 'consent' // Force show consent screen to ensure refresh token is provided
        });
    }

    /**
     * Exchange the authorization code for tokens
     */
    async getTokensFromCode(code: string) {
        const { tokens } = await this.oauth2Client.getToken(code);
        return tokens;
    }

    /**
     * Create or update a contact in Google Contacts
     */
    async syncContact(tokens: any, contact: { name?: string, phone: string }, existingGoogleId?: string) {
        this.oauth2Client.setCredentials(tokens);
        const people = google.people({ version: 'v1', auth: this.oauth2Client });

        const phoneResource = {
            value: contact.phone,
            type: 'mobile'
        };

        const nameResource = {
            givenName: contact.name || 'WazBot Contact',
        };

        try {
            if (existingGoogleId) {
                // Update existing
                // Note: resourceName is the full ID returned by Google
                const res = await people.people.updateContact({
                    resourceName: existingGoogleId,
                    updatePersonFields: 'names,phoneNumbers',
                    requestBody: {
                        etag: '', // Usually required for update, but we might need a fetch first
                        names: [nameResource],
                        phoneNumbers: [phoneResource]
                    }
                });
                return res.data;
            } else {
                // Create new
                const res = await people.people.createContact({
                    requestBody: {
                        names: [nameResource],
                        phoneNumbers: [phoneResource]
                    }
                });
                return res.data;
            }
        } catch (error: any) {
            console.error('❌ Google Contact Sync Error:', error.message);
            throw error;
        }
    }
}

export const googleAuthService = new GoogleAuthService();
