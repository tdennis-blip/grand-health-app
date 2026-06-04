"use client";

import { useState, useTransition, useRef } from "react";
import { Plus, Trash2, Dumbbell, Sparkles, Video, Upload, X, CheckCircle, Loader } from "lucide-react";
import { createExercise, updateExercise, deleteExercise } from "./actions";

type Kind = "strength" | "mobility";

export type LibExercise = {
  id: string;
  kind: Kind;
  name: string;
  primaryArea: string | null;
  coachNote: string | null;
  videoTitle: string | null;
  videoLength: string | null;
  videoUrl: string | null;
  videoPublicId: string | null;
};

export function ExercisesClient({ initial }: { initial: LibExercise[] }) {
  const [editing, setEditing] = useState<LibExercise | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Saved exercises</div>
            <div className="text-[11px] text-slate-500">{initial.length} total</div>
          </div>
          <button
            onClick={() => setEditing({
              id: "",
              kind: "strength",
              name: "",
              primaryArea: "",
              coachNote: "",
              videoTitle: "",
              videoLength: "",
              videoUrl: "",
              videoPublicId: "",
            })}
            className="text-xs font-semibold bg-teal-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-teal-800"
          >
            <Plus size={13} /> New exercise
          </button>
        </div>

        {initial.length === 0 ? (
          <div className="text-sm text-slate-500 italic py-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
            No exercises yet. Add your first one.
          </div>
        ) : (
          <div className="space-y-2">
            {initial.map((ex) => <ExerciseRow key={ex.id} ex={ex} onEdit={() => setEditing(ex)} pending={pending} startTransition={startTransition} />)}
          </div>
        )}
      </section>

      {editing && (
        <ExerciseDrawer
          ex={editing}
          pending={pending}
          onClose={() => setEditing(null)}
          onSave={(form) => {
            startTransition(async () => {
              if (editing.id) {
                await updateExercise({ ...form, id: editing.id });
              } else {
                await createExercise(form);
              }
              setEditing(null);
            });
          }}
        />
      )}
    </>
  );
}

