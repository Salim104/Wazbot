"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Zap, 
  ShieldCheck, 
  Users, 
  ArrowRight, 
  CheckCircle2, 
  QrCode,
  Smartphone,
  Database,
  Activity
} from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LandingPage() {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.push("/connect");
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || isSignedIn) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <Activity className="h-10 w-10 animate-spin text-cyan-500" />
      </div>
    );
  }
  return (
    <div className="flex flex-col min-h-screen selection:bg-cyan-500/30">
      {/* Dynamic Background */}
      <div className="fixed inset-0 -z-10 bg-slate-950">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,#3b82f633,transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_50%,#8b5cf622,transparent)]" />
      </div>

      {/* Navigation */}
      <header className="px-6 lg:px-12 h-20 flex items-center justify-between sticky top-0 bg-slate-950/50 backdrop-blur-md border-b border-white/5 z-50">
        <Link className="flex items-center justify-center group" href="#">
          <div className="bg-gradient-to-br from-cyan-500 to-blue-600 p-2 rounded-lg mr-2 group-hover:scale-110 transition-transform">
            <Zap className="h-5 w-5 text-white fill-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">WazBot</span>
        </Link>
        <nav className="hidden md:flex gap-8">
          <Link className="text-sm font-medium text-slate-400 hover:text-white transition-colors" href="#features">
            Features
          </Link>
          <Link className="text-sm font-medium text-slate-400 hover:text-white transition-colors" href="#how-it-works">
            How it works
          </Link>
          <Link className="text-sm font-medium text-slate-400 hover:text-white transition-colors" href="#pricing">
            Pricing
          </Link>
        </nav>
        <div className="flex items-center gap-4">
          <Link href="/sign-in">
            <Button variant="ghost" className="text-slate-300 hover:text-white">Login</Button>
          </Link>
          <Link href="/sign-up">
            <Button className="bg-white text-black hover:bg-slate-200 rounded-full px-6">
              Start Free
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative pt-20 pb-16 lg:pt-32 lg:pb-24 overflow-hidden">
          <div className="container px-4 md:px-6 relative">
            <div className="flex flex-col items-center space-y-8 text-center">
              <Badge variant="outline" className="px-4 py-1 text-cyan-400 border-cyan-400/30 bg-cyan-400/5 animate-pulse">
                Now in Public Beta
              </Badge>
              <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter max-w-4xl bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400">
                Auto-Save Your WhatsApp Leads in Real-Time
              </h1>
              <p className="max-w-[700px] text-slate-400 text-lg md:text-xl leading-relaxed">
                Never lose a customer again. WazBot automatically syncs your WhatsApp interactions to your CRM and business phone—no manual work required.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <Link href="/sign-up">
                  <Button size="lg" className="h-14 px-8 text-lg rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 hover:opacity-90 border-0">
                    Connect Your WhatsApp <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link href="#how-it-works">
                  <Button variant="outline" size="lg" className="h-14 px-8 text-lg rounded-full border-white/10 hover:bg-white/5">
                    See How It Works
                  </Button>
                </Link>
              </div>
              <div className="pt-12 flex items-center gap-8 opacity-50 grayscale hover:grayscale-0 transition-all">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5" />
                  <span className="text-sm font-medium uppercase tracking-widest">End-to-End Secure</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  <span className="text-sm font-medium uppercase tracking-widest">1,000+ Users</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section id="features" className="py-24 bg-slate-950/50">
          <div className="container px-4 md:px-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <Card className="bg-white/5 border-white/10 backdrop-blur-sm group hover:border-cyan-500/50 transition-all duration-300">
                <CardContent className="p-8">
                  <div className="h-12 w-12 rounded-2xl bg-cyan-500/10 flex items-center justify-center mb-6 text-cyan-500 group-hover:scale-110 transition-transform">
                    <QrCode className="h-6 w-6" />
                  </div>
                  <h3 className="text-xl font-bold mb-3 italic">Connect & Go</h3>
                  <p className="text-slate-400 leading-relaxed">
                    Scan the QR code with your WhatsApp app just like linking a device. You're ready to sync in under 30 seconds.
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-white/5 border-white/10 backdrop-blur-sm group hover:border-blue-500/50 transition-all duration-300">
                <CardContent className="p-8">
                  <div className="h-12 w-12 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-6 text-blue-500 group-hover:scale-110 transition-transform">
                    <Smartphone className="h-6 w-6" />
                  </div>
                  <h3 className="text-xl font-bold mb-3 italic">Native Sync</h3>
                  <p className="text-slate-400 leading-relaxed">
                    Automatically save new leads to your phone's address book and your CRM database simultaneously.
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-white/5 border-white/10 backdrop-blur-sm group hover:border-purple-500/50 transition-all duration-300">
                <CardContent className="p-8">
                  <div className="h-12 w-12 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-6 text-purple-500 group-hover:scale-110 transition-transform">
                    <Database className="h-6 w-6" />
                  </div>
                  <h3 className="text-xl font-bold mb-3 italic">Cloud Storage</h3>
                  <p className="text-slate-400 leading-relaxed">
                    Your leads are securely stored in the cloud, even if you lose your phone or switch devices.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="py-24 relative overflow-hidden">
          <div className="container px-4 md:px-6">
            <div className="text-center mb-16 space-y-4">
              <h2 className="text-4xl font-bold tracking-tight">Simple, Transparent Pricing</h2>
              <p className="text-slate-400 text-lg">Choose the plan that fits your business stage.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              <Card className="bg-white/5 border-white/10 hover:bg-white/10 transition-colors">
                <CardContent className="p-10 space-y-8">
                  <div className="space-y-2">
                    <h3 className="text-2xl font-bold">Standard</h3>
                    <p className="text-slate-400">Perfect for individuals starting out.</p>
                  </div>
                  <div className="text-4xl font-bold">Free</div>
                  <ul className="space-y-4">
                    <li className="flex items-center gap-3 text-slate-300">
                      <CheckCircle2 className="h-5 w-5 text-green-500" /> 20 Syncable Contacts
                    </li>
                    <li className="flex items-center gap-3 text-slate-300">
                      <CheckCircle2 className="h-5 w-5 text-green-500" /> Basic Contact Storage
                    </li>
                    <li className="flex items-center gap-3 text-slate-300">
                      <CheckCircle2 className="h-5 w-5 text-green-500" /> 2 Announcements
                    </li>
                  </ul>
                  <Link href="/sign-up" className="block">
                    <Button variant="outline" className="w-full h-12 rounded-xl">Get Started</Button>
                  </Link>
                </CardContent>
              </Card>
              <Card className="bg-white/5 border-blue-500/50 ring-1 ring-blue-500/20 relative shadow-2xl shadow-blue-500/10">
                <div className="absolute top-0 right-0 transform translate-x-1/4 -translate-y-1/2">
                  <Badge className="bg-blue-600 text-white px-4 py-1">Recommended</Badge>
                </div>
                <CardContent className="p-10 space-y-8">
                  <div className="space-y-2">
                    <h3 className="text-2xl font-bold">WazBot Pro</h3>
                    <p className="text-slate-400">For active businesses and power users.</p>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold">R150</span>
                    <span className="text-slate-400">/mo</span>
                  </div>
                  <ul className="space-y-4">
                    <li className="flex items-center gap-3 text-slate-100">
                      <CheckCircle2 className="h-5 w-5 text-blue-500" /> 500+ Syncable Contacts
                    </li>
                    <li className="flex items-center gap-3 text-slate-100">
                      <CheckCircle2 className="h-5 w-5 text-blue-500" /> Advanced Phone Sync
                    </li>
                    <li className="flex items-center gap-3 text-slate-100">
                      <CheckCircle2 className="h-5 w-5 text-blue-500" /> 20 Announcements
                    </li>
                    <li className="flex items-center gap-3 text-slate-100">
                      <CheckCircle2 className="h-5 w-5 text-blue-500" /> Priority Support
                    </li>
                  </ul>
                  <Link href="/sign-up" className="block">
                    <Button className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700">Go Pro Now</Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 container">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[3rem] p-12 md:p-24 overflow-hidden relative">
            <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 h-96 w-96 bg-white/10 rounded-full blur-3xl" />
            <div className="max-w-3xl space-y-8 relative">
              <h2 className="text-4xl md:text-6xl font-extrabold text-white leading-tight">
                Ready to stop losing <br /> business leads?
              </h2>
              <p className="text-blue-100 text-xl md:text-2xl max-w-xl leading-relaxed">
                Join 1,000+ businesses using WazBot to scale their sales operations on WhatsApp.
              </p>
              <Link href="/sign-up">
                <Button size="lg" className="h-16 px-10 text-xl rounded-full bg-white text-blue-700 hover:bg-blue-50 shadow-xl">
                  Get Started for Free
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5 py-12 px-6 lg:px-12 bg-slate-950">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2 grayscale group-hover:grayscale-0">
            <Zap className="h-6 w-6 text-slate-500" />
            <span className="text-slate-500 font-bold tracking-tight">WazBot</span>
          </div>
          <div className="text-slate-500 text-sm">
            © {new Date().getFullYear()} WazBot. All rights reserved.
          </div>
          <nav className="flex gap-8">
            <Link className="text-sm text-slate-500 hover:text-white" href="#">Terms</Link>
            <Link className="text-sm text-slate-500 hover:text-white" href="#">Privacy</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
