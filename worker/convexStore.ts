import fs from 'fs';
import path from 'path';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api';

export class ConvexStore {
    private client: ConvexHttpClient;
    private userId: string; // The ownerId in Convex

    constructor(convexUrl: string, userId: string) {
        this.client = new ConvexHttpClient(convexUrl);
        this.userId = userId;
    }

    async sessionExists(options: { session: string }) {
        const session = await this.client.query(api.sessions.getByOwner, { ownerId: this.userId as any });
        return !!session?.storageId;
    }

    async save(options: { session: string }) {
        try {
            // The library creates the zip in the root folder with the session name
            const sessionPath = path.join(process.cwd(), `${options.session}.zip`);
            
            if (!fs.existsSync(sessionPath)) {
                // Fallback: check if it's in .wwebjs_auth
                const fallbackPath = path.join(process.cwd(), '.wwebjs_auth', `${options.session}.zip`);
                if (fs.existsSync(fallbackPath)) {
                    fs.copyFileSync(fallbackPath, sessionPath);
                } else {
                    return;
                }
            }

            console.log(`📦 Bundling session ${options.session}...`);
            const fileData = fs.readFileSync(sessionPath);
            
            // 1. Generate upload URL
            const uploadUrl = await this.client.mutation(api.storage.generateUploadUrl);
            
            // 2. Upload file
            const response = await fetch(uploadUrl, {
                method: 'POST',
                body: fileData,
                headers: { 'Content-Type': 'application/zip' }
            });
            
            const { storageId } = await response.json() as { storageId: string };

            // 3. Update session with storageId
            await this.client.mutation(api.sessions.updateStorageId as any, { 
                ownerId: this.userId as any,
                storageId 
            });
            console.log('☁️  Session synced to cloud storage.');
        } catch (error: any) {
            console.warn(`⚠️  Failed to sync session to cloud: ${error.message}`);
        }
    }

    async extract(options: { session: string }) {
        try {
            const session = await this.client.query(api.sessions.getByOwner, { ownerId: this.userId as any });
            if (!session?.storageId) return;

            // 1. Get file URL
            const fileUrl = await this.client.query(api.storage.getFileUrl, { storageId: session.storageId });
            if (!fileUrl) return;

            // 2. Download file
            const response = await fetch(fileUrl);
            const buffer = await response.arrayBuffer();

            // 3. Write zip file to root (where the library expects it)
            const sessionPath = path.join(process.cwd(), `${options.session}.zip`);
            fs.writeFileSync(sessionPath, Buffer.from(buffer));
            console.log('✅ Cloud session downloaded to root.');
        } catch (error: any) {
            console.warn(`⚠️  Failed to download session from cloud: ${error.message}`);
        }
    }

    async delete(options: { session: string }) {
        try {
            // Optional: Could delete from Convex storage too
            await this.client.mutation(api.sessions.updateStorageId as any, { 
                ownerId: this.userId as any,
                storageId: undefined 
            });
            
            // Remove local zip
            const sessionPath = path.join(process.cwd(), `${options.session}.zip`);
            if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
        } catch (error: any) {
            console.warn(`⚠️  Failed to delete cloud session: ${error.message}`);
        }
    }
}
