"use client";

import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  ShieldCheck, 
  Search, 
  RefreshCcw, 
  UserCheck, 
  Activity, 
  Users,
  Zap,
  ArrowLeft,
  Loader2
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminDashboard() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const [search, setSearch] = useState("");

  const dbUser = useQuery(api.users.getByClerkId, 
    user?.id ? { clerkId: user.id } : "skip"
  );

  const allUsers = useQuery(api.users.listAllUsers) || [];
  const upgradeUser = useMutation(api.users.upgrade);

  if (!isLoaded || dbUser === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-cyan-500">
        <Activity className="h-10 w-10 animate-spin" />
      </div>
    );
  }

  // Security check
  if (!dbUser?.isAdmin) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-950 text-white gap-4">
        <ShieldCheck className="h-16 w-16 text-red-500" />
        <h1 className="text-2xl font-bold italic">Access Restricted</h1>
        <p className="text-slate-400">You do not have administrative privileges.</p>
        <Link href="/dashboard">
          <Button className="bg-white text-black hover:bg-slate-200">Return to Dashboard</Button>
        </Link>
      </div>
    );
  }

  const filteredUsers = allUsers.filter(u => 
    u.email.toLowerCase().includes(search.toLowerCase()) || 
    u.clerkId.toLowerCase().includes(search.toLowerCase())
  );

  const handleUpgrade = async (userId: any, currentPlan: string) => {
    const newPlan = currentPlan === "FREE" ? "PRO" : "FREE";
    if (confirm(`Change plan for user to ${newPlan}?`)) {
      await upgradeUser({ userId, plan: newPlan as "FREE" | "PRO" });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 selection:bg-cyan-500/30">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,#3b82f611,transparent)]" />
      
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 text-blue-500 mb-1">
              <ShieldCheck className="h-4 w-4" />
              <span className="text-[10px] uppercase font-bold tracking-widest">Admin Control Center</span>
            </div>
            <h1 className="text-4xl font-extrabold text-white tracking-tighter italic">User Management</h1>
            <p className="text-slate-400 text-sm">Verify EFT payments and manage user sessions.</p>
          </div>
          <div className="flex gap-3">
            <Link href="/dashboard">
              <Button variant="outline" className="border-white/10 text-slate-400 hover:text-white">
                <ArrowLeft className="mr-2 h-4 w-4" /> To App
              </Button>
            </Link>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white">
              <RefreshCcw className="mr-2 h-4 w-4" /> Refresh Data
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="bg-slate-900 border-white/5 relative overflow-hidden group">
            <CardHeader className="p-6">
              <CardDescription className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Total Users</CardDescription>
              <CardTitle className="text-3xl font-black text-white">{allUsers.length}</CardTitle>
              <Users className="absolute top-4 right-4 h-12 w-12 text-blue-500/10 group-hover:text-blue-500/20 transition-colors" />
            </CardHeader>
          </Card>
          <Card className="bg-slate-900 border-white/5 relative overflow-hidden group">
            <CardHeader className="p-6">
              <CardDescription className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Active PRO</CardDescription>
              <CardTitle className="text-3xl font-black text-white">{allUsers.filter(u => u.plan === "PRO").length}</CardTitle>
              <Zap className="absolute top-4 right-4 h-12 w-12 text-amber-500/10 group-hover:text-amber-500/20 transition-colors" />
            </CardHeader>
          </Card>
          <Card className="bg-slate-900 border-white/5 relative overflow-hidden group">
            <CardHeader className="p-6">
              <CardDescription className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Connected WAs</CardDescription>
              <CardTitle className="text-3xl font-black text-white">{allUsers.filter(u => u.sessionStatus === "CONNECTED").length}</CardTitle>
              <Activity className="absolute top-4 right-4 h-12 w-12 text-green-500/10 group-hover:text-green-500/20 transition-colors" />
            </CardHeader>
          </Card>
          <Card className="bg-slate-900 border-white/5 relative overflow-hidden group">
            <CardHeader className="p-6">
              <CardDescription className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Total Leads</CardDescription>
              <CardTitle className="text-3xl font-black text-white">{allUsers.reduce((acc, u) => acc + (u.metrics.saved || 0), 0)}</CardTitle>
              <TrendingUp className="absolute top-4 right-4 h-12 w-12 text-cyan-500/10 group-hover:text-cyan-500/20 transition-colors" />
            </CardHeader>
          </Card>
        </div>

        {/* User Table */}
        <Card className="bg-slate-900 border-white/5 shadow-2xl backdrop-blur-xl">
          <CardHeader className="p-8 border-b border-white/5 flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-xl font-bold text-white">Active Users</CardTitle>
              <CardDescription className="text-slate-500">Manage plans and view real-time sync metrics.</CardDescription>
            </div>
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <Input 
                placeholder="Search by Email or EFT Ref (Clerk ID)..." 
                className="bg-white/5 border-white/10 pl-10 focus:ring-blue-500"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableHead className="text-slate-500 font-bold uppercase text-[10px] tracking-widest px-8 py-6">User / Email</TableHead>
                  <TableHead className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">Plan</TableHead>
                  <TableHead className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">Metrics</TableHead>
                  <TableHead className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">WhatsApp Status</TableHead>
                  <TableHead className="text-slate-500 font-bold uppercase text-[10px] tracking-widest text-right px-8">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user._id} className="border-white/5 hover:bg-white/5 transition-colors group">
                    <TableCell className="px-8 py-6">
                      <div className="flex flex-col">
                        <span className="text-white font-bold">{user.email}</span>
                        <span className="text-[10px] text-slate-500 font-mono tracking-tighter">REF: {user.clerkId.slice(-8).toUpperCase()}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={user.plan === "PRO" ? "bg-blue-600 text-white border-0" : "bg-white/10 text-slate-400 border-0"}>
                        {user.plan}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-4 items-center">
                        <div className="flex flex-col">
                          <span className="text-white font-black">{user.metrics.saved}</span>
                          <span className="text-[9px] text-slate-500 uppercase font-bold tracking-tighter">Contacts</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-slate-300 font-black">{user.metrics.announcementsSent}</span>
                          <span className="text-[9px] text-slate-500 uppercase font-bold tracking-tighter">Announced</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${user.sessionStatus === "CONNECTED" ? "bg-green-500" : "bg-slate-700"}`} />
                        <span className="text-xs text-slate-400">{user.sessionStatus}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right px-8">
                      <Button 
                        size="sm" 
                        variant={user.plan === "PRO" ? "outline" : "default"}
                        className={user.plan === "PRO" ? "border-red-500/20 text-red-400 hover:bg-red-500/10 h-8" : "bg-blue-600 hover:bg-blue-700 h-8"}
                        onClick={() => handleUpgrade(user._id, user.plan)}
                      >
                        {user.plan === "PRO" ? "Downgrade Free" : <><UserCheck className="mr-2 h-3 w-3" /> Verify EFT & Upgrade</>}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filteredUsers.length === 0 && (
              <div className="p-20 text-center text-slate-500 italic">
                No users found matching your search.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TrendingUp(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}
