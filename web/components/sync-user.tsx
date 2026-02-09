"use client";

import { useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useEffect, useState } from "react";

export function SyncUser() {
  const { user, isLoaded } = useUser();
  const createUser = useMutation(api.users.create);
  const createSession = useMutation(api.sessions.create);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    async function sync() {
      if (isLoaded && user && !synced) {
        try {
          const email = user.primaryEmailAddress?.emailAddress || "";
          const userId = await createUser({ clerkId: user.id, email });
          await createSession({ ownerId: userId });
          setSynced(true);
        } catch (error) {
          console.error("Failed to sync user:", error);
        }
      }
    }
    sync();
  }, [isLoaded, user, synced, createUser, createSession]);

  return null;
}
