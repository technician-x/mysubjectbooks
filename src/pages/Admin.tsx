import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  GraduationCap, BookOpen, UploadCloud, Settings as SettingsIcon, LogOut,
  FileText, Trash2, Edit, Loader2, CheckCircle2, Copy, Plus, ChevronUp, ChevronDown
} from "lucide-react";
import { toast } from "sonner";
import { colorOptions, getColor } from "@/lib/colorMap";

const EMOJI_OPTIONS = ["📚","📖","📕","📗","📘","📙","🧪","🔬","🧮","🌍","🎨","🎵","💻","⚛️","📐","🧠","✏️","🔭","🌱","⚙️"];

type Tab = "content" | "upload" | "settings";

export default function Admin() {
  const { user, isTeacher, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("content");

  const [subjects, setSubjects] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    if (!loading && (!user || !isTeacher)) navigate("/auth");
  }, [user, isTeacher, loading, navigate]);

  const refresh = async () => {
    const [{ data: s }, { data: r }, { data: ts }] = await Promise.all([
      supabase.from("subjects").select("*").order("order_index"),
      supabase.from("resources").select("*").order("order_index"),
      supabase.from("teacher_settings").select("*").limit(1).maybeSingle(),
    ]);
    setSubjects(s ?? []); setResources(r ?? []); setSettings(ts);
  };

  useEffect(() => { if (isTeacher) refresh(); }, [isTeacher]);

  if (loading || !isTeacher) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  const navItems: { id: Tab; label: string; icon: any }[] = [
    { id: "content", label: "My Content", icon: BookOpen },
    { id: "upload", label: "Upload", icon: UploadCloud },
    { id: "settings", label: "Settings", icon: SettingsIcon },
  ];

  return (
    <div className="min-h-screen bg-background flex animate-fade-in-fast">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-card sticky top-0 h-screen">
        <Link to="/" className="flex items-center gap-2 px-5 h-16 border-b border-border">
          <div className="w-9 h-9 rounded-card bg-gradient-primary flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-heading font-bold text-foreground">{settings?.site_name || "EduShelf"}</span>
        </Link>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-button text-sm font-medium transition-smooth press ${
                tab === item.id ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-border">
          <button
            onClick={() => signOut().then(() => navigate("/"))}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-button text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-smooth press"
          >
            <LogOut className="w-5 h-5" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 md:pb-0">
        {/* Mobile header */}
        <header className="md:hidden sticky top-0 z-20 bg-background/85 backdrop-blur border-b border-border h-16 flex items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-card bg-gradient-primary flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-heading font-bold">{settings?.site_name || "EduShelf"}</span>
          </Link>
          <button onClick={() => signOut().then(() => navigate("/"))} className="w-11 h-11 rounded-full hover:bg-muted flex items-center justify-center">
            <LogOut className="w-5 h-5" />
          </button>
        </header>

        <main className="flex-1 container mx-auto px-4 md:px-8 py-8 max-w-5xl w-full">
          {tab === "content" && <ContentTab subjects={subjects} resources={resources} settings={settings} onChange={refresh} />}
          {tab === "upload" && <UploadTab subjects={subjects} onDone={refresh} />}
          {tab === "settings" && <SettingsTab settings={settings} onChange={refresh} />}
        </main>

        {/* Mobile bottom tab bar */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-card border-t border-border h-16 flex">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-xs font-medium press ${
                tab === item.id ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

/* ============================================================
   CONTENT TAB — Dashboard stats + accordion of subjects
   ============================================================ */
function ContentTab({ subjects, resources, settings, onChange }: any) {
  const [editing, setEditing] = useState<any>(null);

  const stats = useMemo(() => {
    const lastUpload = resources.reduce((acc: any, r: any) => {
      const d = r.created_at ? new Date(r.created_at) : null;
      if (!d) return acc;
      if (!acc || d > acc) return d;
      return acc;
    }, null as Date | null);
    return {
      subjectCount: subjects.length,
      pdfCount: resources.length,
      lastUpload: lastUpload ? lastUpload.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—",
    };
  }, [subjects, resources]);

  const del = async (r: any) => {
    if (!confirm(`Delete "${r.title}"?`)) return;
    if (r.pdf_path) await supabase.storage.from("pdfs").remove([r.pdf_path]);
    const { error } = await supabase.from("resources").delete().eq("id", r.id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); onChange(); }
  };

  const move = async (r: any, dir: -1 | 1) => {
    const peers = resources.filter((x: any) => x.subject_id === r.subject_id).sort((a: any, b: any) => a.order_index - b.order_index);
    const idx = peers.findIndex((x: any) => x.id === r.id);
    const swap = peers[idx + dir];
    if (!swap) return;
    await supabase.from("resources").update({ order_index: swap.order_index }).eq("id", r.id);
    await supabase.from("resources").update({ order_index: r.order_index }).eq("id", swap.id);
    onChange();
  };

  const typeBadge = (t: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      full: { label: "Full Book", cls: "bg-primary-soft text-primary" },
      unit: { label: "Unit", cls: "bg-emerald-100 text-emerald-700" },
      part: { label: "Chapter", cls: "bg-amber-100 text-amber-700" },
    };
    return map[t] ?? { label: t, cls: "bg-muted text-muted-foreground" };
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading font-bold text-3xl text-foreground mb-1">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Manage your subjects and uploaded PDFs.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 sm:gap-5">
        <StatCard label="Subjects" value={stats.subjectCount} icon={BookOpen} />
        <StatCard label="PDFs" value={stats.pdfCount} icon={FileText} />
        <StatCard label="Last Upload" value={stats.lastUpload} icon={UploadCloud} small />
      </div>

      {/* Content list */}
      <div>
        <h2 className="font-heading font-bold text-xl text-foreground mb-3">My Content</h2>
        {subjects.length === 0 ? (
          <Card className="p-12 text-center border-dashed">
            <BookOpen className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground mb-4">No subjects yet. Upload your first PDF to get started.</p>
          </Card>
        ) : (
          <Accordion type="multiple" defaultValue={subjects.map((s: any) => s.id)} className="space-y-3">
            {subjects.map((s: any) => {
              const items = resources.filter((r: any) => r.subject_id === s.id);
              const color = getColor(s.color);
              return (
                <AccordionItem key={s.id} value={s.id} className="border-0">
                  <Card className="overflow-hidden p-0">
                    <AccordionTrigger className="hover:no-underline px-5 py-4 [&[data-state=open]]:border-b [&[data-state=open]]:border-border">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`w-10 h-10 rounded-input ${color.bg} flex items-center justify-center text-xl flex-shrink-0`}>
                          {s.icon}
                        </div>
                        <div className="text-left flex-1 min-w-0">
                          <div className="font-heading font-semibold text-foreground truncate">{s.name}</div>
                          <div className="text-xs text-muted-foreground">{items.length} PDF{items.length === 1 ? "" : "s"}</div>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      {items.length === 0 ? (
                        <div className="p-5 text-sm text-muted-foreground text-center">No PDFs in this subject yet.</div>
                      ) : (
                        <div className="divide-y divide-border">
                          {items.map((r: any, i: number) => {
                            const badge = typeBadge(r.content_type);
                            return (
                              <div key={r.id} className="px-5 py-3 flex items-center gap-3 flex-wrap hover:bg-muted/40 transition-smooth">
                                <span className="text-xl flex-shrink-0">{r.cover_emoji || "📄"}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-foreground truncate">{r.title}</div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                                    {r.unit_number && <span className="text-xs text-muted-foreground">{r.unit_number}</span>}
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => move(r, -1)} disabled={i === 0}><ChevronUp className="w-4 h-4" /></Button>
                                  <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => move(r, 1)} disabled={i === items.length - 1}><ChevronDown className="w-4 h-4" /></Button>
                                  <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setEditing(r)} aria-label="Edit"><Edit className="w-4 h-4" /></Button>
                                  <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive hover:text-destructive" onClick={() => del(r)} aria-label="Delete"><Trash2 className="w-4 h-4" /></Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </AccordionContent>
                  </Card>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </div>

      {editing && (
        <EditResourceDialog
          resource={editing}
          subjects={subjects}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChange(); }}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, small }: { label: string; value: any; icon: any; small?: boolean }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-input bg-primary-soft text-primary flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className={`font-heading font-bold text-foreground truncate ${small ? "text-base" : "text-2xl"}`}>{value}</div>
        </div>
      </div>
    </Card>
  );
}

/* ============================================================
   UPLOAD TAB — drag & drop + single simple form
   ============================================================ */
function UploadTab({ subjects, onDone }: { subjects: any[]; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<{ link: string; title: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [subjectId, setSubjectId] = useState<string>("");
  const [showNewSubject, setShowNewSubject] = useState(false);
  const [newSubject, setNewSubject] = useState({ name: "", icon: "📚", color: "indigo" });

  const [title, setTitle] = useState("");
  const [contentType, setContentType] = useState<"full" | "unit" | "part">("unit");
  const [unitNumber, setUnitNumber] = useState("");
  const [description, setDescription] = useState("");
  const [allowDownload, setAllowDownload] = useState(true);

  const onPickFile = (f: File | null) => {
    if (!f) return;
    if (f.type !== "application/pdf") { toast.error("Please select a PDF file"); return; }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.pdf$/i, ""));
    setSuccess(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onPickFile(f);
  };

  const createSubject = async () => {
    if (!newSubject.name.trim()) { toast.error("Subject name required"); return; }
    const { data, error } = await supabase.from("subjects").insert({
      name: newSubject.name.trim(), icon: newSubject.icon, color: newSubject.color,
      order_index: subjects.length,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    toast.success("Subject created");
    setShowNewSubject(false);
    setNewSubject({ name: "", icon: "📚", color: "indigo" });
    setSubjectId(data.id);
    onDone();
  };

  const upload = async () => {
    if (!file) { toast.error("Please select a PDF"); return; }
    if (!subjectId) { toast.error("Please choose a subject"); return; }
    if (!title.trim()) { toast.error("Title required"); return; }
    setBusy(true);
    try {
      const path = `${subjectId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("pdfs").upload(path, file, { contentType: "application/pdf" });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("pdfs").getPublicUrl(path);
      const peers = await supabase.from("resources").select("id").eq("subject_id", subjectId);
      const orderIndex = (peers.data?.length ?? 0);
      const { data: inserted, error: insErr } = await supabase.from("resources").insert({
        subject_id: subjectId,
        title: title.trim(),
        description: description.trim() || null,
        content_type: contentType,
        unit_number: contentType !== "full" ? (unitNumber.trim() || null) : null,
        pdf_url: publicUrl,
        pdf_path: path,
        allow_download: allowDownload,
        cover_emoji: "📄",
        cover_color: "indigo",
        order_index: orderIndex,
      }).select().single();
      if (insErr) throw insErr;
      const link = `${window.location.origin}/read/${inserted.id}`;
      setSuccess({ link, title: title.trim() });
      // reset form
      setFile(null); setTitle(""); setUnitNumber(""); setDescription("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(false); }
  };

  const copyLink = async () => {
    if (!success) return;
    await navigator.clipboard.writeText(success.link);
    toast.success("Link copied!");
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="font-heading font-bold text-3xl text-foreground mb-1">Upload PDF</h1>
        <p className="text-muted-foreground text-sm">Add a new resource for your students.</p>
      </div>

      {/* Drag & drop zone */}
      <Card
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`p-10 text-center cursor-pointer border-2 border-dashed transition-all ${
          dragOver ? "border-primary bg-primary-soft" : "border-border hover:border-primary/50"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
        />
        <UploadCloud className={`w-14 h-14 mx-auto mb-4 transition-colors ${dragOver ? "text-primary" : "text-muted-foreground"}`} />
        <p className="font-heading font-semibold text-foreground mb-1">Drop your PDF here or click to browse</p>
        <p className="text-sm text-muted-foreground">PDF files only · Max 50 MB</p>
      </Card>

      {/* File preview */}
      {file && (
        <Card className="p-4 flex items-center gap-3 animate-fade-in">
          <div className="w-10 h-10 rounded-input bg-primary-soft text-primary flex items-center justify-center">
            <FileText className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{file.name}</div>
            <div className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setFile(null)} aria-label="Remove"><Trash2 className="w-4 h-4" /></Button>
        </Card>
      )}

      {/* Form */}
      {file && (
        <Card className="p-6 space-y-5 animate-fade-in">
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Select value={subjectId} onValueChange={(v) => v === "__new__" ? setShowNewSubject(true) : setSubjectId(v)}>
              <SelectTrigger><SelectValue placeholder="Choose a subject" /></SelectTrigger>
              <SelectContent>
                {subjects.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.icon} {s.name}</SelectItem>
                ))}
                <SelectItem value="__new__"><span className="text-primary font-medium">+ New Subject</span></SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Algebra Basics" />
          </div>

          <div className="space-y-1.5">
            <Label>Content Type</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["full","unit","part"] as const).map((t) => {
                const labels = { full: "Full Book", unit: "Unit", part: "Chapter / Part" };
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setContentType(t)}
                    className={`h-12 rounded-button border text-sm font-medium press transition-smooth ${
                      contentType === t ? "border-primary bg-primary-soft text-primary" : "border-border bg-card text-foreground hover:border-primary/40"
                    }`}
                  >
                    {labels[t]}
                  </button>
                );
              })}
            </div>
          </div>

          {contentType !== "full" && (
            <div className="space-y-1.5 animate-fade-in">
              <Label htmlFor="unit">Unit / Part Number</Label>
              <Input id="unit" value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} placeholder="e.g. Unit 3" />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="description">Short Description (optional)</Label>
            <Textarea id="description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A short note for students…" />
          </div>

          <div className="flex items-center justify-between py-2">
            <Label htmlFor="allow-download" className="cursor-pointer">Allow students to download?</Label>
            <Switch id="allow-download" checked={allowDownload} onCheckedChange={setAllowDownload} />
          </div>

          <Button onClick={upload} disabled={busy} size="lg" className="w-full">
            {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading…</> : <>Upload & Publish</>}
          </Button>
        </Card>
      )}

      {/* Success banner */}
      {success && (
        <Card className="p-5 bg-success/10 border-success/30 animate-scale-in">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-success text-success-foreground flex items-center justify-center animate-check-pop">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-heading font-semibold text-foreground">Published!</div>
              <div className="text-sm text-muted-foreground truncate">"{success.title}" is now live.</div>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-card rounded-input border border-border p-2">
            <code className="flex-1 text-xs text-muted-foreground truncate px-2">{success.link}</code>
            <Button size="sm" onClick={copyLink}><Copy className="w-3.5 h-3.5 mr-1" /> Copy Link</Button>
          </div>
        </Card>
      )}

      {/* New subject dialog */}
      <Dialog open={showNewSubject} onOpenChange={setShowNewSubject}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-heading">New Subject</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={newSubject.name} onChange={(e) => setNewSubject({ ...newSubject, name: e.target.value })} placeholder="e.g. Mathematics" />
            </div>
            <div className="space-y-1.5">
              <Label>Icon</Label>
              <div className="flex flex-wrap gap-2">
                {EMOJI_OPTIONS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setNewSubject({ ...newSubject, icon: e })}
                    className={`w-10 h-10 rounded-input text-xl press transition-smooth ${newSubject.icon === e ? "bg-primary-soft ring-2 ring-primary" : "bg-muted hover:bg-muted/70"}`}
                  >{e}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {colorOptions.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => setNewSubject({ ...newSubject, color: c.name })}
                    className={`w-9 h-9 rounded-full ${c.bg} press transition-smooth ${newSubject.color === c.name ? "ring-2 ring-offset-2 ring-foreground scale-110" : ""}`}
                    aria-label={c.name}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowNewSubject(false)}>Cancel</Button>
            <Button onClick={createSubject}><Plus className="w-4 h-4 mr-1" /> Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============================================================
   EDIT RESOURCE DIALOG
   ============================================================ */
function EditResourceDialog({ resource, subjects, onClose, onSaved }: any) {
  const [form, setForm] = useState({ ...resource });

  const save = async () => {
    const { error } = await supabase.from("resources").update({
      title: form.title,
      description: form.description || null,
      subject_id: form.subject_id,
      content_type: form.content_type,
      unit_number: form.unit_number || null,
      cover_emoji: form.cover_emoji || "📄",
      allow_download: form.allow_download,
    }).eq("id", form.id);
    if (error) toast.error(error.message); else { toast.success("Saved"); onSaved(); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-heading">Edit Resource</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Select value={form.subject_id} onValueChange={(v) => setForm({ ...form, subject_id: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {subjects.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.icon} {s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Content Type</Label>
            <Select value={form.content_type} onValueChange={(v) => setForm({ ...form, content_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="full">Full Book</SelectItem>
                <SelectItem value="unit">Unit</SelectItem>
                <SelectItem value="part">Chapter / Part</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.content_type !== "full" && (
            <div className="space-y-1.5">
              <Label>Unit / Part Number</Label>
              <Input value={form.unit_number || ""} onChange={(e) => setForm({ ...form, unit_number: e.target.value })} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea rows={2} value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="flex items-center justify-between py-1">
            <Label className="cursor-pointer">Allow download</Label>
            <Switch checked={form.allow_download} onCheckedChange={(v) => setForm({ ...form, allow_download: v })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
   SETTINGS TAB
   ============================================================ */
function SettingsTab({ settings, onChange }: any) {
  const { user } = useAuth();
  const [form, setForm] = useState({ site_name: "", tagline: "", teacher_name: "" });
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settings) setForm({
      site_name: settings.site_name || "",
      tagline: settings.tagline || "",
      teacher_name: settings.teacher_name || "",
    });
  }, [settings]);

  const save = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.from("teacher_settings").update({
        site_name: form.site_name,
        tagline: form.tagline,
        teacher_name: form.teacher_name,
        updated_at: new Date().toISOString(),
      }).eq("id", settings.id);
      if (error) throw error;

      if (password.trim().length >= 6) {
        const { error: pErr } = await supabase.auth.updateUser({ password });
        if (pErr) throw pErr;
        setPassword("");
      }
      toast.success("Settings saved");
      onChange();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="font-heading font-bold text-3xl text-foreground mb-1">Settings</h1>
        <p className="text-muted-foreground text-sm">Customize your site and account.</p>
      </div>
      <Card className="p-6 space-y-5">
        <div className="space-y-1.5">
          <Label>Site Name</Label>
          <Input value={form.site_name} onChange={(e) => setForm({ ...form, site_name: e.target.value })} placeholder="EduShelf" />
        </div>
        <div className="space-y-1.5">
          <Label>Tagline</Label>
          <Input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} placeholder="Learn anywhere, anytime." />
        </div>
        <div className="space-y-1.5">
          <Label>Your Name</Label>
          <Input value={form.teacher_name} onChange={(e) => setForm({ ...form, teacher_name: e.target.value })} placeholder="Mr. / Ms. ..." />
        </div>
        <div className="space-y-1.5">
          <Label>Change Password</Label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Leave blank to keep current" minLength={6} />
          <p className="text-xs text-muted-foreground">Signed in as {user?.email}</p>
        </div>
        <Button onClick={save} disabled={busy} size="lg" className="w-full">
          {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : "Save Changes"}
        </Button>
      </Card>
    </div>
  );
}
