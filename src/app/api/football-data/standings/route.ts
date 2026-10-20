import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const LEAGUES: Record<string, string> = {
  PL: "lfa-premier-league",
  PD: "lfa-la-liga",
  BL1: "lfa-bundesliga",
  SA: "lfa-serie-a",
  FL1: "lfa-ligue-1",
};

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Sign in to use live career data." }, { status: 401 });
  const league = new URL(request.url).searchParams.get("league") || "PL";
  const leagueId = LEAGUES[league];
  const token = process.env.LIVE_FOOTBALL_API_KEY;
  if (!leagueId) return NextResponse.json({ message: "Choose one of the supported leagues." }, { status: 400 });
  if (!token) return NextResponse.json({ message: "Live league tables are not connected yet. Add LIVE_FOOTBALL_API_KEY in the Vercel project settings." }, { status: 503 });

  try {
    const params = new URLSearchParams({ api_key: token, league_id: leagueId, lang: "en" });
    const response = await fetch(`https://live-football-api.com/api/v1/league_standings?${params.toString()}`, {
      next: { revalidate: 1800 },
    });
    const payload = await response.json();
    if (!response.ok || payload?.success === false) {
      const message = typeof payload?.message === "string" ? payload.message : "The league data provider could not return standings.";
      return NextResponse.json({ message }, { status: response.status === 429 ? 429 : 502 });
    }
    const tables = payload?.data?.standings || [];
    const rows = tables.flatMap((group: { title?: string; table?: { rank: string; team?: { name?: string; logo?: string }; played: string; won: string; drawn: string; lost: string; points: string }[] }) => (group.table || []).map((row) => ({
      position: Number(row.rank),
      team: row.team?.name || "Unknown club",
      crest: row.team?.logo || "",
      playedGames: Number(row.played),
      won: Number(row.won),
      draw: Number(row.drawn),
      lost: Number(row.lost),
      points: Number(row.points),
    })));
    return NextResponse.json({
      competition: league,
      season: payload?.data?.season || "Current season",
      stale: Boolean(payload?.data?.stale),
      updatedAt: new Date().toISOString(),
      standings: rows,
    }, { headers: { "Cache-Control": "s-maxage=1800, stale-while-revalidate=3600" } });
  } catch {
    return NextResponse.json({ message: "The league data provider could not be reached. Try again in a moment." }, { status: 502 });
  }
}
