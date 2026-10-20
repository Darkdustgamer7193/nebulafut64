import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ClubChoice = { id: string; name: string; league: string; code: string; level: number };
type DirectorInput = {
  action?: "match-plan" | "transfer-review";
  career?: {
    playerName?: string; age?: number; position?: string; overall?: number; formGrade?: string;
    formScore?: number; recentRatings?: number[]; appearances?: number; goals?: number;
    assists?: number; averageRating?: number; lastRating?: number; reputation?: number;
    managerTrust?: number; morale?: number; fitness?: number; club?: string; league?: string;
  };
  opponent?: { name?: string; level?: number };
  result?: { home?: number; away?: number; playerRating?: number; contributed?: boolean };
  clubs?: ClubChoice[];
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const text = (value: unknown, limit: number) => typeof value === "string" ? value.replace(/[<>]/g, "").slice(0, limit) : "";
const numeric = (value: unknown, fallback: number, min = 0, max = 100) => typeof value === "number" && Number.isFinite(value) ? clamp(value, min, max) : fallback;

async function askGroq(key: string, model: string, system: string, input: unknown) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(input) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.25,
      max_tokens: 300,
    }),
    signal: AbortSignal.timeout(8500),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(typeof payload?.error?.message === "string" ? payload.error.message : "Groq could not make a decision.");
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Groq returned an empty decision.");
  return JSON.parse(content) as Record<string, unknown>;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Sign in to use the career director." }, { status: 401 });

  let body: DirectorInput;
  try { body = await request.json() as DirectorInput; }
  catch { return NextResponse.json({ message: "The career director received an invalid request." }, { status: 400 }); }

  const key = process.env.GROQ_API_KEY;
  if (!key) return NextResponse.json({ message: "Add GROQ_API_KEY in Vercel Environment Variables to enable the Groq career director." }, { status: 503 });
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-20b";
  const career = body.career || {};
  const player = {
    name: text(career.playerName, 50), age: numeric(career.age, 20, 16, 40),
    position: text(career.position, 8), overall: numeric(career.overall, 60),
    formGrade: text(career.formGrade, 1), formScore: numeric(career.formScore, 50),
    recentRatings: Array.isArray(career.recentRatings) ? career.recentRatings.slice(0, 5).map((rating) => numeric(rating, 6, 0, 10)) : [],
    appearances: numeric(career.appearances, 0, 0, 500), goals: numeric(career.goals, 0, 0, 500),
    assists: numeric(career.assists, 0, 0, 500), averageRating: numeric(career.averageRating, 0, 0, 10),
    lastRating: numeric(career.lastRating, 0, 0, 10), reputation: numeric(career.reputation, 0),
    managerTrust: numeric(career.managerTrust, 0), morale: numeric(career.morale, 50),
    fitness: numeric(career.fitness, 80), club: text(career.club, 80), league: text(career.league, 50),
  };

  try {
    if (body.action === "match-plan") {
      const opponent = { name: text(body.opponent?.name, 80), level: numeric(body.opponent?.level, 70, 50, 95) };
      const clubs = Array.isArray(body.clubs) ? body.clubs.slice(0, 36).filter((club) => club && /^[a-z0-9-]{1,80}$/i.test(club.id) && text(club.name, 80) && text(club.league, 50)) : [];
      const decision = await askGroq(key, model,
        "You are the fair football career director in a fictional football game. Choose a believable opponent approach and modest difficulty from the player's actual attributes and recent form. Keep matches winnable, never guarantee an outcome, and do not change player data. Choose a transfer scout only for a player with at least 3 appearances and credible form/reputation; otherwise use null. A scout is only watching, not making an offer. Select transferClubId only from the supplied club IDs. Return JSON only with keys: approach (press, mid_block, low_block, counter), difficulty (-2 to 2 integer), briefing (one short sentence), transferClubId (exact supplied ID or null), scoutingNote (short sentence or empty).",
        { player, opponent, eligibleForScouting: player.appearances >= 3 && (player.formScore >= 55 || player.reputation >= 16), possibleClubs: clubs.map(({ id, name, league, level }) => ({ id, name, league, level })) });
      const approaches = ["press", "mid_block", "low_block", "counter"];
      const approach = approaches.includes(String(decision.approach)) ? String(decision.approach) : "mid_block";
      const possibleIds = new Set(clubs.map((club) => club.id));
      const transferClubId = player.appearances >= 3 && (player.formScore >= 55 || player.reputation >= 16) && typeof decision.transferClubId === "string" && possibleIds.has(decision.transferClubId)
        ? decision.transferClubId : null;
      return NextResponse.json({
        source: "groq", model, approach,
        difficulty: Math.round(numeric(decision.difficulty, 0, -2, 2)),
        briefing: text(decision.briefing, 180) || "The opposition has prepared a measured plan for this fixture.",
        scoutingClubId: transferClubId,
        scoutingNote: transferClubId ? text(decision.scoutingNote, 140) || "A scout is monitoring your next performance." : "Your current level of form has not triggered a transfer watch yet.",
      });
    }

    if (body.action === "transfer-review") {
      const result = body.result || {};
      const rating = numeric(result.playerRating, 0, 0, 10);
      const contributed = Boolean(result.contributed);
      if (player.appearances < 2 || (rating < 6.6 && !contributed && player.formScore < 65)) {
        return NextResponse.json({ offer: null, source: "groq", note: "The scouting team wants to see more consistent first-team performances." });
      }
      const clubs = Array.isArray(body.clubs) ? body.clubs.slice(0, 36).filter((club) => club && /^[a-z0-9-]{1,80}$/i.test(club.id) && text(club.name, 80) && club.name !== player.club) : [];
      if (!clubs.length) return NextResponse.json({ offer: null, source: "groq", note: "There are no suitable clubs to approach right now." });
      const decision = await askGroq(key, model,
        "You are a cautious transfer director for a fictional football career game. Decide whether one of the supplied clubs would realistically watch or approach this player, based on the completed result, position, form, minutes/appearances, reputation and competition level. Avoid blockbuster jumps for developing players. Return JSON only with keys: targetClubId (one exact supplied ID or null), reason (one concise realistic sentence). You cannot invent a club, wage, player stat or contract. Prefer null when uncertain.",
        { player, result: { home: numeric(result.home, 0, 0, 20), away: numeric(result.away, 0, 0, 20), playerRating: rating, contributed }, possibleClubs: clubs.map(({ id, name, league, level }) => ({ id, name, league, level })) });
      const ids = new Set(clubs.map((club) => club.id));
      const targetClubId = typeof decision.targetClubId === "string" && ids.has(decision.targetClubId) ? decision.targetClubId : null;
      const target = targetClubId ? clubs.find((club) => club.id === targetClubId) : null;
      return NextResponse.json({
        source: "groq",
        offer: target ? { club: target.name, league: target.league, code: target.code, level: numeric(target.level, 70, 50, 95), reason: text(decision.reason, 180) || "Scouts have noticed your recent performances." } : null,
        note: target ? "The scouting team has approved a realistic approach." : "No club has made a move yet. Keep building your reputation.",
      });
    }
    return NextResponse.json({ message: "Choose match-plan or transfer-review." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message.slice(0, 220) : "The Groq career director is temporarily unavailable." }, { status: 502 });
  }
}
