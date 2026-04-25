import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getColor } from "@/lib/colorMap";
import { Search, BookOpen, Sparkles, GraduationCap } from "lucide-react";

type Subject = { id: string; name: string; icon: string; color: string };
type Settings = { site_name: string; tagline: string };

export default function Index() {
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [settings, setSettings] = useState<Settings>({ site_name: "EduShelf", tagline: "Your classroom, always with you" });
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const [{ data: subs }, { data: res }, { data: s }] = await Promise.all([
        supabase.from("subjects").select("*").order("order_index"),
        supabase.from("resources").select("id, subject_id"),
        supabase.from("teacher_settings").select("site_name, tagline").limit(1).maybeSingle(),
      ]);
      setSubjects(subs ?? []);
      const c: Record<string, number> = {};
      (res ?? []).forEach((r: any) => { c[r.subject_id] = (c[r.subject_id] ?? 0) + 1; });
      setCounts(c);
      if (s) setSettings(s);
    })();
  }, []);

  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      const q = search.trim();
      const { data } = await supabase
        .from("resources")
        .select("id, title, description, subject_id, subjects(name, icon, color)")
        .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
        .limit(8);
      setSearchResults(data ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div className="min-h-screen bg-gradient-soft">
      {/* Hero */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-hero opacity-95" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(0_0%_100%/0.15),transparent_50%)]" />
        <div className="relative container mx-auto px-4 py-16 md:py-24">
          <div className="flex items-center justify-between mb-12">
            <div className="flex items-center gap-2 text-primary-foreground">
              <div className="w-10 h-10 rounded-2xl bg-primary-foreground/20 backdrop-blur flex items-center justify-center">
                <GraduationCap className="w-6 h-6" />
              </div>
              <span className="font-bold text-xl">{settings.site_name}</span>
            </div>
            <Button
              variant="ghost"
              onClick={() => navigate("/auth")}
              className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
            >
              Teacher Login
            </Button>
          </div>

          <div className="max-w-3xl mx-auto text-center text-primary-foreground animate-fade-in">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary-foreground/15 backdrop-blur mb-6 text-sm">
              <Sparkles className="w-4 h-4" /> AI-powered learning
            </div>
            <h1 className="text-4xl md:text-6xl font-extrabold mb-6 tracking-tight">
              {settings.tagline}
            </h1>
            <p className="text-lg md:text-xl text-primary-foreground/90 mb-8">
              Browse books, units & study materials shared by your teacher — read anywhere, anytime.
            </p>

            <div className="relative max-w-xl mx-auto">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title, subject or keyword…"
                className="pl-12 h-14 rounded-2xl bg-card text-foreground border-0 shadow-elegant text-base"
              />
              {searchResults.length > 0 && (
                <div className="absolute mt-2 w-full bg-card rounded-2xl shadow-elegant border overflow-hidden text-left z-10">
                  {searchResults.map((r) => (
                    <Link
                      key={r.id}
                      to={`/read/${r.id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-accent transition-smooth"
                      onClick={() => setSearch("")}
                    >
                      <span className="text-2xl">{r.subjects?.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-foreground truncate">{r.title}</div>
                        <div className="text-xs text-muted-foreground truncate">{r.subjects?.name}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Subjects grid */}
      <main className="container mx-auto px-4 py-16">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">Subjects</h2>
            <p className="text-muted-foreground mt-1">Pick a subject to start exploring</p>
          </div>
        </div>

        {subjects.length === 0 ? (
          <Card className="p-12 text-center border-dashed">
            <BookOpen className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-semibold text-lg mb-1">No subjects yet</h3>
            <p className="text-muted-foreground">Your teacher hasn't added any content yet. Check back soon!</p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {subjects.map((s, idx) => {
              const color = getColor(s.color);
              return (
                <Link key={s.id} to={`/subject/${s.id}`} style={{ animationDelay: `${idx * 50}ms` }} className="animate-fade-in">
                  <Card className="group relative overflow-hidden p-6 h-full hover:shadow-elegant transition-smooth hover:-translate-y-1 cursor-pointer border-0 shadow-soft">
                    <div className={`absolute inset-0 opacity-10 ${color.bg}`} />
                    <div className={`relative w-14 h-14 rounded-2xl ${color.bg} ${color.text} flex items-center justify-center text-3xl mb-4 shadow-md group-hover:scale-110 transition-smooth`}>
                      {s.icon}
                    </div>
                    <h3 className="relative font-semibold text-lg text-foreground mb-1">{s.name}</h3>
                    <p className="relative text-sm text-muted-foreground">
                      {counts[s.id] ?? 0} resource{(counts[s.id] ?? 0) === 1 ? "" : "s"}
                    </p>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </main>

      <footer className="border-t py-8 mt-16">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          {settings.site_name} · Built with care for students & teachers
        </div>
      </footer>
    </div>
  );
}