function ExerciseRow({
  ex,
  onEdit,
  pending,
  startTransition,
}: {
  ex: LibExercise;
  onEdit: () => void;
  pending: boolean;
  startTransition: React.TransitionStartFunction;
}) {
  const isMobility = ex.kind === "mobility";
  const Icon = isMobility ? Sparkles : Dumbbell;
  const tile = isMobility ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700";
  const badge = isMobility ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-blue-50 text-blue-700 border-blue-200";
  const hover = isMobility ? "hover:border-amber-300" : "hover:border-teal-300";
  return (
    <div className={`bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-3 transition ${hover}`}>
      <div className={`w-10 h-10 rounded-lg ${tile} flex items-center justify-center flex-shrink-0`}>
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <div className="text-sm font-semibold text-slate-900 truncate">{ex.name}</div>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${badge}`}>
            {isMobility ? "Mobility" : "Strength"}
          </span>
        </div>
        <div className="text-[11px] text-slate-500 truncate flex items-center gap-2">
          {ex.primaryArea && <span>{ex.primaryArea}</span>}
          {ex.videoTitle && (
            <span className="flex items-center gap-1 text-violet-700">
              <Video size={11} /> {ex.videoLength || "video"}
            </span>
          )}
        </div>
      </div>
      <button onClick={onEdit} className="text-[11px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-lg">Edit</button>
      <button
        onClick={() => {
          if (!confirm(`Delete "${ex.name}"?`)) return;
          startTransition(() => deleteExercise(ex.id));
        }}
        disabled={pending}
        className="text-[11px] font-semibold text-rose-600 bg-white border border-rose-200 px-2.5 py-1 rounded-lg"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function ExerciseDrawer({
  ex,
  pending,
  onClose,
  onSave,
}: {
  ex: LibExercise;
  pending: boolean;
  onClose: () => void;
  onSave: (form: Omit<LibExercise, "id">) => void;
}) {
  const [form, setForm] = useState<Omit<LibExercise, "id">>({
    kind: ex.kind,
    name: ex.name,
    primaryArea: ex.primaryArea ?? "",
    coachNote: ex.coachNote ?? "",
    videoTitle: ex.videoTitle ?? "",
    videoLength: ex.videoLength ?? "",
    videoUrl: ex.videoUrl ?? "",
    videoPublicId: ex.videoPublicId ?? "",
  });
  const valid = form.name.trim().length > 0;
  const isMobility = form.kind === "mobility";

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/40 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">{ex.id ? "Edit exercise" : "New exercise"}</div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700 text-sm">Cancel</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mb-1.5">Exercise type</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "strength" as const, label: "Strength", Icon: Dumbbell, active: "bg-blue-50 text-blue-800 border-blue-300" },
                { id: "mobility" as const, label: "Mobility", Icon: Sparkles, active: "bg-amber-50 text-amber-800 border-amber-300" },
              ].map((opt) => {
                const Icon = opt.Icon;
                const active = form.kind === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, kind: opt.id }))}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition ${
                      active ? opt.active : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <Icon size={15} />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="Name" value={form.name} onChange={(v) => setForm((p) => ({ ...p, name: v }))} placeholder={isMobility ? "Cat–Cow" : "Barbell Bench Press"} />
          <Field label={isMobility ? "Primary area / joint" : "Primary area / muscle"} value={form.primaryArea ?? ""} onChange={(v) => setForm((p) => ({ ...p, primaryArea: v }))} placeholder={isMobility ? "T-spine" : "Chest"} />
          <FieldTextarea label="Coach note" value={form.coachNote ?? ""} onChange={(v) => setForm((p) => ({ ...p, coachNote: v }))} placeholder={isMobility ? "Slow segmental flexion + extension." : "Pause 1s on chest. RPE 8."} />

          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-3">
            <div className="flex items-center gap-2">
              <Video size={14} className="text-violet-700" />
              <div className="text-[11px] uppercase tracking-wide text-slate-600 font-semibold">Attached video</div>
            </div>
            <VideoUpload
              videoUrl={form.videoUrl ?? ""}
              videoTitle={form.videoTitle ?? ""}
              videoLength={form.videoLength ?? ""}
              onUploaded={(url, publicId, duration) =>
                setForm((p) => ({
                  ...p,
                  videoUrl: url,
                  videoPublicId: publicId,
                  videoLength: duration ?? p.videoLength,
                  videoTitle: p.videoTitle || "",
                }))
              }
              onClear={() => setForm((p) => ({ ...p, videoUrl: "", videoPublicId: "", videoLength: "" }))}
            />
            <Field label="Title" value={form.videoTitle ?? ""} onChange={(v) => setForm((p) => ({ ...p, videoTitle: v }))} placeholder="Bench press form · Dr. Kettler" />
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-sm text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-50">Cancel</button>
          <button
            onClick={() => valid && onSave({ ...form, name: form.name.trim() })}
            disabled={!valid || pending}
            className={`text-sm font-semibold px-4 py-2 rounded-lg ${
              valid && !pending ? "bg-teal-700 text-white hover:bg-teal-800" : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
          >
            {pending ? "Saving…" : "Save exercise"}
          </button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Cloudinary video upload
// ---------------------------------------------------------------------------

function VideoUpload({
  videoUrl,
  videoTitle,
  videoLength,
  onUploaded,
  onClear,
}: {
  videoUrl: string;
  videoTitle: string;
  videoLength: string;
  onUploaded: (url: string, publicId: string, duration: string | null) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("video/")) {
      setError("Please select a video file.");
      return;
    }
    setError(null);
    setUploading(true);
    setProgress(0);

    try {
      // 1. Get a signed upload signature from our server.
      const signRes = await fetch("/api/cloudinary/sign", { method: "POST" });
      if (!signRes.ok) throw new Error("Could not get upload signature.");
      const { signature, timestamp, apiKey, cloudName, folder } = await signRes.json();

      // 2. Upload directly to Cloudinary.
      const body = new FormData();
      body.append("file", file);
      body.append("api_key", apiKey);
      body.append("timestamp", String(timestamp));
      body.append("signature", signature);
      body.append("folder", folder);

      // Use XHR for upload progress.
      const result = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error(`Upload failed: ${xhr.statusText}`));
          }
        };
        xhr.onerror = () => reject(new Error("Network error during upload."));
        xhr.send(body);
      });

      const duration = result.duration ? formatDuration(result.duration) : null;
      onUploaded(result.secure_url, result.public_id, duration);
    } catch (e: any) {
      setError(e?.message ?? "Upload failed.");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  if (videoUrl) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
          <CheckCircle size={14} className="text-violet-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold text-violet-800 truncate">Video uploaded</div>
            {videoLength && <div className="text-[10px] text-violet-600">{videoLength}</div>}
          </div>
          <button
            type="button"
            onClick={onClear}
            className="text-rose-600 hover:text-rose-700 flex-shrink-0"
            title="Remove video"
          >
            <X size={14} />
          </button>
        </div>
        <video
          src={videoUrl}
          controls
          className="w-full rounded-lg border border-slate-200 max-h-48 bg-black"
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
      {uploading ? (
        <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-2.5">
          <Loader size={14} className="text-violet-600 animate-spin flex-shrink-0" />
          <div className="flex-1">
            <div className="text-[11px] text-slate-600 font-semibold">Uploading… {progress}%</div>
            <div className="mt-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 border border-dashed border-violet-300 hover:border-violet-500 bg-violet-50 hover:bg-violet-100 text-violet-700 text-[12px] font-semibold rounded-lg py-3 transition"
        >
          <Upload size={14} /> Upload video to Cloudinary
        </button>
      )}
      {error && <div className="text-[11px] text-rose-600">{error}</div>}
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
      />
    </label>
  );
}

function FieldTextarea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{label}</span>
      <textarea
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
      />
    </label>
  );
}
