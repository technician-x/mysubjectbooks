import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { GraduationCap } from "lucide-react";
import { toast } from "sonner";

export default function Auth() {
  const { signIn, signUp, user, isTeacher, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user && isTeacher) navigate("/admin");
  }, [user, isTeacher, loading, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = mode === "signin"
      ? await signIn(email, password)
      : await signUp(email, password);
    setBusy(false);
    if (error) {
      toast.error(error.message);
    } else if (mode === "signup") {
      toast.success("Account created! You can sign in now.");
      setMode("signin");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-soft flex items-center justify-center px-4">
      <Card className="w-full max-w-md p-8 shadow-elegant border-0 animate-scale-in">
        <Link to="/" className="flex items-center gap-2 justify-center mb-6">
          <div className="w-10 h-10 rounded-2xl bg-gradient-primary flex items-center justify-center">
            <GraduationCap className="w-6 h-6 text-primary-foreground" />
          </div>
          <span className="font-bold text-xl text-gradient">EduShelf</span>
        </Link>
        <h1 className="text-2xl font-bold text-center mb-1">
          {mode === "signin" ? "Teacher Sign In" : "Create Teacher Account"}
        </h1>
        <p className="text-center text-muted-foreground text-sm mb-6">
          {mode === "signup" ? "First account becomes the teacher admin." : "Sign in to manage content."}
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full bg-gradient-primary hover:opacity-90" disabled={busy}>
            {busy ? "Please wait…" : mode === "signin" ? "Sign In" : "Create Account"}
          </Button>
        </form>

        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="w-full mt-4 text-sm text-muted-foreground hover:text-foreground transition-smooth"
        >
          {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </Card>
    </div>
  );
}
