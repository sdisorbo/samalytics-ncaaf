// Render a player's field/depth map to a branded, shareable PNG.
type Play = { type: "rec" | "rush" | "pass"; yards: number; ppa: number; td: boolean };
type Opts = {
  name: string; position: string; team: string; season: number;
  typeLabel: string; metric: "volume" | "epa" | "yards";
  headshot: string | null; teamLogo: string | null; teamColor: string;
  plays: Play[]; stats: { plays: number; avgDepth: number; epaPerPlay: number };
  stuffed: { pct: number; s: number; n: number } | null;
};

const TEXT = "#1C1220", MUTED = "#6E6472", BORDER = "#E9E1E7", BG = "#FFFFFF", BERRY = "#932F6D";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const Y_MIN = -10, Y_MAX = 60, STEP = 5;
const METRIC_LABEL: Record<string, string> = { volume: "% of plays", epa: "avg EPA", yards: "avg yards" };

function loadImg(src: string | null): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    if (!src) return res(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}
const hash = (i: number) => { const x = Math.sin(i * 91.7 + 13.1) * 43758.5; return x - Math.floor(x); };
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, x: number, y: number, box: number) {
  if (!img || !img.width) return;
  const s = Math.min(box / img.width, box / img.height), w = img.width * s, h = img.height * s;
  ctx.drawImage(img, x + (box - w) / 2, y + (box - h) / 2, w, h);
}

