"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Activity } from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/connect");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <Activity className="h-10 w-10 animate-spin text-cyan-500" />
    </div>
  );
}
