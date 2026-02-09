import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <div className="fixed inset-0 -z-10 bg-slate-950">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,#3b82f611,transparent)]" />
      </div>
      <SignUp 
        appearance={{
          elements: {
            card: "bg-slate-900 border border-white/5",
            headerTitle: "text-white font-bold",
            headerSubtitle: "text-slate-400",
            socialButtonsBlockButton: "bg-white/5 border-white/5 text-white hover:bg-white/10",
            formButtonPrimary: "bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl",
            formFieldLabel: "text-slate-400 font-medium",
            formFieldInput: "bg-white/5 border-white/5 text-white focus:ring-blue-500",
            footerActionText: "text-slate-400",
            footerActionLink: "text-blue-500 hover:text-blue-400",
            dividerLine: "bg-white/5",
            dividerText: "text-slate-500"
          }
        }}
      />
    </div>
  );
}
