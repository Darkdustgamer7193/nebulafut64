import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type SearchPlayer = { id: string; name: string; photo?: string; country?: string };
type CareerCompetition = { league?: { name?: string }; appearances?: number; goals?: number; assists?: number; yellow_cards?: number; red_cards?: number };
type CareerSeason = { name?: string; competitions?: CareerCompetition[] };
type CareerClub = { team?: { name?: string }; seasons?: CareerSeason[] };

const API = "https://live-football-api.com/api/v1";

async function getProvider(path: string, key: string) {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`${API}/${path}${separator}api_key=${encodeURIComponent(key)}&lang=en`, { next: { revalidate: 3600 } });
  const payload = await response.json();
  if (!response.ok || payload?.success === false) {
    const message = typeof payload?.message === "string" ? payload.message : "The live football data provider rejected this request.";
    throw new Error(message);
  }
  return payload;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Sign in to use live career data." }, { status: 401 });
  const query = (new URL(request.url).searchParams.get("search") || "").trim();
  const token = process.env.LIVE_FOOTBALL_API_KEY;
  if (query.length < 2) return NextResponse.json({ message: "Search for at least 2 letters." }, { status: 400 });
  if (!token) return NextResponse.json({ message: "Live player data is not connected yet. Add LIVE_FOOTBALL_API_KEY in the Vercel project settings." }, { status: 503 });

  try {
    const search = await getProvider(`player_search?q=${encodeURIComponent(query.slice(0, 50))}`, token);
    const candidates = (search?.data?.players || []).slice(0, 3) as SearchPlayer[];
    const players = [];
    for (const candidate of candidates) {
      const profile = await getProvider(`player?player_id=${encodeURIComponent(candidate.id)}`, token);
      const data = profile?.data || {};
      const clubHistory = (data.clubs_career || []) as CareerClub[];
      const currentClub = clubHistory.find((club) => club.team?.name === data.current_team?.name) || clubHistory[0];
      const season = [...(currentClub?.seasons || [])].sort((a, b) => (b.name || "").localeCompare(a.name || ""))[0];
      const competition = season?.competitions?.[0];
      players.push({
        id: candidate.id,
        name: data.name || candidate.name,
        photo: data.photo || candidate.photo || "",
        country: data.nationality || candidate.country || "",
        age: data.birthdate ? Math.max(0, new Date().getFullYear() - new Date(data.birthdate).getFullYear()) : undefined,
        position: data.position || "",
        currentTeam: data.current_team?.name || currentClub?.team?.name || "",
        marketValue: data.market_value || "Unavailable",
        seasonName: season?.name || "Most recent recorded season",
        leagueName: competition?.league?.name || "",
        appearances: competition?.appearances ?? 0,
        goals: competition?.goals ?? 0,
        assists: competition?.assists ?? 0,
        yellowCards: competition?.yellow_cards ?? 0,
        redCards: competition?.red_cards ?? 0,
      });
    }
    return NextResponse.json({ players, updatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=7200" } });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Live player data could not be reached." }, { status: 502 });
  }
}
