import "server-only";

// Live CollegeFootballData API client for the serverless routes. Nothing is
// persisted to disk — an in-memory TTL cache (per warm lambda) just avoids
// re-hitting the free tier for the same query.
const BASE = "https://api.collegefootballdata.com";
const TTL = 1000 * 60 * 60 * 12; // 12h

type Entry = { at: number; data: unknown };
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

export async function cfbd<T = unknown>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const key = process.env.CFBD_API_KEY;
  if (!key) throw new Error("CFBD_API_KEY not set");
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") qs.set(k, String(v));
  const url = `${BASE}${path}${qs.toString() ? `?${qs}` : ""}`;

  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.data as T;
  const pending = inflight.get(url);
  if (pending) return pending as Promise<T>;

  const p = (async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
          cache: "no-store", // bypass Next Data Cache (2MB limit); we cache in memory
        });
        if (res.status === 429) { await sleep(600 * (attempt + 1)); continue; }
        if (!res.ok) throw new Error(`CFBD ${path} -> ${res.status}`);
        const data = await res.json();
        cache.set(url, { at: Date.now(), data });
        return data;
      } catch (e) { lastErr = e; await sleep(300 * (attempt + 1)); }
    }
    throw lastErr instanceof Error ? lastErr : new Error(`CFBD ${path} failed`);
  })().finally(() => inflight.delete(url));

  inflight.set(url, p);
  return p as Promise<T>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const CURRENT_YEAR = new Date().getUTCFullYear();
export const FIRST_EPA_YEAR = 2013; // CFBD player PPA (EPA) coverage starts here
