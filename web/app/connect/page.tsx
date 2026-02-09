"use client";

import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle2, QrCode, Smartphone, Zap, RefreshCw, ChevronRight, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function ConnectPage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const [mode, setMode] = useState<"QR" | "CODE">("QR");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isRequesting, setIsRequesting] = useState(false);
  
  const session = useQuery(api.sessions.getByClerkId, 
    user?.id ? { clerkId: user.id } : "skip"
  );

  const requestPairing = useMutation(api.sessions.requestPairingCode);

  const handleRequestCode = async () => {
    if (!phoneNumber || !session?._id) return;
    setIsRequesting(true);
    try {
      await requestPairing({ sessionId: session._id, phoneNumber });
    } catch (e) {
      console.error(e);
    } finally {
      setIsRequesting(false);
    }
  };

  if (!isLoaded || session === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <Loader2 className="h-12 w-12 animate-spin text-cyan-500" />
      </div>
    );
  }

  // --- SUCCESS VIEW ---
  if (session?.status === "CONNECTED") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6 selection:bg-cyan-500/30">
        <div className="fixed inset-0 -z-10 bg-slate-950">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,#10b98122,transparent)]" />
        </div>

        <div className="w-full max-w-md space-y-10 text-center animate-in fade-in zoom-in duration-700">
          <div className="flex flex-col items-center space-y-6">
            <div className="relative">
              <div className="absolute inset-0 bg-green-500 blur-2xl opacity-20 animate-pulse" />
              <div className="bg-gradient-to-br from-green-400 to-emerald-600 p-6 rounded-[2.5rem] shadow-2xl shadow-green-500/20 relative animate-bounce">
                <CheckCircle2 className="h-16 w-16 text-white" />
              </div>
            </div>
            
            <div className="space-y-2">
              <h1 className="text-4xl font-black tracking-tight text-white italic">Connection Successful!</h1>
              <p className="text-emerald-400/80 font-bold uppercase tracking-widest text-[10px]">Your bot is now live and ready</p>
            </div>
          </div>

          <Card className="bg-slate-900/50 border-white/5 backdrop-blur-xl shadow-2xl overflow-hidden pt-6">
            <CardContent className="space-y-8 p-10">
              <div className="space-y-4">
                <p className="text-slate-300 text-sm leading-relaxed">
                  To interact with your chatbot and manage your leads, go to WhatsApp and start a chat with <span className="text-white font-bold">your own connected number</span>.
                </p>
                
                <div className="p-6 bg-slate-950/50 rounded-2xl border border-white/5 flex flex-col items-center gap-4">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Send this command:</p>
                  <div className="px-8 py-4 bg-white/5 border border-cyan-500/30 rounded-xl">
                    <span className="text-3xl font-black text-white italic tracking-tighter select-all">$start</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <a 
                  href={`https://wa.me/${session.ownerNumber}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="block"
                >
                  <Button className="w-full bg-white text-black hover:bg-slate-200 h-14 rounded-2xl text-base font-black shadow-xl group">
                    Open WhatsApp <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </a>
                
                <p className="text-[10px] text-slate-500 italic">
                  The bot will reply with your main menu.
                </p>
              </div>
            </CardContent>
          </Card>

          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => {
              // Optionally allow them to see session stats or just stay here
            }}
            className="text-slate-500 hover:text-white text-[10px] font-bold uppercase tracking-widest"
          >
            Connected as {session.ownerNumber}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6 selection:bg-cyan-500/30">
      <div className="fixed inset-0 -z-10 bg-slate-950">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,#3b82f611,transparent)]" />
      </div>

      <div className="w-full max-w-md space-y-8 text-center">
        <div className="flex flex-col items-center space-y-2">
          <div className="bg-gradient-to-br from-cyan-500 to-blue-600 p-3 rounded-2xl mb-4 shadow-xl shadow-cyan-500/20">
            <Zap className="h-8 w-8 text-white fill-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white italic">Connect Your WhatsApp</h1>
          <p className="text-slate-400">Choose how you want to link your account.</p>
        </div>

        <div className="flex p-1 bg-white/5 border border-white/5 rounded-xl gap-1">
          <button 
            onClick={() => setMode("QR")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-bold transition-all ${
              mode === "QR" ? "bg-white/10 text-white shadow-lg" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            <QrCode className="h-4 w-4" /> QR Code
          </button>
          <button 
            onClick={() => setMode("CODE")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-bold transition-all ${
              mode === "CODE" ? "bg-white/10 text-white shadow-lg" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            <Smartphone className="h-4 w-4" /> Pairing Code
          </button>
        </div>

        <Card className="bg-slate-900 border-white/5 shadow-2xl overflow-hidden relative group">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          
          <CardHeader className="pb-2">
            <div className="flex justify-center mb-4">
              <Badge variant="outline" className={`px-4 py-1 flex items-center gap-2 border-white/10 ${
                session?.status === "WAIT_QR" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
              }`}>
                {session?.status === "WAIT_QR" ? (
                  <><RefreshCw className="h-4 w-4 animate-spin-slow" /> Ready to Link</>
                ) : (
                  <><Loader2 className="h-4 w-4 animate-spin" /> {session?.status || "Initializing..."}</>
                )}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="flex flex-col items-center p-8 pt-0">
            {mode === "QR" ? (
              <>
                <div className="relative p-6 bg-white rounded-3xl shadow-inner mb-6 transition-transform hover:scale-105 duration-300 border-4 border-cyan-500/20">
                  {session?.qrCode ? (
                    <QRCodeSVG 
                      value={session.qrCode} 
                      size={200}
                      level="H"
                      includeMargin={false}
                    />
                  ) : (
                    <div className="h-[200px] w-[200px] flex items-center justify-center bg-slate-100 rounded-xl">
                      <Loader2 className="h-10 w-10 animate-spin text-slate-300" />
                    </div>
                  )}
                </div>

                <div className="space-y-4 w-full text-left">
                  {[
                    "Open WhatsApp on your phone.",
                    "Tap Menu or Settings > Linked Devices.",
                    "Point your phone to this screen to capture QR."
                  ].map((step, i) => (
                    <div key={i} className="flex items-center gap-4 p-3 rounded-xl bg-white/5 border border-white/5">
                      <div className="h-6 w-6 rounded-full bg-cyan-500/10 flex items-center justify-center shrink-0">
                        <span className="text-cyan-500 text-[10px] font-black">{i + 1}</span>
                      </div>
                      <p className="text-[12px] text-slate-400 leading-tight">
                        {step}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="w-full space-y-6">
                {!session?.pairingCode ? (
                  <div className="space-y-4">
                    <div className="space-y-2 text-left">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">Phone Number</label>
                      <Input 
                        placeholder="e.g. 27605229784"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        className="bg-slate-950 border-white/10 text-white h-12 rounded-xl focus:ring-cyan-500/50"
                      />
                      <p className="text-[10px] text-slate-500 pl-1 italic">Include country code without any + or spaces.</p>
                    </div>
                    <Button 
                      onClick={handleRequestCode}
                      disabled={isRequesting || !phoneNumber}
                      className="w-full bg-cyan-600 hover:bg-cyan-500 h-12 rounded-xl text-sm font-bold shadow-lg shadow-cyan-600/20"
                    >
                      {isRequesting ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Smartphone className="h-5 w-5 mr-2" />}
                      Get Pairing Code
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-6 animate-in fade-in zoom-in duration-300">
                    <div className="bg-slate-950/80 p-6 rounded-2xl border-2 border-dashed border-cyan-500/30 flex flex-col items-center">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-[0.2em] mb-4">Your Pairing Code</p>
                      <div className="flex gap-2">
                        {session.pairingCode.split("").map((char, i) => (
                          <div key={i} className="w-8 h-12 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center text-xl font-bold text-cyan-400 shadow-inner">
                            {char}
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-4 italic">Expires in 2 minutes.</p>
                    </div>

                    <div className="space-y-3 w-full text-left">
                       {[
                        "Open Settings > Linked Devices.",
                        "Select Link a Device > Link with phone number instead.",
                        "Enter the 8-character code shown above."
                      ].map((step, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/10">
                          <div className="h-5 w-5 rounded-full bg-cyan-500 flex items-center justify-center shrink-0">
                            <span className="text-white text-[10px] font-black">{i + 1}</span>
                          </div>
                          <p className="text-[11px] text-slate-400 leading-tight">
                            {step}
                          </p>
                        </div>
                      ))}
                    </div>

                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => {
                        setPhoneNumber("");
                        requestPairing({ sessionId: session._id, phoneNumber: "" }); // Reset in DB
                      }}
                      className="text-slate-500 hover:text-white text-[10px] font-bold uppercase tracking-widest"
                    >
                      Use a different number
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-slate-500 text-[10px] flex items-center justify-center gap-2">
          <ShieldCheck className="h-3 w-3" /> Your connection is end-to-end encrypted and secure.
        </p>
      </div>
    </div>
  );
}

function ShieldCheck(props: any) {
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
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
