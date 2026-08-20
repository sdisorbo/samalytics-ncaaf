// Render a game box to a branded PNG (light theme, fixed look) for sharing.
import { type Game, team } from "./games";

const BERRY = "#932F6D", COPPER = "#A7754D", TEXT = "#1C1220", MUTED = "#6E6472", BORDER = "#E9E1E7", BG = "#FFFFFF";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    if (!src) return res(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function whenText(g: Game): string {
  const [, m, d] = g.date.split("-").map(Number);
  let t = "TBD";
  if (g.time) {
    const [hh, mm] = g.time.split(":").map(Number);
    const ap = hh >= 12 ? "PM" : "AM";
    t = `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${ap} ET`;
  }
  return `${g.day} ${MON[m - 1]} ${d} · ${t}${g.neutral ? " · neutral" : ""}`;
}

/** Draw left-aligned colored text segments, return the end x. */
function segs(ctx: CanvasRenderingContext2D, parts: [string, string][], x: number, y: number, font: string) {
  ctx.font = font; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  for (const [t, c] of parts) { ctx.fillStyle = c; ctx.fillText(t, x, y); x += ctx.measureText(t).width; }
  return x;
}

function coverLogo(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, x: number, y: number, box: number) {
  if (!img || !img.width) return;
  const s = Math.min(box / img.width, box / img.height);
  const w = img.width * s, h = img.height * s;
  ctx.drawImage(img, x + (box - w) / 2, y + (box - h) / 2, w, h);
}

export async function gameCardPng(g: Game): Promise<Blob> {
  const away = team(g.away), home = team(g.home);
  const played = g.hs != null && g.as != null;
  const homeTop = played ? (g.hs as number) >= (g.as as number) : g.hwp >= 0.5;
  const homePct = Math.round(g.hwp * 100), awayPct = 100 - homePct;

  const [aLogo, hLogo, brand] = await Promise.all([
    loadImg(away.logo), loadImg(home.logo), loadImg("/samalytics_ncaaf_logo.png"),
  ]);

  const W = 408, H = 176, S = 2, P = 18;
  const cv = document.createElement("canvas");
  cv.width = W * S; cv.height = H * S;
  const ctx = cv.getContext("2d")!;
  ctx.scale(S, S);

  // card
  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = BORDER; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(0.5, 0.5, W - 1, H - 1, 14); ctx.stroke();

  // header
  ctx.font = `500 11.5px ${SANS}`; ctx.textBaseline = "alphabetic";
  ctx.fillStyle = MUTED; ctx.textAlign = "left"; ctx.fillText(whenText(g), P, P + 4);
  ctx.textAlign = "right"; ctx.fillText(played ? "Final" : "Win probability", W - P, P + 4);

  const rightVal = (top: boolean, txt: string, big: number) => {
    ctx.textAlign = "right"; ctx.font = `800 ${big}px ${SANS}`;
    ctx.fillStyle = top ? BERRY : (played ? MUTED : TEXT);
  };

  // a team block
  const drawTeam = (logo: HTMLImageElement | null, t: typeof away, elo: number, win: number, loss: number,
                    pct: number, score: number | null, top: boolean, isHome: boolean, cy: number) => {
    coverLogo(ctx, logo, P, cy - 18, 36);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.font = `600 15px ${SANS}`; ctx.fillStyle = TEXT;
    const name = t.name.length > 20 ? t.abbr : t.name;
    ctx.fillText(name, P + 46, cy - 4);
    const nameW = ctx.measureText(name).width;
    if (isHome) { ctx.font = `500 10px ${SANS}`; ctx.fillStyle = MUTED; ctx.fillText("HOME", P + 46 + nameW + 6, cy - 5); }
    segs(ctx, [
      [`Elo ${elo.toFixed(0)}  ·  `, MUTED],
      [`W ${win >= 0 ? "+" : ""}${win}`, BERRY],
      [` / L ${loss}`, MUTED],
    ], P + 46, cy + 11, `500 11px ${SANS}`);
    if (played) { rightVal(top, "", 22); ctx.fillText(String(score), W - P, cy + 2); }
    else { rightVal(top, "", 20); ctx.fillText(`${pct}%`, W - P, cy + 1); }
  };

  drawTeam(aLogo, away, g.ae, g.aWin, g.aLoss, awayPct, g.as, !homeTop, false, 56);

  // win-prob bar (or a divider when played)
  const barY = 92;
  if (!played) {
    const bw = W - 2 * P, ax = bw * awayPct / 100;
    ctx.fillStyle = BORDER; ctx.beginPath(); ctx.roundRect(P, barY, bw, 4, 2); ctx.fill();
    ctx.fillStyle = BERRY;
    ctx.beginPath();
    if (homeTop) ctx.roundRect(P + ax, barY, bw - ax, 4, 2); else ctx.roundRect(P, barY, ax, 4, 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = BORDER; ctx.beginPath(); ctx.moveTo(P, barY + 2); ctx.lineTo(W - P, barY + 2); ctx.stroke();
  }

  drawTeam(hLogo, home, g.he, g.hWin, g.hLoss, homePct, g.hs, homeTop, true, 116);

  // brand watermark, bottom-right
  ctx.font = `700 10px ${SANS}`;
  const label = "SAMALYTICS NCAAF";
  const lw = ctx.measureText(label).width;
  const logoBox = 16, gap = 5, by = H - P + 2;
  const startX = W - P - lw - gap - logoBox;
  coverLogo(ctx, brand, startX, by - 13, logoBox);
  ctx.fillStyle = BERRY; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillText(label, startX + logoBox + gap, by);

  return await new Promise<Blob>((res, rej) =>
    cv.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"));
}
