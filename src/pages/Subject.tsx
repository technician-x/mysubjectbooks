import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getColor } from "@/lib/colorMap";
import { ArrowLeft, BookOpen, FileText, Play } from "lucide-react";

type Subject = { id: string; name: string; icon: string; color: string };
type Book = { id: string; title: string; description: string | null; order_index: number };
type Resource = {
  id: string; title: string; description: string | null; content_type: string;
  unit_number: string | null; book_id: string | null; order_index: number;
  cover_emoji: string | null; cover_color: string | null;
};

export default function Subject() {
  const { id } = useParams();
  const [subject, setSubject] = useState<Subject | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [{ data: s }, { data: b }, { data: r }] = await Promise.all([
        supabase.from("subjects").select("*").eq("id", id).maybeSingle(),
        supabase.from("books").select("*").eq("subject_id", id).order("order_index"),
        supabase.from("resources").select("*").eq("subject_id", id).order("order_index"),
      ]);
      setSubject(s);
      setBooks(b ?? []);
      setResources(r ?? []);
    })();
  }, [id]);

  if (!subject) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  const color = getColor(subject.color);
  const standalone = resources.filter((r) => !r.book_id);
  const fullBooks = resources.filter((r) => r.content_type === "full" && !r.book_id);
  const otherStandalone = standalone.filter((r) => r.content_type !== "full");

  return (
    <div className="min-h-screen bg-gradient-soft">
      <header className={`relative overflow-hidden ${color.bg}`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,hsl(0_0%_100%/0.2),transparent_60%)]" />
        <div className="relative container mx-auto px-4 py-12">
          <Link to="/" className={`inline-flex items-center gap-2 ${color.text} hover:opacity-80 mb-6 transition-smooth`}>
            <ArrowLeft className="w-4 h-4" /> Back to subjects
          </Link>
          <div className={`flex items-center gap-4 ${color.text}`}>
            <div className="w-16 h-16 rounded-2xl bg-white/25 backdrop-blur flex items-center justify-center text-4xl">
              {subject.icon}
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold">{subject.name}</h1>
              <p className="opacity-90 mt-1">{resources.length} resource{resources.length === 1 ? "" : "s"} available</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-10 space-y-10">
        {fullBooks.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
              <BookOpen className="w-5 h-5" /> Full Books
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              {fullBooks.map((r) => (
                <ResourceCard key={r.id} r={r} large />
              ))}
            </div>
          </section>
        )}

        {books.map((book) => {
          const items = resources.filter((r) => r.book_id === book.id).sort((a, b) => a.order_index - b.order_index);
          if (items.length === 0) return null;
          return (
            <section key={book.id}>
              <Card className="overflow-hidden border-0 shadow-soft">
                <div className={`p-5 ${color.bg} ${color.text}`}>
                  <div className="flex items-center gap-3">
                    <BookOpen className="w-6 h-6" />
                    <div>
                      <h3 className="font-bold text-lg">{book.title}</h3>
                      {book.description && <p className="text-sm opacity-90">{book.description}</p>}
                    </div>
                  </div>
                </div>
                <div className="divide-y">
                  {items.map((r, i) => (
                    <Link
                      key={r.id}
                      to={`/read/${r.id}`}
                      className="flex items-center gap-4 p-4 hover:bg-accent transition-smooth group"
                    >
                      <div className={`w-10 h-10 rounded-xl ${color.soft} flex items-center justify-center font-semibold text-sm`}>
                        {r.unit_number || (i + 1)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-foreground truncate">{r.title}</div>
                        {r.description && <div className="text-sm text-muted-foreground truncate">{r.description}</div>}
                      </div>
                      <Button size="sm" variant="ghost" className="group-hover:bg-primary group-hover:text-primary-foreground transition-smooth">
                        <Play className="w-4 h-4 mr-1" /> Read
                      </Button>
                    </Link>
                  ))}
                </div>
              </Card>
            </section>
          );
        })}

        {otherStandalone.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5" /> More Resources
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {otherStandalone.map((r) => <ResourceCard key={r.id} r={r} />)}
            </div>
          </section>
        )}

        {resources.length === 0 && (
          <Card className="p-12 text-center border-dashed">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No resources in this subject yet.</p>
          </Card>
        )}
      </main>
    </div>
  );
}

function ResourceCard({ r, large }: { r: Resource; large?: boolean }) {
  const color = getColor(r.cover_color || "indigo");
  return (
    <Link to={`/read/${r.id}`}>
      <Card className="group p-5 hover:shadow-elegant transition-smooth hover:-translate-y-1 cursor-pointer border-0 shadow-soft h-full">
        <div className="flex items-start gap-4">
          <div className={`${large ? "w-16 h-20" : "w-12 h-16"} rounded-xl ${color.bg} ${color.text} flex items-center justify-center text-3xl shadow-md flex-shrink-0`}>
            {r.cover_emoji || "📄"}
          </div>
          <div className="flex-1 min-w-0">
            {r.unit_number && (
              <div className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-md ${color.soft} mb-1`}>
                {r.unit_number}
              </div>
            )}
            <h3 className="font-semibold text-foreground mb-1">{r.title}</h3>
            {r.description && <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{r.description}</p>}
            <Button size="sm" className="bg-gradient-primary hover:opacity-90 transition-smooth">
              <Play className="w-4 h-4 mr-1" /> Read
            </Button>
          </div>
        </div>
      </Card>
    </Link>
  );
}
