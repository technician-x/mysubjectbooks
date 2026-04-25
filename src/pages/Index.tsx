import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getColor } from "@/lib/colorMap";
import { Search, BookOpen, X } from "lucide-react";

type Subject = { id: string; name: string; icon: string; color: string };
type Settings = { site_name: string; tagline: string };

export default function Index() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [settings, setSettings] = useState<Settings>({ site_name: "EduShelf", tagline: "Learn anywhere, anytime." });
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
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
      if (s) setSettings({ site_name: s.site_name || "EduShelf", tagline: s.tagline || "Learn anywhere, anytime." });
      setLoading(false);
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
    }, 200);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div className="min-h-screen bg-background flex flex-col animate-fade-in-fast">
      {/* Sticky minimal navbar */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur border-b border-border">
        <div className="container mx-auto h-16 flex items-center justify-between px-4">
          <Link to="/" className="font-heading font-bold text-xl text-foreground">
            {settings.site_name}
          </Link>
          <button
            onClick={() => setSearchOpen(true)}
            className="w-12 h-12 rounded-full hover:bg-muted flex items-center justify-center press"
            aria-label="Search"
          >
            <Search className="w-5 h-5 text-foreground" />
          </button>
        </div>
      </header>

      {/* Search overlay */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm animate-fade-in-fast" onClick={() => setSearchOpen(false)}>
          <div className="container mx-auto px-4 pt-20" onClick={(e) => e.stopPropagation()}>
            <div className="max-w-2xl mx-auto">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by title, subject or keyword…"
                  className="pl-12 pr-12 h-14 text-base shadow-card-hover border-0"
                />
                <button onClick={() => setSearchOpen(false)} className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {searchResults.length > 0 && (
                <Card className="mt-3 overflow-hidden p-0 shadow-pop">
                  {searchResults.map((r) => (
                    <Link
                      key={r.id}
                      to={`/read/${r.id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-muted transition-smooth"
                      onClick={() => setSearchOpen(false)}
                    >
                      <span className="text-2xl">{r.subjects?.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-foreground truncate">{r.title}</div>
                        <div className="text-xs text-muted-foreground truncate">{r.subjects?.name}</div>
                      </div>
                    </Link>
                  ))}
                </Card>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="container mx-auto px-4 pt-12 md:pt-20 pb-10 text-center max-w-3xl">
        <h1 className="font-heading text-4xl md:text-6xl font-extrabold tracking-tight text-foreground mb-4 animate-fade-in">
          {settings.tagline}
        </h1>
        <p className="text-base md:text-lg text-muted-foreground animate-fade-in" style={{ animationDelay: "60ms" }}>
          Pick a subject to start exploring.
        </p>
      </section>

      {/* Subject cards */}
      <main className="container mx-auto px-4 pb-16 flex-1">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-card" />
            ))}
          </div>
        ) : subjects.length === 0 ? (
          <Card className="p-12 text-center max-w-md mx-auto border-dashed">
            <BookOpen className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-heading font-semibold text-lg mb-1">No subjects yet</h3>
            <p className="text-muted-foreground text-sm">Your teacher hasn't added any content yet.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {subjects.map((s, idx) => {
              const color = getColor(s.color);
              const count = counts[s.id] ?? 0;
              return (
                <Link key={s.id} to={`/subject/${s.id}`} style={{ animationDelay: `${idx * 40}ms` }} className="animate-fade-in">
                  <Card className="lift-card cursor-pointer h-full overflow-hidden p-0 border border-border">
                    {/* colored top strip */}
                    <div className={`h-2 w-full ${color.bg}`} />
                    <div className="p-6 flex flex-col items-center text-center">
                      <div className="text-5xl mb-4 leading-none">{s.icon}</div>
                      <h3 className="font-heading font-bold text-lg text-foreground mb-2">{s.name}</h3>
                      <span className="inline-block text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                        {count} resource{count === 1 ? "" : "s"}
                      </span>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </main>

      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          {settings.site_name} · Made for students <span className="text-destructive">❤️</span>
        </div>
      </footer>
    </div>
  );
}
