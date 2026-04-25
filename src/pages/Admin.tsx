import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { GraduationCap, Plus, Upload, Trash2, Edit, LogOut, Link2, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { colorOptions, getColor } from "@/lib/colorMap";

const EMOJI_OPTIONS = ["📚","📖","📕","📗","📘","📙","🧪","🔬","🧮","🌍","🎨","🎵","💻","⚛️","📐","🧠","✏️","🔭","🌱","⚙️"];

export default function Admin() {
  const { user, isTeacher, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState<any[]>([]);
  const [books, setBooks] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    if (!loading && (!user || !isTeacher)) navigate("/auth");
  }, [user, isTeacher, loading, navigate]);

  const refresh = async () => {
    const [{ data: s }, { data: b }, { data: r }, { data: ts }] = await Promise.all([
      supabase.from("subjects").select("*").order("order_index"),
      supabase.from("books").select("*").order("order_index"),
      supabase.from("resources").select("*").order("order_index"),
      supabase.from("teacher_settings").select("*").limit(1).maybeSingle(),
    ]);
    setSubjects(s ?? []); setBooks(b ?? []); setResources(r ?? []); setSettings(ts);
  };

  useEffect(() => { if (isTeacher) refresh(); }, [isTeacher]);

  if (loading || !isTeacher) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-card border-b sticky top-0 z-30">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-primary flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-gradient">{settings?.site_name || "EduShelf"}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground">Admin</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/" target="_blank"><ExternalLink className="w-4 h-4 mr-1" /> View Site</Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => signOut().then(() => navigate("/"))}>
              <LogOut className="w-4 h-4 mr-1" /> Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="upload">
          <TabsList className="mb-6">
            <TabsTrigger value="upload">Upload</TabsTrigger>
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="subjects">Subjects</TabsTrigger>
            <TabsTrigger value="books">Books</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="upload"><UploadTab subjects={subjects} books={books} onDone={refresh} /></TabsContent>
          <TabsContent value="content"><ContentTab subjects={subjects} books={books} resources={resources} onChange={refresh} /></TabsContent>
          <TabsContent value="subjects"><SubjectsTab subjects={subjects} onChange={refresh} /></TabsContent>
          <TabsContent value="books"><BooksTab subjects={subjects} books={books} onChange={refresh} /></TabsContent>
          <TabsContent value="settings"><SettingsTab settings={settings} onChange={refresh} /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

