"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Send, ArrowRight, Check, CheckCheck, UserCircle } from "lucide-react";
import type { Message, ParticipantProfile } from "@/lib/messages-shared";
import { displayName } from "@/lib/messages-shared";
import { sendMessageToPatient, markThreadRead } from "../actions";

type ClinicianLite = { id: string; firstName: string | null; lastName: string | null };

export function ClinicianThreadClient({
  meId,
  patientId,
  clinicians,
  initialMessages,
  initialParticipants,
}: {
  meId: string;
  patientId: string;
  clinicians: ClinicianLite[];
  initialMessages: Message[];
  initialParticipants: Record<string, ParticipantProfile>;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [participants, setParticipants] = useState(initialParticipants);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    markThreadRead({ patientId }).catch(() => {});
  }, [patientId]);

  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    const after = lastMsg?.createdAt ?? new Date().toISOString();
    const es = new EventSource(`/api/messages/stream?patientId=${patientId}&after=${encodeURIComponent(after)}`);

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as { type: string; data: Message };
        if (event.type === "message") {
          setMessages((prev) => {
            if (prev.some((m) => m.id === event.data.id)) {
              return prev.map((m) => m.id === event.data.id ? event.data : m);
            }
            return [...prev, event.data];
          });
          if (event.data.recipientId === meId) {
            markThreadRead({ patientId }).catch(() => {});
          }
        }
      } catch {
        // ignore
      }
    };

    return () => es.close();
  }, [patientId, meId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Backfill participant names for clinic teammates so message labels render.
  useEffect(() => {
    setParticipants((prev) => {
      const next = { ...prev };
      clinicians.forEach((c) => {
        if (!next[c.id]) next[c.id] = { id: c.id, firstName: c.firstName, lastName: c.lastName, role: "clinician" };
      });
      return next;
    });
  }, [clinicians]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const groups = useMemo(() => groupByDay(messages), [messages]);

  const send = () => {
    const text = draft.trim();
    if (!text || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        await sendMessageToPatient({ patientId, body: text });
        setDraft("");
      } catch (e: any) {
        setError(e?.message ?? "Failed to send");
      }
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 flex flex-col h-[70vh] min-h-[480px]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-slate-500 text-sm italic py-8">
            No messages yet. Send the first one below.
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.day} className="space-y-2">
              <div className="text-center">
                <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold bg-slate-100 px-2 py-0.5 rounded-full">
                  {g.day}
                </span>
              </div>
              {g.messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  meId={meId}
                  participants={participants}
                />
              ))}
            </div>
          ))
        )}
      </div>

      <div className="border-t border-slate-200 p-3 space-y-2">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Message the patient…"
            rows={2}
            maxLength={4000}
            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500 resize-none"
          />
          <button
            onClick={send}
            disabled={!draft.trim() || pending}
            className={`text-sm font-semibold px-3 py-2 rounded-lg flex items-center gap-1.5 ${
              draft.trim() && !pending
                ? "bg-teal-700 text-white hover:bg-teal-800"
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
          >
            <Send size={14} />
            <span className="hidden sm:inline">{pending ? "Sending…" : "Send"}</span>
          </button>
        </div>
        {error && <div className="text-[11px] text-rose-600">{error}</div>}
        <div className="text-[10px] text-slate-400">⌘/Ctrl-Enter to send. Replies go directly to the patient.</div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  meId,
  participants,
}: {
  message: Message;
  meId: string;
  participants: Record<string, ParticipantProfile>;
}) {
  const isMine = message.senderId === meId;
  const fromPatient = message.senderRole === "patient";
  const sender = participants[message.senderId];
  const recipient = participants[message.recipientId];
  // Highlight when a patient-sent message is addressed to ME vs a teammate.
  const addressedToMe = fromPatient && message.recipientId === meId;
  const addressedToTeammate = fromPatient && message.recipientId !== meId;

  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] flex flex-col gap-0.5 ${isMine ? "items-end" : "items-start"}`}>
        <div className="text-[10px] text-slate-500 flex items-center gap-1.5 px-1">
          {fromPatient && (
            <span className="font-semibold text-slate-700 flex items-center gap-1">
              <UserCircle size={11} /> {displayName(sender)}
            </span>
          )}
          {!fromPatient && !isMine && (
            <span className="font-semibold text-slate-700">{displayName(sender)}</span>
          )}
          {(addressedToMe || addressedToTeammate || (isMine && message.recipientId !== meId)) && (
            <span className={`flex items-center gap-0.5 ${addressedToMe ? "text-teal-700" : "text-slate-400"}`}>
              <ArrowRight size={9} />
              <span className="font-medium">
                {addressedToMe ? "You" : displayName(recipient)}
              </span>
            </span>
          )}
        </div>

        <div
          className={`px-3 py-2 rounded-2xl text-sm leading-snug whitespace-pre-wrap break-words ${
            isMine
              ? "bg-teal-700 text-white rounded-br-sm"
              : addressedToMe
              ? "bg-teal-50 text-slate-900 border border-teal-200 rounded-bl-sm"
              : addressedToTeammate
              ? "bg-slate-50 text-slate-900 border border-slate-200 rounded-bl-sm"
              : "bg-slate-100 text-slate-900 rounded-bl-sm"
          }`}
        >
          {message.body}
        </div>

        <div className={`text-[10px] text-slate-400 flex items-center gap-1 px-1 ${isMine ? "justify-end" : "justify-start"}`}>
          <span>{formatTime(message.createdAt)}</span>
          {isMine && (
            <span className="flex items-center text-slate-400">
              {message.recipientReadAt ? <CheckCheck size={11} /> : <Check size={11} />}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function groupByDay(msgs: Message[]): Array<{ day: string; messages: Message[] }> {
  const out: Array<{ day: string; messages: Message[] }> = [];
  let currentKey = "";
  msgs.forEach((m) => {
    const key = dayKey(m.createdAt);
    if (key !== currentKey) {
      out.push({ day: key, messages: [] });
      currentKey = key;
    }
    out[out.length - 1].messages.push(m);
  });
  return out;
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((today.getTime() - that.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: today.getFullYear() === d.getFullYear() ? undefined : "numeric" });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
