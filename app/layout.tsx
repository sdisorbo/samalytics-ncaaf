import type { Metadata } from "next";
import { Inter, Orbitron } from "next/font/google";
import Nav from "./components/Nav";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const orbitron = Orbitron({ subsets: ["latin"], variable: "--font-orbitron", weight: ["700", "900"], display: "swap" });

export const metadata: Metadata = {
  title: "Samalytics | NCAAF Engine",
  description: "Team Elo ratings, standings, and Monte-Carlo College Football Playoff odds for FBS. A sister to the Samalytics NHL, MLB & NFL engines.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${orbitron.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){try{var t=localStorage.getItem('theme');
          if(t==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();
        `}} />
      </head>
      <body style={{ backgroundColor: "var(--color-bg)", color: "var(--color-text)" }}>
        <Nav />
        <main className="max-w-screen-xl mx-auto px-3 sm:px-4 py-5 sm:py-7 overflow-x-hidden">{children}</main>
        <footer className="max-w-screen-xl mx-auto px-4 pb-10 pt-2 text-2xs text-s-muted leading-relaxed">
          Samalytics NCAAF Engine: team Elo from FBS game results (margin-of-victory adjusted, home-field
          bump), every team opening 2021 at 1500 and regressing 30% toward the mean each offseason. Ratings
          run through the end of the regular season, the rating each team carries into the College Football
          Playoff. Playoff odds are a Monte-Carlo of a committee-style selection model (Elo + conference
          strength + résumé, with automatic bids for conference champions) and the bracket. Data & logos © ESPN.
        </footer>
      </body>
    </html>
  );
}
