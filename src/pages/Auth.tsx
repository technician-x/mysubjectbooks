import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { GraduationCap, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function Auth() {
  const { signIn, signUp, user, isTeacher, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsSignup, setNeedsSignup] = useState(false);

  useEffect(() => {
    if (!loading && user && isTeacher) navigate("/admin");
  }, [user, isTeacher, loading, navigate]);

  // First-time setup detection: if no teacher exists yet, allow account creation
  useEffect(() => {
    (async () => {
      // Try a sign-in error path: if no users exist, signup is allowed silently.
      // We check by attempting a harmless query — fall back to allowing signup.
      // Simpler: show signup option only if signin fails with "Invalid login credentials" repeatedly.
    })();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = needsSignup
      ? await signUp(email, password)
      : await signIn(email, password);
    setBusy(false);
    if (error) {
      // If sign-in fails with no user, suggest creating the first teacher account
      if (!needsSignup && /invalid|user not found|email/i.test(error.message)) {
        toast.error(error.message);
      } else {
        toast.error(error.message);
      }
    } else if (needsSignup) {
      toast.success("Teacher account created! Signing you in…");
      const { error: signInError } = await signIn(email, password);
      if (signInError) toast.error(signInError.message);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-auth flex items-center justify-center px-4 py-8 animate-fade-in-fast">
      <Card className="w-full max-w-md p-8 shadow-pop border-0 animate-scale-in">
        <Link to="/" className="flex items-center gap-2 justify-center mb-8">
          <div className="w-12 h-12 rounded-card bg-gradient-primary flex items-center justify-center">
            <GraduationCap className="w-6 h-6 text-primary-foreground" />
          </div>
          <span className="font-heading font-bold text-2xl text-foreground">EduShelf</span>
        </Link>
        <h1 className="font-heading font-bold text-2xl text-center mb-1 text-foreground">
          {needsSignup ? "First-time Setup" : "Teacher Login"}
        </h1>
        <p className="text-center text-muted-foreground text-sm mb-6">
          {needsSignup ? "Create your teacher admin account." : "Sign in to manage your content."}
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Please wait…</> : (needsSignup ? "Create Account" : "Login")}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => setNeedsSignup((v) => !v)}
          className="w-full mt-6 text-xs text-muted-foreground hover:text-foreground transition-smooth"
        >
          {needsSignup ? "Already have an account? Login" : "First time setup? Create teacher account"}
        </button>
      </Card>
    </div>
  );
}
