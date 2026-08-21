"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type PlayerHit = { id: string; name: string; team: string; position: string };
type TeamHit = { school: string; conference?: string; logo: string | null; color: string };

const SKILL = new Set(["WR", "TE", "RB", "FB"]);

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [players, setPlayers] = useState<PlayerHit[]>([]);
  const [teams, setTeams] = useState<TeamHit[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((v) => !v); }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30); }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setPlayers([]); setTeams([]); setLoading(false); return; }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        const d = await r.json();
        setPlayers(d.players || []); setTeams(d.teams || []);
      } catch { /* aborted */ }
      finally { setLoading(false); }
    }, 220);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  function go(url: string) { setOpen(false); setQ(""); router.push(url); }

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Search players and teams" title="Search (⌘K)"
        className="w-8 h-8 flex items-center justify-center rounded-full text-s-muted hover:text-s-text hover:bg-s-hover transition-colors">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4"
          style={{ background: "rgba(0,0,0,0.45)" }} onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            <div className="flex items-center gap-2 px-4 border-b" style={{ borderColor: "var(--color-border)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Search any player or team…"
                className="flex-1 bg-transparent outline-none py-3 text-sm" style={{ color: "var(--color-text)" }} />
              {loading && <span className="text-2xs text-s-muted">…</span>}
            </div>

            <div className="max-h-[55vh] overflow-y-auto">
              {teams.length > 0 && (
                <div className="py-1">
                  <div className="px-4 py-1 text-2xs uppercase tracking-wide text-s-muted font-bold">Teams</div>
                  {teams.map((t) => (
                    <button key={t.school} onClick={() => go(`/team/${encodeURIComponent(t.school)}`)}
                      className="w-full flex items-center gap-3 px-4 py-2 hover:bg-s-hover text-left transition-colors">
                      {t.logo ? <img src={t.logo} alt="" width={22} height={22} className="object-contain shrink-0" /> : <span style={{ width: 22 }} />}
                      <span className="text-sm font-semibold">{t.school}</span>
                      <span className="text-2xs text-s-muted ml-auto">{t.conference}</span>
                    </button>
                  ))}
                </div>
              )}
              {players.length > 0 && (
                <div className="py-1">
                  <div className="px-4 py-1 text-2xs uppercase tracking-wide text-s-muted font-bold">Players</div>
                  {players.map((p) => (
                    <button key={p.id + p.team} onClick={() => go(`/player/${p.id}?n=${encodeURIComponent(p.name)}&t=${encodeURIComponent(p.team)}&p=${encodeURIComponent(p.position)}`)}
                      className="w-full flex items-center gap-3 px-4 py-2 hover:bg-s-hover text-left transition-colors">
                      <span className="w-9 shrink-0 text-2xs font-bold text-center rounded px-1 py-0.5"
                        style={{ background: SKILL.has(p.position) ? "var(--color-accent)" : "var(--color-border)", color: SKILL.has(p.position) ? "#fff" : "var(--color-muted)" }}>
                        {p.position || "?"}
                      </span>
                      <span className="text-sm font-semibold truncate">{p.name}</span>
                      <span className="text-2xs text-s-muted ml-auto shrink-0">{p.team}</span>
                    </button>
                  ))}
                </div>
              )}
              {q.trim().length >= 2 && !loading && players.length === 0 && teams.length === 0 && (
                <div className="px-4 py-6 text-sm text-s-muted text-center">No players or teams found.</div>
              )}
              {q.trim().length < 2 && (
                <div className="px-4 py-6 text-2xs text-s-muted text-center">Type a name. Skill players (WR/TE/RB) get a field map; everyone gets career stats + EPA.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