/* ---------- Upload Tab ---------- */
function UploadTab({ subjects, books, onDone }: any) {
  const [files, setFiles] = useState<File[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const onFiles = (fl: FileList | null) => {
    if (!fl) return;
    const arr = Array.from(fl);
    setFiles(arr);
    setItems(arr.map((f) => ({
      name: f.name,
      title: f.name.replace(/\.pdf$/i, ""),
      subject_id: subjects[0]?.id || "",
      book_id: "",
      content_type: "unit",
      unit_number: "",
      description: "",
      cover_emoji: "📄",
      cover_color: "indigo",
      allow_download: true,
    })));
  };

  const update = (i: number, patch: any) => setItems((s) => s.map((it, idx) => idx === i ? { ...it, ...patch } : it));

  const upload = async () => {
    if (items.some((i) => !i.subject_id || !i.title)) {
      toast.error("Each PDF needs a subject and title"); return;
    }
    setBusy(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const meta = items[i];
        const path = `${meta.subject_id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("pdfs").upload(path, file, { contentType: "application/pdf" });
        if (upErr) throw upErr;
        const { data: { publicUrl } } = supabase.storage.from("pdfs").getPublicUrl(path);
        const { error: insErr } = await supabase.from("resources").insert({
          subject_id: meta.subject_id,
          book_id: meta.book_id || null,
          title: meta.title,
          description: meta.description || null,
          content_type: meta.content_type,
          unit_number: meta.unit_number || null,
          pdf_url: publicUrl,
          pdf_path: path,
          allow_download: meta.allow_download,
          cover_emoji: meta.cover_emoji,
          cover_color: meta.cover_color,
        });
        if (insErr) throw insErr;
      }
      toast.success(`Uploaded ${files.length} PDF${files.length > 1 ? "s" : ""}!`);
      setFiles([]); setItems([]); onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(false); }
  };

  if (subjects.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted-foreground mb-4">Create a subject first before uploading PDFs.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <Label htmlFor="pdfs" className="block mb-2">Select one or more PDF files</Label>
        <Input id="pdfs" type="file" accept="application/pdf" multiple onChange={(e) => onFiles(e.target.files)} />
      </Card>

      {items.map((it, i) => {
        const subjectBooks = books.filter((b: any) => b.subject_id === it.subject_id);
        return (
          <Card key={i} className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium truncate">{it.name}</span>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>Title *</Label>
                <Input value={it.title} onChange={(e) => update(i, { title: e.target.value })} />
              </div>
              <div>
                <Label>Subject *</Label>
                <Select value={it.subject_id} onValueChange={(v) => update(i, { subject_id: v, book_id: "" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {subjects.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.icon} {s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Content Type</Label>
                <Select value={it.content_type} onValueChange={(v) => update(i, { content_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Full Book</SelectItem>
                    <SelectItem value="unit">Unit</SelectItem>
                    <SelectItem value="part">Part / Chapter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Book (optional)</Label>
                <Select value={it.book_id || "none"} onValueChange={(v) => update(i, { book_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Standalone" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Standalone —</SelectItem>
                    {subjectBooks.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Unit / Part Number</Label>
                <Input value={it.unit_number} onChange={(e) => update(i, { unit_number: e.target.value })} placeholder="e.g. Unit 2" />
              </div>
              <div>
                <Label>Cover Emoji</Label>
                <Select value={it.cover_emoji} onValueChange={(v) => update(i, { cover_emoji: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {EMOJI_OPTIONS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label>Short Description</Label>
                <Textarea rows={2} value={it.description} onChange={(e) => update(i, { description: e.target.value })} />
              </div>
              <div>
                <Label>Cover Color</Label>
                <ColorPicker value={it.cover_color} onChange={(v) => update(i, { cover_color: v })} />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={it.allow_download} onCheckedChange={(v) => update(i, { allow_download: v })} />
                <Label>Allow download</Label>
              </div>
            </div>
          </Card>
        );
      })}

      {items.length > 0 && (
        <Button onClick={upload} disabled={busy} size="lg" className="bg-gradient-primary">
          {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading…</> : <><Upload className="w-4 h-4 mr-2" /> Upload {items.length} PDF{items.length > 1 ? "s" : ""}</>}
        </Button>
      )}
    </div>
  );
}

/* ---------- Content Tab ---------- */
function ContentTab({ subjects, books, resources, onChange }: any) {
  const [editing, setEditing] = useState<any>(null);

  const del = async (r: any) => {
    if (!confirm(`Delete "${r.title}"?`)) return;
    await supabase.storage.from("pdfs").remove([r.pdf_path]);
    const { error } = await supabase.from("resources").delete().eq("id", r.id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); onChange(); }
  };

  const move = async (r: any, dir: -1 | 1) => {
    const peers = resources.filter((x: any) => x.subject_id === r.subject_id && x.book_id === r.book_id).sort((a:any,b:any)=>a.order_index-b.order_index);
    const idx = peers.findIndex((x: any) => x.id === r.id);
    const swap = peers[idx + dir];
    if (!swap) return;
    await supabase.from("resources").update({ order_index: swap.order_index }).eq("id", r.id);
    await supabase.from("resources").update({ order_index: r.order_index }).eq("id", swap.id);
    onChange();
  };

  const copyLink = (r: any) => {
    navigator.clipboard.writeText(`${window.location.origin}/read/${r.id}`);
    toast.success("Link copied!");
  };

  return (
    <div className="space-y-6">
      {subjects.map((s: any) => {
        const items = resources.filter((r: any) => r.subject_id === s.id);
        if (items.length === 0) return null;
        return (
          <Card key={s.id} className="overflow-hidden">
            <div className={`p-4 ${getColor(s.color).bg} ${getColor(s.color).text} flex items-center justify-between`}>
              <div className="flex items-center gap-2 font-semibold">
                <span className="text-2xl">{s.icon}</span> {s.name}
              </div>
              <Button size="sm" variant="ghost" className="text-current hover:bg-white/20" onClick={() => copyLink({ id: `subject/${s.id}`.replace("subject/","") })}
                      onClickCapture={() => { navigator.clipboard.writeText(`${window.location.origin}/subject/${s.id}`); toast.success("Subject link copied"); }}>
                <Link2 className="w-4 h-4 mr-1" /> Copy subject link
              </Button>
            </div>
            <div className="divide-y">
              {items.map((r: any) => {
                const book = books.find((b: any) => b.id === r.book_id);
                return (
                  <div key={r.id} className="p-4 flex items-center gap-3 flex-wrap">
                    <span className="text-2xl">{r.cover_emoji || "📄"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{r.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.content_type} {r.unit_number && `• ${r.unit_number}`} {book && `• in ${book.title}`}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => move(r, -1)}>↑</Button>
                      <Button size="sm" variant="ghost" onClick={() => move(r, 1)}>↓</Button>
                      <Button size="sm" variant="ghost" onClick={() => copyLink(r)}><Link2 className="w-4 h-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(r)}><Edit className="w-4 h-4" /></Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del(r)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}

      {resources.length === 0 && (
        <Card className="p-12 text-center text-muted-foreground">No content yet. Upload some PDFs!</Card>
      )}

      {editing && (
        <EditResourceDialog resource={editing} subjects={subjects} books={books} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChange(); }} />
      )}
    </div>
  );
}

function EditResourceDialog({ resource, subjects, books, onClose, onSaved }: any) {
  const [form, setForm] = useState({ ...resource });
  const subjectBooks = books.filter((b: any) => b.subject_id === form.subject_id);

  const save = async () => {
    const { error } = await supabase.from("resources").update({
      title: form.title,
      description: form.description,
      subject_id: form.subject_id,
      book_id: form.book_id || null,
      content_type: form.content_type,
      unit_number: form.unit_number,
      cover_emoji: form.cover_emoji,
      cover_color: form.cover_color,
      allow_download: form.allow_download,
    }).eq("id", form.id);
    if (error) toast.error(error.message); else { toast.success("Saved"); onSaved(); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Edit Resource</DialogTitle></DialogHeader>
        <div className="grid md:grid-cols-2 gap-4">
          <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div>
            <Label>Subject</Label>
            <Select value={form.subject_id} onValueChange={(v) => setForm({ ...form, subject_id: v, book_id: "" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{subjects.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.icon} {s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Book</Label>
            <Select value={form.book_id || "none"} onValueChange={(v) => setForm({ ...form, book_id: v === "none" ? null : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Standalone —</SelectItem>
                {subjectBooks.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Content Type</Label>
            <Select value={form.content_type} onValueChange={(v) => setForm({ ...form, content_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="full">Full Book</SelectItem>
                <SelectItem value="unit">Unit</SelectItem>
                <SelectItem value="part">Part / Chapter</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Unit Number</Label><Input value={form.unit_number || ""} onChange={(e) => setForm({ ...form, unit_number: e.target.value })} /></div>
          <div>
            <Label>Cover Emoji</Label>
            <Select value={form.cover_emoji || "📄"} onValueChange={(v) => setForm({ ...form, cover_emoji: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-60">{EMOJI_OPTIONS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2"><Label>Description</Label><Textarea value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div><Label>Cover Color</Label><ColorPicker value={form.cover_color || "indigo"} onChange={(v) => setForm({ ...form, cover_color: v })} /></div>
          <div className="flex items-center gap-2 pt-6"><Switch checked={form.allow_download} onCheckedChange={(v) => setForm({ ...form, allow_download: v })} /><Label>Allow download</Label></div>
        </div>
        <DialogFooter><Button onClick={save} className="bg-gradient-primary">Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Subjects Tab ---------- */
function SubjectsTab({ subjects, onChange }: any) {
  const [form, setForm] = useState({ name: "", icon: "📚", color: "indigo" });
  const [editing, setEditing] = useState<any>(null);

  const create = async () => {
    if (!form.name) return;
    const { error } = await supabase.from("subjects").insert({ ...form, order_index: subjects.length });
    if (error) toast.error(error.message);
    else { toast.success("Subject created"); setForm({ name: "", icon: "📚", color: "indigo" }); onChange(); }
  };

  const del = async (id: string) => {
    if (!confirm("Delete this subject and all its content?")) return;
    const { error } = await supabase.from("subjects").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); onChange(); }
  };

  const saveEdit = async () => {
    const { error } = await supabase.from("subjects").update({ name: editing.name, icon: editing.icon, color: editing.color }).eq("id", editing.id);
    if (error) toast.error(error.message); else { toast.success("Saved"); setEditing(null); onChange(); }
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><Plus className="w-4 h-4" /> New Subject</h3>
        <div className="grid md:grid-cols-4 gap-3">
          <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Select value={form.icon} onValueChange={(v) => setForm({ ...form, icon: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-60">{EMOJI_OPTIONS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
          </Select>
          <ColorPicker value={form.color} onChange={(v) => setForm({ ...form, color: v })} />
          <Button onClick={create} className="bg-gradient-primary">Create</Button>
        </div>
      </Card>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {subjects.map((s: any) => (
          <Card key={s.id} className="p-4 flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl ${getColor(s.color).bg} ${getColor(s.color).text} flex items-center justify-center text-2xl`}>{s.icon}</div>
            <div className="flex-1 min-w-0"><div className="font-medium truncate">{s.name}</div></div>
            <Button size="sm" variant="ghost" onClick={() => setEditing({ ...s })}><Edit className="w-4 h-4" /></Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del(s.id)}><Trash2 className="w-4 h-4" /></Button>
          </Card>
        ))}
      </div>

      {editing && (
        <Dialog open onOpenChange={() => setEditing(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit Subject</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div>
                <Label>Icon</Label>
                <Select value={editing.icon} onValueChange={(v) => setEditing({ ...editing, icon: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-60">{EMOJI_OPTIONS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Color</Label><ColorPicker value={editing.color} onChange={(v) => setEditing({ ...editing, color: v })} /></div>
            </div>
            <DialogFooter><Button onClick={saveEdit} className="bg-gradient-primary">Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/* ---------- Books Tab ---------- */
function BooksTab({ subjects, books, onChange }: any) {
  const [form, setForm] = useState({ subject_id: "", title: "", description: "" });

  const create = async () => {
    if (!form.subject_id || !form.title) { toast.error("Subject and title required"); return; }
    const peers = books.filter((b: any) => b.subject_id === form.subject_id);
    const { error } = await supabase.from("books").insert({ ...form, order_index: peers.length });
    if (error) toast.error(error.message); else { toast.success("Book created"); setForm({ subject_id: "", title: "", description: "" }); onChange(); }
  };

  const del = async (id: string) => {
    if (!confirm("Delete this book? Resources inside will become standalone.")) return;
    const { error } = await supabase.from("books").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); onChange(); }
  };

  if (subjects.length === 0) {
    return <Card className="p-8 text-center text-muted-foreground">Create a subject first.</Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><Plus className="w-4 h-4" /> New Book</h3>
        <div className="grid md:grid-cols-4 gap-3">
          <Select value={form.subject_id} onValueChange={(v) => setForm({ ...form, subject_id: v })}>
            <SelectTrigger><SelectValue placeholder="Subject" /></SelectTrigger>
            <SelectContent>{subjects.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.icon} {s.name}</SelectItem>)}</SelectContent>
          </Select>
          <Input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Input placeholder="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Button onClick={create} className="bg-gradient-primary">Create</Button>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {books.map((b: any) => {
          const s = subjects.find((x: any) => x.id === b.subject_id);
          return (
            <Card key={b.id} className="p-4 flex items-center gap-3">
              <span className="text-2xl">{s?.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{b.title}</div>
                <div className="text-xs text-muted-foreground">{s?.name}</div>
              </div>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del(b.id)}><Trash2 className="w-4 h-4" /></Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Settings ---------- */
function SettingsTab({ settings, onChange }: any) {
  const [form, setForm] = useState({ site_name: "", tagline: "" });
  useEffect(() => { if (settings) setForm({ site_name: settings.site_name, tagline: settings.tagline }); }, [settings]);

  const save = async () => {
    const { error } = await supabase.from("teacher_settings").update({ ...form, updated_at: new Date().toISOString() }).eq("id", settings.id);
    if (error) toast.error(error.message); else { toast.success("Saved"); onChange(); }
  };

  return (
    <Card className="p-6 max-w-xl space-y-4">
      <div><Label>Site Name</Label><Input value={form.site_name} onChange={(e) => setForm({ ...form, site_name: e.target.value })} /></div>
      <div><Label>Tagline</Label><Input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} /></div>
      <Button onClick={save} className="bg-gradient-primary">Save</Button>
    </Card>
  );
}

/* ---------- Color Picker ---------- */
function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {colorOptions.map((c) => (
        <button
          key={c.name}
          type="button"
          onClick={() => onChange(c.name)}
          className={`w-8 h-8 rounded-full ${c.bg} transition-smooth ${value === c.name ? "ring-2 ring-offset-2 ring-foreground scale-110" : "hover:scale-110"}`}
          aria-label={c.name}
        />
      ))}
    </div>
  );
}
