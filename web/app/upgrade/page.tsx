"use client";

import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  CheckCircle2, 
  ArrowLeft, 
  CreditCard, 
  Banknote, 
  ShieldCheck, 
  Zap,
  Info
} from "lucide-react";
import Link from "next/link";

export default function UpgradePage() {
  const { user } = useUser();
  const dbUser = useQuery(api.users.getByClerkId, 
    user?.id ? { clerkId: user.id } : "skip"
  );

  const isPro = dbUser?.plan === "PRO";

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 p-6 selection:bg-blue-500/30">
      <div className="fixed inset-0 -z-10 bg-slate-950">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,#3b82f611,transparent)]" />
      </div>

      <header className="max-w-4xl mx-auto w-full mb-12">
        <Link href="/dashboard">
          <Button variant="ghost" className="text-slate-400 hover:text-white px-0">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
          </Button>
        </Link>
      </header>

      <main className="max-w-4xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
        <div className="space-y-8">
          <div className="space-y-4">
            <div className="bg-blue-600/10 p-3 rounded-2xl w-fit">
              <Zap className="h-6 w-6 text-blue-500 fill-blue-500" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-white italic">Upgrade to WazBot Pro</h1>
            <p className="text-slate-400 text-lg leading-relaxed">
              Unlock the full power of WhatsApp automation. Sync up to 500 contacts and send priority announcements.
            </p>
          </div>

          <ul className="space-y-4">
            {[
              "500+ Syncable Contacts (vs 20)",
              "20 Daily Announcements (vs 2)",
              "Priority Phone Address Book Sync",
              "Advanced Analytics & Logs",
              "Priority Whatsapp API Support"
            ].map((feature, i) => (
              <li key={i} className="flex items-center gap-3 text-slate-300">
                <CheckCircle2 className="h-5 w-5 text-blue-500 shrink-0" />
                <span className="font-medium">{feature}</span>
              </li>
            ))}
          </ul>

          <div className="p-4 rounded-2xl bg-slate-900 border border-white/5 space-y-2">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <ShieldCheck className="h-4 w-4 text-green-500" /> Secure Manual Activation
            </div>
            <p className="text-xs text-slate-500">
              We use manual payment verification to keep our service fee low (only R150/mo). No automated recurring charges.
            </p>
          </div>
        </div>

        <Card className="bg-slate-900 border-white/5 shadow-2xl overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-indigo-500/5" />
          
          <CardHeader className="p-8 pb-4 text-center">
            <Badge className="bg-blue-600 text-white px-4 py-1 mb-4 mx-auto w-fit uppercase tracking-widest text-[10px]">Manual Payment (EFT)</Badge>
            <CardTitle className="text-4xl font-black text-white">R150</CardTitle>
            <CardDescription className="text-slate-400">per month / per account</CardDescription>
          </CardHeader>

          <CardContent className="p-8 pt-4 space-y-6">
            {isPro ? (
              <div className="p-6 rounded-2xl bg-green-500/10 border border-green-500/20 text-center space-y-2">
                <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
                <h3 className="font-bold text-white">Already on Pro</h3>
                <p className="text-xs text-slate-400 leading-tight">Your account is fully upgraded. Thank you for your support!</p>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-white font-bold text-sm mb-2">
                    <Banknote className="h-4 w-4 text-blue-400" /> Banking Details
                  </div>
                  <div className="space-y-3 font-mono text-sm">
                    <div className="flex justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                      <span className="text-slate-500">Bank</span>
                      <span className="text-white">FNB / First National Bank</span>
                    </div>
                    <div className="flex justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                      <span className="text-slate-500">Account No.</span>
                      <span className="text-white">62939948493</span>
                    </div>
                    <div className="flex justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                      <span className="text-slate-500">Branch Code</span>
                      <span className="text-white">250655</span>
                    </div>
                    <div className="flex justify-between p-3 rounded-xl bg-blue-600/10 border border-blue-600/20">
                      <span className="text-blue-400">Reference</span>
                      <span className="text-white font-bold">{user?.id?.slice(-8).toUpperCase() || "WAZBOT"}</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/10 flex items-start gap-3">
                  <Info className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-200/70 leading-relaxed italic">
                    Once payment is made, please WhatsApp your proof of payment to <span className="text-white font-bold">+27 82 555 1234</span>. Activation takes 1-2 hours.
                  </p>
                </div>

                <Button className="w-full h-14 bg-white text-black hover:bg-slate-200 rounded-2xl font-bold flex gap-2">
                  <CreditCard className="h-5 w-5" /> I've Made the Payment
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </main>

      <footer className="mt-auto py-12 text-center">
        <p className="text-slate-600 text-xs">© {new Date().getFullYear()} WazBot SaaS. Built for scale.</p>
      </footer>
    </div>
  );
}