export async function depthMapPng(o: Opts): Promise<Blob> {
  const [head, logo, brand] = await Promise.all([
    loadImg(o.headshot), loadImg(o.teamLogo), loadImg("/samalytics_ncaaf_logo.png"),
  ]);

  // band aggregates (mirror DepthMap)
  const nb = (Y_MAX - Y_MIN) / STEP;
  const band = Array.from({ length: nb }, () => ({ n: 0, epa: 0, yds: 0 }));
  for (const p of o.plays) {
    let i = Math.floor((Math.max(Y_MIN, Math.min(Y_MAX - 0.001, p.yards)) - Y_MIN) / STEP);
    i = Math.max(0, Math.min(nb - 1, i));
    band[i].n++; band[i].epa += p.ppa; band[i].yds += p.yards;
  }
  const maxN = Math.max(1, ...band.map((b) => b.n));
  const avgEpa = band.map((b) => (b.n ? b.epa / b.n : 0));
  const maxAbsEpa = Math.max(0.001, ...avgEpa.map(Math.abs));
  const avgYds = band.map((b) => (b.n ? b.yds / b.n : 0));
  const maxYds = Math.max(0.001, ...avgYds.map((v) => Math.abs(v)));
  const heat = (i: number): string => {
    const b = band[i]; if (!b.n) return "transparent";
    if (o.metric === "epa") { const a = avgEpa[i]; return a >= 0 ? `rgba(214,73,91,${0.12 + 0.68 * a / maxAbsEpa})` : `rgba(80,110,190,${0.12 + 0.55 * -a / maxAbsEpa})`; }
    const t = o.metric === "volume" ? b.n / maxN : Math.abs(avgYds[i]) / maxYds;
    return `rgba(214,73,91,${0.1 + 0.7 * t})`;
  };

  const S = 2, W = 430, H = 560, P = 22;
  const cv = document.createElement("canvas");
  cv.width = W * S; cv.height = H * S;
  const ctx = cv.getContext("2d")!; ctx.scale(S, S);
  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = BORDER; ctx.lineWidth = 1; rr(ctx, 0.5, 0.5, W - 1, H - 1, 16); ctx.stroke();

  // ── header: headshot + name/sub + team logo ──────────────────────────────
  const HS = 56;
  ctx.save();
  ctx.beginPath(); ctx.arc(P + HS / 2, 26 + HS / 2, HS / 2, 0, Math.PI * 2); ctx.closePath();
  ctx.fillStyle = "#eee"; ctx.fill(); ctx.clip();
  if (head) cover(ctx, head, P, 26, HS);
  else { ctx.fillStyle = o.teamColor; ctx.fillRect(P, 26, HS, HS); }
  ctx.restore();
  ctx.beginPath(); ctx.arc(P + HS / 2, 26 + HS / 2, HS / 2, 0, Math.PI * 2); ctx.strokeStyle = BORDER; ctx.lineWidth = 1.5; ctx.stroke();

  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.font = `800 21px ${SANS}`; ctx.fillStyle = TEXT; ctx.fillText(o.name, P + HS + 12, 48);
  ctx.font = `600 12px ${SANS}`; ctx.fillStyle = MUTED;
  ctx.fillText(`${o.position} · ${o.season} ${o.team} · ${o.typeLabel} depth`, P + HS + 12, 66);
  if (logo) cover(ctx, logo, W - P - 40, 22, 40);

  // ── stats tiles ──────────────────────────────────────────────────────────
  const tiles: [string, string][] = [
    ["PLAYS", String(o.stats.plays)],
    ["AVG DEPTH", `${o.stats.avgDepth.toFixed(1)} yd`],
    ["EPA/PLAY", o.stats.epaPerPlay.toFixed(2)],
  ];
  if (o.stuffed) tiles.push(["STUFFED", `${o.stuffed.pct}%`]);
  const tw = (W - 2 * P - (tiles.length - 1) * 8) / tiles.length;
  tiles.forEach(([lab, val], i) => {
    const x = P + i * (tw + 8);
    ctx.strokeStyle = BORDER; rr(ctx, x, 94, tw, 44, 8); ctx.stroke();
    ctx.textAlign = "left"; ctx.font = `700 8.5px ${SANS}`; ctx.fillStyle = MUTED; ctx.fillText(lab, x + 8, 110);
    ctx.font = `800 17px ${SANS}`; ctx.fillStyle = i === 3 ? BERRY : TEXT; ctx.fillText(val, x + 8, 130);
  });

  // ── field (left) ─────────────────────────────────────────────────────────
  const fx = P, fw = 168, ft = 156, fb = 512, fh = fb - ft;
  const yPix = (v: number) => ft + ((Y_MAX - Math.max(Y_MIN, Math.min(Y_MAX, v))) / (Y_MAX - Y_MIN)) * fh;
  ctx.save(); rr(ctx, fx, ft, fw, fh, 8); ctx.clip();
  for (let k = 0; k < 8; k++) { const v = Y_MIN + k * 10; ctx.fillStyle = k % 2 ? "#2f7a43" : "#35854a"; ctx.fillRect(fx, yPix(v + 10), fw, yPix(v) - yPix(v + 10)); }
  for (let i = 0; i < nb; i++) { const v = Y_MIN + i * STEP; ctx.fillStyle = heat(i); ctx.fillRect(fx, yPix(v + STEP), fw, yPix(v) - yPix(v + STEP)); }
  for (let k = 0; k <= 6; k++) { const v = k * 10; ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(fx, yPix(v)); ctx.lineTo(fx + fw, yPix(v)); ctx.stroke(); ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.font = `600 8px ${SANS}`; ctx.textAlign = "left"; if (v) ctx.fillText(`+${v}`, fx + 4, yPix(v) - 3); }
  ctx.strokeStyle = "#2b6cff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(fx, yPix(0)); ctx.lineTo(fx + fw, yPix(0)); ctx.stroke();
  ctx.fillStyle = "#bcd2ff"; ctx.font = `bold 9px ${SANS}`; ctx.textAlign = "right"; ctx.fillText("LOS", fx + fw - 4, yPix(0) - 4);
  ctx.strokeStyle = "#ffd21e"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(fx, yPix(10)); ctx.lineTo(fx + fw, yPix(10)); ctx.stroke();
  ctx.fillStyle = "#ffe98a"; ctx.fillText("1st down", fx + fw - 4, yPix(10) - 4);
  o.plays.forEach((p, i) => {
    ctx.beginPath(); ctx.arc(fx + fw / 2 + (hash(i) - 0.5) * fw * 0.55, yPix(p.yards), p.td ? 4 : 3, 0, Math.PI * 2);
    ctx.fillStyle = p.type === "rush" ? "#111827" : "#ffffff"; ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
    ctx.lineWidth = p.td ? 1.5 : 0.6; ctx.strokeStyle = p.td ? "#ffd21e" : "rgba(0,0,0,0.35)"; ctx.stroke();
  });
  ctx.restore();

  // ── right column: heat key + legend ──────────────────────────────────────
  const rx = fx + fw + 20;
  ctx.textAlign = "left"; ctx.font = `700 9px ${SANS}`; ctx.fillStyle = MUTED; ctx.fillText("HEAT KEY", rx, ft + 4);
  ctx.font = `700 13px ${SANS}`; ctx.fillStyle = TEXT; ctx.fillText(METRIC_LABEL[o.metric], rx, ft + 22);
  const kx = rx, ky = ft + 34, kw = 18, kh = 150;
  const grad = ctx.createLinearGradient(0, ky, 0, ky + kh);
  if (o.metric === "epa") { grad.addColorStop(0, "rgba(214,73,91,0.85)"); grad.addColorStop(0.5, "rgba(255,255,255,0.15)"); grad.addColorStop(1, "rgba(80,110,190,0.8)"); }
  else { grad.addColorStop(0, "rgba(214,73,91,0.85)"); grad.addColorStop(1, "rgba(214,73,91,0.08)"); }
  ctx.fillStyle = "#eef0f2"; rr(ctx, kx, ky, kw, kh, 4); ctx.fill();
  ctx.fillStyle = grad; rr(ctx, kx, ky, kw, kh, 4); ctx.fill();
  ctx.strokeStyle = BORDER; rr(ctx, kx, ky, kw, kh, 4); ctx.stroke();
  ctx.fillStyle = MUTED; ctx.font = `600 9px ${SANS}`; ctx.textAlign = "left";
  const hi = o.metric === "epa" ? "more +EPA" : o.metric === "volume" ? "more plays" : "more yards";
  const lo = o.metric === "epa" ? "more -EPA" : "fewer";
  ctx.fillText(hi, kx + kw + 6, ky + 8); ctx.fillText(lo, kx + kw + 6, ky + kh);

  // dot legend
  let ly = ky + kh + 26;
  const legend: [string, string][] = o.position === "QB" ? [["#ffffff", "completion"]]
    : (o.position === "RB" || o.position === "FB") ? [["#ffffff", "catch"], ["#111827", "carry"]] : [["#ffffff", "catch"]];
  legend.push(["gold", "TD (ring)"]);
  ctx.font = `600 10px ${SANS}`;
  for (const [c, lab] of legend) {
    ctx.beginPath(); ctx.arc(rx + 5, ly - 3, 4, 0, Math.PI * 2);
    ctx.fillStyle = c === "gold" ? "#fff" : c; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = c === "gold" ? "#ffd21e" : "rgba(0,0,0,0.35)"; ctx.stroke();
    ctx.fillStyle = MUTED; ctx.fillText(lab, rx + 16, ly); ly += 18;
  }
  ctx.font = `500 8.5px ${SANS}`; ctx.fillStyle = MUTED;
  wrap(ctx, "Each dot is a real play by yards past the LOS. Left-right is illustrative (not tracked).", rx, ly + 6, W - rx - P, 11);

  // ── watermark ────────────────────────────────────────────────────────────
  ctx.font = `700 10px ${SANS}`; const label = "SAMALYTICS NCAAF";
  const lw = ctx.measureText(label).width, lbox = 16, by = H - P + 4;
  const sx = W - P - lw - 5 - lbox;
  cover(ctx, brand, sx, by - 13, lbox);
  ctx.fillStyle = BERRY; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.fillText(label, sx + lbox + 5, by);

  return await new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"));
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
  const words = text.split(" "); let line = "";
  for (const w of words) {
    if (ctx.measureText(line + w + " ").width > maxW && line) { ctx.fillText(line.trim(), x, y); line = ""; y += lh; }
    line += w + " ";
  }
  ctx.fillText(line.trim(), x, y);
}
