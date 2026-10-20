"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Award, BarChart3, Bell, BriefcaseBusiness, CalendarDays,
  Check, ChevronRight, CircleHelp, Clock3, Coins, Download, Dumbbell, Heart,
  MapPin, MessageCircle, Plus, Save, Search, Shield, Shirt, Sparkles,
  Swords, Trash2, Trophy, UserRound, Users, WandSparkles, X,
} from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { MatchPitch } from "@/components/match-pitch";
import { createMatchTimeline, type MatchEvent, type OpponentApproach, type Tactic, type TeamStrength } from "@/lib/match-simulation";

type Tab = "overview" | "matchday" | "training" | "inbox" | "league" | "rules" | "profile";
type Stats = { pace: number; shooting: number; passing: number; dribbling: number; defending: number; physicality: number; stamina: number; composure: number; vision: number; strength: number };
type PlayerCareer = {
  id: string; playerName: string; age: number; position: string; foot: string; kitNumber: number;
  skin: string; hair: string; hairColor: string; boots: string; kitColor: string; style: string; club: string; league: string; leagueCode: string;
  stats: Stats; season: number; matchday: number; appearances: number; goals: number; assists: number;
  yellowCards: number; redCards: number; cleanSheets: number; averageRating: number; lastRating: number;
  recentRatings?: number[];
  fitness: number; morale: number; managerTrust: number; reputation: number; marketValue: number;
  salary: number; contractYears: number; injuryDays: number; trainingPoints: number; skillPoints: number;
  objectives: { title: string; detail: string; progress: number; target: number; reward: string; trigger: "contribution" | "rating" | "fitness" | "training" }[];
  history: { date: string; title: string; detail: string; rating?: number }[];
  eventSeen: string[]; pendingEvent?: StoryEvent; pendingOffer?: ClubOffer;
  officialTable?: LeagueRow[]; officialTableUpdatedAt?: string;
};
type SaveSlot = { id: string; saveName: string; career: PlayerCareer; lastPlayed: string; createdAt: string };
type ClubOffer = { club: string; league: string; code: string; role: string; wages: number; weeks: number; reason: string };
type StoryEffect = { morale?: number; fitness?: number; trust?: number; reputation?: number; stat?: keyof Stats; amount?: number; injury?: number; value?: number };
type StoryChoice = { label: string; note: string; effect: StoryEffect; result: string };
type StoryEvent = { id: string; title: string; text: string; tag: string; choices: [StoryChoice, StoryChoice] };
type LeagueRow = { position: number; team: string; playedGames: number; won: number; draw: number; lost: number; points: number; crest: string };
type LivePlayer = { id: string; name: string; photo?: string; age?: number; country?: string; position?: string; currentTeam?: string; marketValue?: string; seasonName?: string; leagueName?: string; appearances?: number; goals?: number; assists?: number; yellowCards?: number; redCards?: number };
type ClubChoice = { id: string; name: string; league: string; code: string; level: number };
type DirectorPlan = { source: "groq" | "local"; approach: OpponentApproach; difficulty: number; briefing: string; scoutingClub: ClubChoice | null; scoutingNote: string };

const SAVE_KEY = "nebulafut-player-careers-v1";
const POSITIONS = ["ST", "LW", "RW", "CAM", "CM", "CDM", "LB", "CB", "RB", "GK"];
const LEAGUES = [
  { name: "Premier League", code: "PL", apiCode: "PL", clubs: ["Arsenal", "Aston Villa", "Brighton & Hove Albion", "Chelsea", "Liverpool", "Manchester City", "Manchester United", "Newcastle United", "Tottenham Hotspur", "West Ham United"] },
  { name: "La Liga", code: "PD", apiCode: "PD", clubs: ["Athletic Club", "Atlético Madrid", "Barcelona", "Girona", "Real Madrid", "Real Sociedad", "Real Betis", "Sevilla", "Valencia", "Villarreal"] },
  { name: "Bundesliga", code: "BL1", apiCode: "BL1", clubs: ["Bayer Leverkusen", "Bayern München", "Borussia Dortmund", "Eintracht Frankfurt", "RB Leipzig", "SC Freiburg", "Stuttgart", "Union Berlin"] },
  { name: "Serie A", code: "SA", apiCode: "SA", clubs: ["AC Milan", "Atalanta", "Inter", "Juventus", "Lazio", "Napoli", "Roma", "Fiorentina"] },
  { name: "Ligue 1", code: "FL1", apiCode: "FL1", clubs: ["AS Monaco", "Lille", "Lyon", "Marseille", "Nice", "Paris Saint-Germain", "Rennes", "Strasbourg"] },
];
const RANDOM_NAMES = ["Alex Morgan", "Kai Bennett", "Jordan Ellis", "Riley Carter", "Noah Silva", "Luca Hayes", "Avery Cole", "Milan Novak", "Leo Costa", "Sam Okafor", "Eden Clarke", "Theo Martin"];
const SKIN_TONES = ["#f1c9a8", "#d9a981", "#bb825c", "#89563c", "#593b31"];
const HAIR_STYLES = ["Short fade", "Curly crop", "Wavy", "Braids", "Long tied", "Buzz cut"];
const BOOT_COLORS = ["#c5ff68", "#73dcff", "#ff735d", "#d9b7ff", "#ffffff"];
const KIT_COLORS = ["#c5ff68", "#73dcff", "#ff735d", "#d9b7ff", "#f5f2e8"];
const HAIR_COLORS = ["#181411", "#3c261b", "#795438", "#c8a26b", "#e5e0d0"];
const INITIAL_STATS: Stats = { pace: 66, shooting: 60, passing: 62, dribbling: 65, defending: 49, physicality: 58, stamina: 68, composure: 59, vision: 61, strength: 57 };

function formGrade(ratings: number[] | undefined): string {
  if (!ratings?.length) return "C";
  const average = ratings.slice(0, 5).reduce((sum, rating) => sum + rating, 0) / Math.min(5, ratings.length);
  return average >= 9 ? "S" : average >= 8 ? "A" : average >= 7 ? "B" : average >= 6 ? "C" : average >= 5 ? "D" : "E";
}

function formScore(ratings: number[] | undefined): number {
  if (!ratings?.length) return 50;
  const sample = ratings.slice(0, 5);
  const average = sample.reduce((sum, rating) => sum + rating, 0) / sample.length;
  return Math.max(20, Math.min(95, Math.round(50 + (average - 6.5) * 15 + ((sample[0] || average) - average) * 2)));
}

const clubRatings: Record<string, number> = {
  Arsenal: 84, "Manchester City": 86, Liverpool: 85, "Real Madrid": 87, Barcelona: 84, "Atlético Madrid": 82,
  "Bayern München": 86, "Bayer Leverkusen": 83, "Borussia Dortmund": 82, Inter: 85, "AC Milan": 82,
  Juventus: 83, "Paris Saint-Germain": 86, "Aston Villa": 81, Chelsea: 82, "Manchester United": 81,
};

function clubLevel(name: string): number {
  if (clubRatings[name]) return clubRatings[name];
  return 69 + [...name].reduce((total, letter) => total + letter.charCodeAt(0), 0) % 11;
}

function clubId(code: string, name: string): string {
  const slug = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${code.toLowerCase()}-${slug}`;
}

function careerClubs(excludeClub?: string): ClubChoice[] {
  return LEAGUES.flatMap((league) => league.clubs.filter((club) => club !== excludeClub).map((club) => ({ id: clubId(league.code, club), name: club, league: league.name, code: league.code, level: clubLevel(club) })));
}

function nextOpponent(career: PlayerCareer): string {
  const clubs = LEAGUES.find((league) => league.code === career.leagueCode)?.clubs || [];
  const opponents = clubs.filter((club) => club !== career.club);
  return opponents.length ? opponents[(career.matchday - 1) % opponents.length] : "Rivals FC";
}

const laws = [
  ["1", "The field of play", "The pitch, markings, goals and technical areas must meet the Laws of the Game."],
  ["2", "The ball", "The ball must meet size, weight, pressure and material requirements; it is replaced if damaged."],
  ["3", "The players", "A match is played by two teams of up to eleven players, including one goalkeeper; substitutions follow competition rules."],
  ["4", "The players’ equipment", "Players wear a shirt, shorts, socks, shin guards and footwear; jewellery is not permitted."],
  ["5", "The referee", "The referee enforces the Laws, records incidents, manages restarts and may stop play for serious injury."],
  ["6", "The other match officials", "Assistant referees, fourth officials and video officials help with decisions and match administration."],
  ["7", "The duration of the match", "Two equal halves are played. The referee adds time for substitutions, injuries and other delays."],
  ["8", "The start and restart of play", "Kick-offs start each half and restart play after a goal; dropped balls restart play after certain stoppages."],
  ["9", "The ball in and out of play", "The ball is out only when it wholly crosses a touchline or goal line, or when the referee stops play."],
  ["10", "Determining the outcome of a match", "A goal counts when the whole ball crosses the goal line between the posts and under the crossbar."],
  ["11", "Offside", "Being in an offside position alone is not an offence. A player must become involved in active play."],
  ["12", "Fouls and misconduct", "Direct free kicks, penalties, cautions and send-offs address offences and misconduct."],
  ["13", "Free kicks", "Direct and indirect free kicks restart play after offences; defenders respect the required distance."],
  ["14", "The penalty kick", "A penalty is awarded for a direct free kick offence by a defender inside their own penalty area."],
  ["15", "The throw-in", "A throw-in restarts play after the whole ball crosses a touchline; the thrower uses both hands from behind the head."],
  ["16", "The goal kick", "A goal kick is awarded when an attacker last touches the ball before it crosses the goal line, outside the goal."],
  ["17", "The corner kick", "A corner is awarded when a defender last touches the ball before it crosses their goal line, outside the goal."],
];

const storySeeds: { title: string; tag: string; variants: string[]; choices: [StoryChoice, StoryChoice] }[] = [
  { title: "A late call from the manager", tag: "TRAINING GROUND", variants: ["The manager wants to see you at the training ground before breakfast.", "A message from the manager arrives while you are winding down.", "The staff have kept one pitch open for an extra session.", "The manager has spotted something in your last performance.", "The analyst sends a clip with a note to meet before training.", "The manager asks if you have ten more minutes in your legs."], choices: [{ label: "Stay for the extra work", note: "+2 training · −7 fitness", effect: { stat: "stamina", amount: 1, fitness: -7, trust: 3 }, result: "The manager appreciates the extra effort." }, { label: "Keep your recovery plan", note: "+8 fitness · steady trust", effect: { fitness: 8, trust: 1 }, result: "You protect your recovery and arrive fresher." }] },
  { title: "A message from home", tag: "PERSONAL LIFE", variants: ["Someone at home needs your help with something that cannot wait.", "A family call interrupts your quiet evening. They need you nearby.", "Your family asks you to come home before tomorrow’s session.", "A personal errand has become urgent, and your people are counting on you.", "You get a call from home just as the team bus is due to leave.", "A family member has had a difficult day and asks you to show up."], choices: [{ label: "Go home and help", note: "+7 morale · miss recovery time", effect: { morale: 7, fitness: -5, trust: -1 }, result: "You make it home. The day is hectic, but it matters." }, { label: "Call and arrange support", note: "+2 trust · protect schedule", effect: { morale: 2, trust: 2 }, result: "You find someone to help and make sure your family is not alone." }] },
  { title: "A teammate needs a lift", tag: "DRESSING ROOM", variants: ["A younger teammate is frustrated after a difficult training session.", "Someone new to the squad asks how to settle into the group.", "A teammate has lost confidence after a mistake in front of the staff.", "A young player asks if you can stay for a few finishing drills.", "The dressing room is quiet after a tough result. Someone looks up to you.", "A teammate asks for advice about handling pressure from the crowd."], choices: [{ label: "Stay and help them", note: "+6 morale · +1 reputation", effect: { morale: 6, reputation: 1, trust: 1 }, result: "The two of you get extra work in. The squad notices." }, { label: "Keep your own routine", note: "+5 fitness", effect: { fitness: 5 }, result: "You keep to your plan and save energy for the next match." }] },
  { title: "Your agent has news", tag: "CAREER CALL", variants: ["Your agent says another club has asked about your situation.", "A representative sends a message about a possible move.", "There is quiet interest from a club in a different league.", "Your agent thinks a loan could open a path to regular minutes.", "A club has asked for your recent performances and availability.", "Your representative wants to talk about the next step in your career."], choices: [{ label: "Ask for the details", note: "+3 reputation · learn about offers", effect: { reputation: 3, morale: 2 }, result: "You ask your agent to keep the conversation moving." }, { label: "Focus on this club", note: "+4 manager trust", effect: { trust: 4, morale: 1 }, result: "You tell your agent that your next performance comes first." }] },
  { title: "A sponsor wants your time", tag: "OFF THE PITCH", variants: ["A local sponsor invites you to a short event after training.", "A boot brand offers to photograph you for its new campaign.", "A community partner asks if you can attend a junior football session.", "The club media team has a sponsor appearance in mind.", "A sportswear rep asks you to try a new boot at the training ground.", "A partner club is holding a meet-and-greet and asks for a visit."], choices: [{ label: "Make the appearance", note: "+4 reputation · −4 fitness", effect: { reputation: 4, fitness: -4, value: 8000 }, result: "The event goes smoothly and your profile grows." }, { label: "Keep the evening free", note: "+6 fitness", effect: { fitness: 6 }, result: "You keep your schedule clear and get the recovery you need." }] },
  { title: "The press wants a quote", tag: "MEDIA ROOM", variants: ["A reporter asks how you feel about your minutes this season.", "A journalist wants a reaction to a rumour about your future.", "The post-match microphones are waiting after a hard-fought draw.", "A reporter asks whether the squad can challenge for a place in Europe.", "The media team wants a short interview about your first season.", "A question about your teammate’s mistake lands in your lap."], choices: [{ label: "Answer with calm confidence", note: "+3 reputation · +1 trust", effect: { reputation: 3, trust: 1 }, result: "Your answer is measured and the manager likes the focus." }, { label: "Keep it short and private", note: "+3 morale", effect: { morale: 3 }, result: "You keep the attention on the team and move on." }] },
  { title: "The crowd remembers you", tag: "SUPPORTERS", variants: ["A family waits by the gate with a shirt for you to sign.", "A young supporter has travelled a long way to meet the squad.", "Fans are waiting outside after training and call your name.", "A supporter asks for a photo before the team bus leaves.", "The club shop asks if you can sign a few shirts for charity.", "You spot a kid wearing your number in the stands."], choices: [{ label: "Stop and say hello", note: "+5 reputation · +4 morale", effect: { reputation: 5, morale: 4 }, result: "A small moment turns into the story of someone’s week." }, { label: "Head back to recover", note: "+6 fitness", effect: { fitness: 6 }, result: "You wave to the fans and get back to the recovery room." }] },
  { title: "An invitation after dark", tag: "TEAM BONDING", variants: ["A teammate suggests a late dinner the night before training.", "The squad has been invited to a celebration after the win.", "A friend asks you to stay out after a long week.", "Some teammates want to unwind before the next away trip.", "The group chat is full of plans for tonight.", "A teammate says the squad could use a laugh together."], choices: [{ label: "Join them for a little while", note: "+6 morale · −8 fitness", effect: { morale: 6, fitness: -8, trust: 1 }, result: "You reconnect with the group, then call it a night." }, { label: "Stay in and recover", note: "+8 fitness", effect: { fitness: 8 }, result: "You make the sensible call and wake up ready to work." }] },
  { title: "The away trip changes", tag: "TRAVEL", variants: ["A travel delay leaves the squad waiting at the station.", "The weather has changed the route to the away ground.", "The team bus is held up and the schedule is suddenly tight.", "A connection is cancelled on the way to the next fixture.", "The away hotel has moved the team’s arrival time.", "The coach asks everyone to stay flexible after a travel update."], choices: [{ label: "Lead the group through it", note: "+2 trust · +2 reputation", effect: { trust: 2, reputation: 2, fitness: -3 }, result: "You keep the mood steady while staff reorganise the trip." }, { label: "Use the wait to rest", note: "+5 fitness", effect: { fitness: 5 }, result: "You find a quiet corner and get some recovery time." }] },
  { title: "One more video session", tag: "TACTICAL ROOM", variants: ["The analyst offers to walk you through the next opponent’s back line.", "There is a spare screen in the tactical room and a new clip ready.", "A coach wants to discuss how you can find more space between lines.", "The staff have identified a pattern you might exploit on matchday.", "You can review your last match with the performance analyst.", "The coaches have a short set-piece session prepared."], choices: [{ label: "Study the clips", note: "+2 vision · +2 trust", effect: { stat: "vision", amount: 2, trust: 2, fitness: -2 }, result: "You notice a few details you can use next time." }, { label: "Save it for tomorrow", note: "+5 fitness", effect: { fitness: 5 }, result: "You put the screen away and give your mind a break." }] },
  { title: "The community visit", tag: "COMMUNITY", variants: ["A nearby school asks if you can visit its after-class football club.", "A local food bank is running a club fundraiser this week.", "The youth academy asks you to share a few words with the younger group.", "The club is helping a local family and could use your support.", "A community coach wants you to hand out awards at a junior tournament.", "The club foundation invites you to a small neighbourhood event."], choices: [{ label: "Go and spend the time", note: "+6 reputation · +3 morale", effect: { reputation: 6, morale: 3 }, result: "The visit is low-key and meaningful. You leave with a full heart." }, { label: "Send a signed shirt", note: "+2 reputation · +4 fitness", effect: { reputation: 2, fitness: 4 }, result: "You send a personal message and protect your recovery window." }] },
  { title: "A small niggle", tag: "MEDICAL ROOM", variants: ["The physio notices you are favouring one leg after training.", "A tight muscle makes the final sprint of the session uncomfortable.", "You wake up with a sore ankle and the medical team checks it.", "A heavy collision has left you stiff the morning after the match.", "The physio asks you to describe a pain before training starts.", "Your body is sending a signal after a busy run of fixtures."], choices: [{ label: "Tell the medical staff everything", note: "+12 fitness · possible rest", effect: { fitness: 12, injury: 1, morale: -1 }, result: "The staff manage it early. You miss a light session but avoid pushing through pain." }, { label: "Play it down and continue", note: "+3 trust · injury risk", effect: { trust: 3, injury: 2, fitness: -8 }, result: "You continue, but the physio keeps a close eye on you." }] },
  { title: "A new nutrition plan", tag: "PERFORMANCE", variants: ["The club nutritionist suggests a different meal before training.", "A new recovery drink is being tested in the training centre.", "The staff want to adjust your hydration plan for the away trip.", "The chef has prepared a meal plan around your position and minutes.", "The performance team asks you to track sleep for a week.", "A wearable report shows your recovery is behind your usual level."], choices: [{ label: "Commit to the plan", note: "+8 fitness · +1 stamina", effect: { fitness: 8, stat: "stamina", amount: 1 }, result: "The routine feels easier by the end of the week." }, { label: "Keep your usual routine", note: "+3 morale", effect: { morale: 3 }, result: "You stick with what works for you and stay consistent." }] },
  { title: "A role change is on the table", tag: "TACTICAL TALK", variants: ["The manager asks if you would be comfortable playing slightly wider.", "The coaches are considering you in a more central role.", "The staff think your passing could help deeper in midfield.", "A tactical change may put you closer to the striker.", "The manager asks you to cover a position for one match.", "The video team shows a role that could use your movement."], choices: [{ label: "Take on the new role", note: "+2 vision · +3 trust", effect: { stat: "vision", amount: 2, trust: 3, morale: 2 }, result: "You study the new movements and give the staff a positive answer." }, { label: "Ask to focus on your position", note: "+2 morale · +2 skill", effect: { morale: 2, stat: "dribbling", amount: 1 }, result: "You explain where you can make the biggest difference right now." }] },
  { title: "A challenge in training", tag: "TRAINING GROUND", variants: ["A teammate challenges you to a finishing contest.", "The staff set up a one-on-one drill at the end of training.", "The squad has a friendly passing challenge before the weekend.", "A defender wants to test your footwork after the session.", "The coaches turn the last drill into a short competition.", "Your training group is split into a high-speed challenge."], choices: [{ label: "Go all in", note: "+2 skill · −6 fitness", effect: { stat: "pace", amount: 1, morale: 3, fitness: -6 }, result: "You push the tempo and learn something from the competition." }, { label: "Keep it technical", note: "+2 skill · +2 fitness", effect: { stat: "composure", amount: 1, fitness: 2 }, result: "You focus on clean execution and finish the day feeling sharp." }] },
  { title: "A quick press appearance", tag: "CLUB MEDIA", variants: ["The club asks you to record a short message for matchday.", "The media team wants a photo with the academy group.", "A behind-the-scenes clip needs a player to explain the warm-up.", "A local broadcaster asks for one short question after training.", "The club wants to introduce you to supporters on its channel.", "A teammate asks you to join a light-hearted team video."], choices: [{ label: "Step in front of the camera", note: "+3 reputation · +2 morale", effect: { reputation: 3, morale: 2 }, result: "You keep it natural and supporters respond warmly." }, { label: "Let someone else take it", note: "+4 fitness", effect: { fitness: 4 }, result: "You give the slot to a teammate and head for recovery." }] },
  { title: "The captain offers advice", tag: "DRESSING ROOM", variants: ["The captain asks you to stay behind for a quiet conversation.", "A senior player shares a story about their first big move.", "The captain has noticed your confidence dipping.", "A veteran teammate offers to mentor you this month.", "The captain asks what would help you settle in.", "A senior player says you should take more responsibility."], choices: [{ label: "Listen and learn", note: "+5 trust · +2 composure", effect: { trust: 5, stat: "composure", amount: 2 }, result: "You leave with a clearer head and a new perspective." }, { label: "Speak honestly about your goals", note: "+3 morale · +2 reputation", effect: { morale: 3, reputation: 2 }, result: "You tell the captain what you want to become." }] },
  { title: "A request from the academy", tag: "YOUTH TEAM", variants: ["An academy player asks for a photo after watching you train.", "The under-18s want you to demonstrate your favourite drill.", "A young goalkeeper asks how you handle pressure in front of goal.", "The academy coach asks you to talk about patience and development.", "A youth player has copied your boots and wants to meet you.", "The academy has a match and hopes you can watch from the touchline."], choices: [{ label: "Make time for them", note: "+4 reputation · +3 morale", effect: { reputation: 4, morale: 3, trust: 1 }, result: "The young players leave smiling and the staff appreciate it." }, { label: "Send encouragement for later", note: "+4 fitness", effect: { fitness: 4, morale: 1 }, result: "You send a message and keep your rest schedule intact." }] },
  { title: "An unexpected bill", tag: "LIFE OUTSIDE FOOTBALL", variants: ["A repair at home costs more than you expected.", "A family expense lands at an awkward time.", "Your car needs urgent work before the next away trip.", "A travel booking has to be changed at short notice.", "A personal appointment has become complicated to arrange.", "A small problem at home grows into a full afternoon of calls."], choices: [{ label: "Handle it yourself today", note: "− fitness · +1 composure", effect: { fitness: -4, stat: "composure", amount: 1, morale: -1 }, result: "You sort out the problem and get back to your routine." }, { label: "Ask your support team for help", note: "+2 trust · +2 morale", effect: { trust: 2, morale: 2 }, result: "The club helps you arrange it so you can focus on football." }] },
  { title: "A rumour starts online", tag: "OUTSIDE NOISE", variants: ["A post claims you are unhappy with your current role.", "A rumour says your agent has already agreed a move.", "A fan account misreads a photo and the story spreads.", "A headline suggests the dressing room has a problem.", "Someone clips a training moment without its context.", "A transfer rumour begins just before an important fixture."], choices: [{ label: "Address it through the club", note: "+3 trust · +2 reputation", effect: { trust: 3, reputation: 2 }, result: "The club handles the message and the noise settles." }, { label: "Ignore it and stay focused", note: "+3 composure · +2 morale", effect: { stat: "composure", amount: 2, morale: 2 }, result: "You keep your attention on training and let your football answer." }] },
  { title: "A penalty decision", tag: "MATCHDAY MOMENT", variants: ["The team wins a penalty and the usual taker is not on the pitch.", "The captain turns to you after the referee points to the spot.", "A penalty is awarded late in the match. The crowd is waiting.", "The team needs a taker for a shootout practice.", "The manager asks who feels ready to take the next penalty.", "A cup tie could be decided from twelve yards."], choices: [{ label: "Take responsibility", note: "+4 reputation · pressure moment", effect: { reputation: 4, stat: "composure", amount: 1, morale: 2 }, result: "You volunteer and begin preparing your routine." }, { label: "Back the regular taker", note: "+3 trust", effect: { trust: 3, morale: 1 }, result: "You support the teammate who has taken them all season." }] },
  { title: "Rest day plans", tag: "RECOVERY", variants: ["The schedule gives you one rare morning without training.", "A recovery window opens after a busy week.", "The staff suggest a light day before the next match.", "The squad has a free afternoon after returning home.", "You can choose how to spend the final hours before matchday.", "The next session is delayed, leaving room for recovery."], choices: [{ label: "Use the recovery room", note: "+12 fitness · +2 morale", effect: { fitness: 12, morale: 2 }, result: "You leave the recovery room loose and ready to move." }, { label: "Get extra work with the ball", note: "+1 dribbling · −5 fitness", effect: { stat: "dribbling", amount: 1, fitness: -5, trust: 1 }, result: "A short technical session gives you a little more confidence." }] },
  { title: "A teammate needs cover", tag: "SQUAD NEWS", variants: ["An injury means the manager needs someone to cover a different role.", "A teammate is suspended, opening a place in the matchday squad.", "The staff ask if you can adapt for the next fixture.", "A late fitness test leaves one position uncertain.", "A busy schedule means the squad needs a versatile option.", "The manager has a decision to make after a teammate feels unwell."], choices: [{ label: "Offer to fill the gap", note: "+5 trust · +1 vision", effect: { trust: 5, stat: "vision", amount: 1, morale: 2 }, result: "You volunteer and the staff start preparing you for the role." }, { label: "Stay with your natural role", note: "+2 morale · +3 fitness", effect: { morale: 2, fitness: 3 }, result: "You explain how you can best help from your usual position." }] },
];

const eventVariants = storySeeds.flatMap((seed, group) => seed.variants.map((variant, index) => ({
  id: `story-${group + 1}-${index + 1}`,
  title: seed.title,
  text: variant,
  tag: seed.tag,
  choices: seed.choices,
}))) as StoryEvent[];

const matchStrength = (career: PlayerCareer, tactic: Tactic): TeamStrength => {
  const positionBonus = career.position === "GK" ? career.stats.defending : career.position.includes("B") ? career.stats.defending : career.stats.shooting;
  const tacticBoost = tactic === "ATTACKING" ? 4 : tactic === "DEFENDING" ? -3 : 0;
  const teamLevel = clubLevel(career.club);
  const currentForm = formScore(career.recentRatings);
  const conditionBoost = (career.fitness - 70) * 0.035 + (career.morale - 50) * 0.035;
  return {
    attack: Math.min(95, teamLevel + conditionBoost + (career.stats.shooting - 60) * 0.14 + (career.stats.passing - 60) * 0.07 + tacticBoost + (positionBonus - 60) * 0.05 + (currentForm - 50) * 0.05),
    defense: Math.min(95, teamLevel + conditionBoost * 0.7 + (career.stats.defending - 60) * 0.14 + (career.stats.physicality - 60) * 0.08 + (tactic === "DEFENDING" ? 4 : tactic === "ATTACKING" ? -3 : 0) + (currentForm - 50) * 0.035),
    pace: career.stats.pace,
    passing: career.stats.passing,
    shooting: career.stats.shooting,
    stamina: career.stats.stamina * (0.7 + career.fitness * 0.003),
    form: currentForm,
    tactic,
  };
};

function randomObjectives(position: string): PlayerCareer["objectives"] {
  if (position === "ST" || position === "LW" || position === "RW") return [
    { title: "Make your mark", detail: "Register a goal or assist in an upcoming appearance.", progress: 0, target: 1, reward: "+2 manager trust", trigger: "contribution" },
    { title: "Keep the pressure on", detail: "Finish a match with a 7.0 rating or better.", progress: 0, target: 1, reward: "+1 shooting", trigger: "rating" },
    { title: "Look after your engine", detail: "Arrive at matchday above 70 fitness.", progress: 0, target: 1, reward: "+8 fitness", trigger: "fitness" },
  ];
  return [
    { title: "Be reliable", detail: "Finish your next appearance with a 6.8 rating or better.", progress: 0, target: 1, reward: "+2 manager trust", trigger: "rating" },
    { title: "Do the hard work", detail: "Complete 2 training sessions this week.", progress: 0, target: 2, reward: "+1 stamina", trigger: "training" },
    { title: "Keep your edge", detail: "Arrive at matchday above 70 fitness.", progress: 0, target: 1, reward: "+8 fitness", trigger: "fitness" },
  ];
}

function startingStats(age: number, position: string, style: string): Stats {
  const stats = { ...INITIAL_STATS };
  const ageShift = age < 19 ? -2 : age <= 27 ? 2 : age <= 31 ? 0 : -2;
  for (const key of Object.keys(stats) as (keyof Stats)[]) stats[key] += ageShift;
  const positionBoosts: Partial<Record<string, Partial<Stats>>> = {
    ST: { shooting: 8, pace: 4, strength: 3 }, LW: { pace: 7, dribbling: 6, shooting: 2 }, RW: { pace: 7, dribbling: 6, shooting: 2 },
    CAM: { passing: 6, vision: 8, dribbling: 4 }, CM: { passing: 5, stamina: 5, vision: 3 }, CDM: { defending: 7, strength: 4, stamina: 3 },
    LB: { defending: 6, pace: 5, stamina: 3 }, CB: { defending: 9, strength: 7, pace: -3 }, RB: { defending: 6, pace: 5, stamina: 3 },
    GK: { defending: 12, composure: 6, shooting: -15, pace: -12, dribbling: -8 },
  };
  const styleBoosts: Record<string, Partial<Stats>> = {
    "Quick feet": { pace: 3, dribbling: 4 }, "Power finisher": { shooting: 5, strength: 3 }, Playmaker: { passing: 5, vision: 5 },
    "Ball winner": { defending: 5, strength: 3 }, "Box-to-box": { stamina: 5, passing: 2 }, "Calm keeper": { defending: 5, composure: 5 },
  };
  for (const [key, boost] of Object.entries(positionBoosts[position] || {})) stats[key as keyof Stats] += boost;
  for (const [key, boost] of Object.entries(styleBoosts[style] || {})) stats[key as keyof Stats] += boost;
  return Object.fromEntries(Object.entries(stats).map(([key, value]) => [key, Math.max(40, Math.min(86, value))])) as Stats;
}

const initialCareer = (draft: { playerName: string; age: number; position: string; foot: string; kitNumber: number; skin: string; hair: string; hairColor: string; boots: string; kitColor: string; style: string; club: string; league: string; leagueCode: string }) : PlayerCareer => ({
  id: crypto.randomUUID(), ...draft, stats: startingStats(draft.age, draft.position, draft.style), season: 2026, matchday: 1,
  appearances: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0, cleanSheets: 0,
  averageRating: 0, lastRating: 0, recentRatings: [], fitness: 88, morale: 72, managerTrust: 35, reputation: 8,
  marketValue: 160000, salary: 1800, contractYears: 3, injuryDays: 0, trainingPoints: 0, skillPoints: 0,
  objectives: randomObjectives(draft.position), history: [{ date: new Date().toISOString(), title: "A new chapter begins", detail: `You sign your first deal with ${draft.club}.` }], eventSeen: [],
});

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not played yet" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function GameModeSelect({ onOffline, onOnline }: { onOffline: () => void; onOnline: () => void }) {
  return (
    <main className="mode-gate">
      <div className="mode-noise" />
      <header className="mode-top"><span className="nebula-wordmark mode-wordmark"><strong>NEBULA</strong><small>FUT.</small></span><span className="mode-live"><i /> THE NEXT CHAPTER IS YOURS</span></header>
      <section className="mode-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .6 }}>
          <span className="career-eyebrow"><Sparkles size={14} /> NEBULAFUT 26 / 27</span>
          <h1>Select your game mode<br /><em>and start your journey.</em></h1>
          <p>Build a club with friends, or step into one player’s story. Take the first step when you’re ready.</p>
        </motion.div>
        <div className="mode-choice-grid">
          <motion.button className="mode-choice-card offline-choice" onClick={onOffline} whileHover={{ y: -6, scale: 1.012 }} whileTap={{ scale: .985 }}>
            <span className="mode-card-top"><span><UserRound size={17} /> YOUR STORY</span><ArrowRight size={18} /></span>
            <span className="mode-visual mode-visual-offline"><i className="mode-orbit orbit-one" /><i className="mode-orbit orbit-two" /><span className="mode-silhouette"><Shirt size={48} /></span><span className="mode-float-label">ONE PLAYER<br /><b>A WHOLE CAREER</b></span><span className="mode-rating">#<b>09</b></span></span>
            <span className="mode-card-copy"><b>OFFLINE</b><small>Become a player. Make every choice count.</small><span className="mode-tags"><i>CAREER</i><i>LOCAL SAVES</i><i>YOUR STORY</i></span></span>
          </motion.button>
          <motion.button className="mode-choice-card online-choice" onClick={onOnline} whileHover={{ y: -6, scale: 1.012 }} whileTap={{ scale: .985 }}>
            <span className="mode-card-top"><span><Users size={17} /> YOUR CLUB</span><ArrowRight size={18} /></span>
            <span className="mode-visual mode-visual-online"><span className="online-orb orb-left"><Shield size={29} /></span><span className="online-vs">VS</span><span className="online-orb orb-right"><Swords size={29} /></span><span className="mode-float-label">BUILD A CLUB<br /><b>CHALLENGE A FRIEND</b></span><i className="online-glow" /></span>
            <span className="mode-card-copy"><b>ONLINE</b><small>Open packs, build your XI and play a friend.</small><span className="mode-tags"><i>ULTIMATE CLUB</i><i>FRIEND ROOMS</i><i>YOUR SQUAD</i></span></span>
          </motion.button>
        </div>
        <div className="mode-footnote"><Shield size={14} /> Signed in as an NEBULAFUT player <span>·</span> Your offline careers stay in this browser</div>
      </section>
      <footer className="mode-footer"><span>NEBULA <b>FUT.</b></span><span>FOOTBALL IS ONLY THE BEGINNING</span><span>26 / 27</span></footer>
    </main>
  );
}

export function CareerMode({ playerName, onBack, onOnline }: { playerName: string; onBack: () => void; onOnline: () => void }) {
  const [saves, setSaves] = useState<SaveSlot[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState({ saveName: "My Career", playerName, age: 18, randomAge: false, position: "ST", foot: "Right", kitNumber: 9, skin: SKIN_TONES[1], hair: HAIR_STYLES[0], hairColor: HAIR_COLORS[0], boots: BOOT_COLORS[0], kitColor: KIT_COLORS[0], style: "Quick feet", league: "Premier League", club: "Arsenal", leagueCode: "PL" });
  const [message, setMessage] = useState("");
  const [editingSave, setEditingSave] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [tactic, setTactic] = useState<Tactic>("BALANCED");
  const [directorPlan, setDirectorPlan] = useState<DirectorPlan | null>(null);
  const [directorBusy, setDirectorBusy] = useState(false);
  const [directorTransferBusy, setDirectorTransferBusy] = useState(false);
  const [directorMessage, setDirectorMessage] = useState("Your career director is ready to study the next fixture.");
  const [liveMatch, setLiveMatch] = useState<MatchEvent | null>(null);
  const [matchRunning, setMatchRunning] = useState(false);
  const [matchLog, setMatchLog] = useState<MatchEvent[]>([]);
  const [liveTable, setLiveTable] = useState<LeagueRow[]>([]);
  const [liveTableMessage, setLiveTableMessage] = useState("Choose a league to load its latest table.");
  const [livePlayers, setLivePlayers] = useState<LivePlayer[]>([]);
  const [liveSearch, setLiveSearch] = useState("");
  const [liveStatsBusy, setLiveStatsBusy] = useState(false);
  const [liveStatsMessage, setLiveStatsMessage] = useState("");
  const directorPlanRef = useRef<DirectorPlan | null>(null);
  const matchTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const timelineRef = useRef<MatchEvent[]>([]);
  const matchIndex = useRef(0);

  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(SAVE_KEY) || "[]") as SaveSlot[];
      if (Array.isArray(parsed)) setSaves(parsed);
    } catch { setSaves([]); }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated) localStorage.setItem(SAVE_KEY, JSON.stringify(saves));
  }, [hydrated, saves]);
  useEffect(() => () => { if (matchTimer.current) clearInterval(matchTimer.current); }, []);

  const activeSave = saves.find((slot) => slot.id === activeId) || null;
  const career = activeSave?.career || null;
  const patchCareer = useCallback((update: (current: PlayerCareer) => PlayerCareer) => {
    setSaves((current) => current.map((slot) => slot.id === activeId ? { ...slot, career: update(slot.career), lastPlayed: new Date().toISOString() } : slot));
  }, [activeId]);

  const careerAiSummary = (current: PlayerCareer) => ({
    playerName: current.playerName,
    age: current.age,
    position: current.position,
    overall: Math.round(Object.values(current.stats).reduce((sum, stat) => sum + stat, 0) / Object.keys(current.stats).length),
    formGrade: formGrade(current.recentRatings),
    formScore: formScore(current.recentRatings),
    recentRatings: current.recentRatings || [],
    appearances: current.appearances,
    goals: current.goals,
    assists: current.assists,
    averageRating: current.averageRating,
    lastRating: current.lastRating,
    reputation: current.reputation,
    managerTrust: current.managerTrust,
    morale: current.morale,
    fitness: current.fitness,
    club: current.club,
    league: current.league,
  });

  const requestMatchPlan = async (current: PlayerCareer, opponent: string): Promise<DirectorPlan> => {
    const candidates = careerClubs(current.club);
    try {
      const response = await fetch("/api/career-director", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "match-plan", career: careerAiSummary(current), opponent: { name: opponent, level: clubLevel(opponent) }, clubs: candidates }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Groq is not connected yet.");
      const approaches: OpponentApproach[] = ["press", "mid_block", "low_block", "counter"];
      const approach = approaches.includes(data.approach) ? data.approach as OpponentApproach : "mid_block";
      const plan: DirectorPlan = {
        source: "groq", approach,
        difficulty: Math.max(-2, Math.min(2, Number(data.difficulty) || 0)),
        briefing: typeof data.briefing === "string" ? data.briefing : "The opposition has prepared a measured plan.",
        scoutingClub: candidates.find((club) => club.id === data.scoutingClubId) || null,
        scoutingNote: typeof data.scoutingNote === "string" ? data.scoutingNote : "Scouting decisions follow form and performance.",
      };
      directorPlanRef.current = plan;
      setDirectorPlan(plan);
      setDirectorMessage(`GROQ DIRECTOR · ${plan.briefing}`);
      return plan;
    } catch (error) {
      const currentLevel = clubLevel(current.club);
      const form = formScore(current.recentRatings);
      const approach: OpponentApproach = form >= 76 ? "low_block" : clubLevel(opponent) > currentLevel + 12 ? "counter" : form < 42 ? "press" : "mid_block";
      const plan: DirectorPlan = {
        source: "local", approach,
        difficulty: Math.max(-1, Math.min(1, Math.round((clubLevel(opponent) - currentLevel - 8) / 12))),
        briefing: error instanceof Error ? `Local director active · ${error.message}` : "Local director active · using form-based opponent tactics.",
        scoutingClub: null,
        scoutingNote: "Add GROQ_API_KEY in Vercel to enable AI-managed transfer scouting.",
      };
      directorPlanRef.current = plan;
      setDirectorPlan(plan);
      setDirectorMessage(`LOCAL DIRECTOR · ${plan.briefing}`);
      return plan;
    }
  };

  const requestTransferReview = async (projected: PlayerCareer, result: MatchEvent, rating: number, contributed: boolean): Promise<ClubOffer | null> => {
    const score = formScore(projected.recentRatings);
    const eligible = projected.appearances >= 3 && (rating >= 6.7 || contributed || score >= 67);
    if (!eligible) return null;
    const chance = Math.max(0.08, Math.min(0.42, 0.08 + Math.max(0, rating - 6.7) * 0.07 + Math.max(0, score - 55) * 0.003 + projected.reputation * 0.001 + (contributed ? 0.08 : 0)));
    if (Math.random() > chance) return null;

    setDirectorTransferBusy(true);
    setDirectorMessage("SCOUTING REVIEW · Checking your form, role and realistic next steps.");
    const allCandidates = careerClubs(projected.club);
    const watchedClub = directorPlanRef.current?.scoutingClub || null;
    const candidates = watchedClub ? [watchedClub] : allCandidates;
    try {
      const response = await fetch("/api/career-director", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "transfer-review", career: careerAiSummary(projected), result: { home: result.home, away: result.away, playerRating: rating, contributed }, clubs: candidates }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "The AI scouting desk is unavailable.");
      const choice = candidates.find((club) => club.name === data.offer?.club && club.code === data.offer?.code);
      if (!choice) { setDirectorMessage(typeof data.note === "string" ? data.note : "No club has made a move yet. Keep building your reputation."); return null; }
      const ratingDelta = choice.level - clubLevel(projected.club);
      const wageFactor = Math.max(0.95, Math.min(1.75, 1.05 + (rating - 6.4) * 0.16 + (score - 50) * 0.003 + ratingDelta * 0.007));
      const role = rating >= 8 && score >= 72 ? "Important first-team role" : rating >= 7 ? "Rotation role with a path to the XI" : "Development role with a first-team pathway";
      const offer: ClubOffer = {
        club: choice.name, league: choice.league, code: choice.code, role,
        wages: Math.round(projected.salary * wageFactor), weeks: rating >= 8 ? 4 : rating >= 7 ? 3 : 2,
        reason: typeof data.offer.reason === "string" ? data.offer.reason.slice(0, 180) : "Scouts have noticed your recent performances.",
      };
      setDirectorMessage(`GROQ DIRECTOR · ${choice.name} have made a realistic approach.`);
      return offer;
    } catch (error) {
      const suitable = candidates.map((club) => ({ club, distance: Math.abs(club.level - (clubLevel(projected.club) + (rating - 6.5) * 2.5)) })).sort((a, b) => a.distance - b.distance).slice(0, 4);
      const choice = suitable[Math.floor(Math.random() * suitable.length)]?.club;
      if (!choice) return null;
      const offer: ClubOffer = {
        club: choice.name, league: choice.league, code: choice.code,
        role: rating >= 8 ? "Important first-team role" : rating >= 7 ? "Rotation role with a path to the XI" : "Development role with a first-team pathway",
        wages: Math.round(projected.salary * Math.max(0.95, Math.min(1.65, 1.04 + (rating - 6.4) * 0.15 + (score - 50) * 0.003))),
        weeks: rating >= 8 ? 4 : rating >= 7 ? 3 : 2,
        reason: "A nearby-level club has asked your representatives to keep them updated.",
      };
      setDirectorMessage(`LOCAL SCOUTING RULES · ${error instanceof Error ? error.message : "Groq is unavailable."}`);
      return offer;
    } finally { setDirectorTransferBusy(false); }
  };

  const createCareer = () => {
    const selectedAge = draft.randomAge ? 17 + Math.floor(Math.random() * 10) : draft.age;
    const selectedName = draft.playerName.trim() || RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
    const age = Math.max(16, Math.min(38, selectedAge));
    const career = initialCareer({ playerName: selectedName, age, position: draft.position, foot: draft.foot, kitNumber: draft.kitNumber, skin: draft.skin, hair: draft.hair, hairColor: draft.hairColor, boots: draft.boots, kitColor: draft.kitColor, style: draft.style, club: draft.club, league: draft.league, leagueCode: draft.leagueCode });
    const now = new Date().toISOString();
    const slot: SaveSlot = { id: career.id, saveName: draft.saveName.trim() || `${selectedName} Career`, career, lastPlayed: now, createdAt: now };
    directorPlanRef.current = null; setDirectorPlan(null);
    setSaves((current) => [slot, ...current]); setActiveId(slot.id); setCreating(false); setStep(0); setTab("overview"); setMessage("Your first chapter starts now.");
  };

  const loadSave = (id: string) => { directorPlanRef.current = null; setDirectorPlan(null); setActiveId(id); setTab("overview"); setLiveMatch(null); setMatchRunning(false); setSaves((current) => current.map((slot) => slot.id === id ? { ...slot, lastPlayed: new Date().toISOString() } : slot)); };
  const renameSave = (id: string) => {
    if (!renameText.trim()) return;
    setSaves((current) => current.map((slot) => slot.id === id ? { ...slot, saveName: renameText.trim() } : slot)); setEditingSave(null);
  };
  const deleteSave = (id: string) => { setSaves((current) => current.filter((slot) => slot.id !== id)); if (activeId === id) setActiveId(null); };
  const exportSave = (slot: SaveSlot) => {
    const file = new Blob([JSON.stringify(slot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(file); const link = document.createElement("a"); link.href = url; link.download = `${slot.saveName.replace(/[^a-z0-9-_]/gi, "-")}.json`; link.click(); URL.revokeObjectURL(url);
  };

  const requestNewEvent = () => {
    if (!career) return;
    const available = eventVariants.filter((event) => !career.eventSeen.includes(event.id));
    const pool = available.length ? available : eventVariants;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    patchCareer((current) => ({ ...current, pendingEvent: picked, eventSeen: available.length ? current.eventSeen : [], history: [{ date: new Date().toISOString(), title: "A moment off the pitch", detail: picked.title }, ...current.history] }));
    setTab("inbox");
  };

  const chooseStory = (choice: StoryChoice) => {
    if (!career) return;
    patchCareer((current) => {
      const effect = choice.effect;
      const stats = effect.stat && effect.amount ? { ...current.stats, [effect.stat]: Math.min(99, current.stats[effect.stat] + effect.amount) } : current.stats;
      return {
        ...current, stats,
        morale: Math.max(0, Math.min(100, current.morale + (effect.morale || 0))),
        fitness: Math.max(0, Math.min(100, current.fitness + (effect.fitness || 0))),
        managerTrust: Math.max(0, Math.min(100, current.managerTrust + (effect.trust || 0))),
        reputation: Math.max(0, Math.min(100, current.reputation + (effect.reputation || 0))),
        injuryDays: Math.max(0, current.injuryDays + (effect.injury || 0)),
        marketValue: Math.max(5000, current.marketValue + (effect.value || 0)),
        pendingEvent: undefined,
        history: [{ date: new Date().toISOString(), title: current.pendingEvent?.title || "A decision made", detail: choice.result }, ...current.history].slice(0, 80),
      };
    });
  };

  const finishCareerMatch = (timeline: MatchEvent[]) => {
    if (!career) return;
    const final = timeline[timeline.length - 1];
    const won = final.home > final.away;
    const draw = final.home === final.away;
    const goalChance = career.position === "ST" || career.position === "LW" || career.position === "RW" ? 0.38 : career.position === "CAM" || career.position === "CM" ? 0.19 : 0.05;
    const scored = final.home > 0 && Math.random() < goalChance + (career.stats.shooting - 60) / 250;
    const assisted = final.home > 0 && !scored && Math.random() < 0.25 + (career.stats.passing - 60) / 200;
    const rating = Math.round(Math.max(5.1, Math.min(9.8, 6.25 + (career.stats.composure - 60) / 50 + (won ? 0.7 : draw ? 0.15 : -0.25) + (scored ? 1.2 : 0) + (assisted ? 0.7 : 0) - (final.homeRedCards ? 0.2 : 0) + (Math.random() - 0.5) * 0.5)) * 10) / 10;
    const opponent = nextOpponent(career);
    const recentRatings = [rating, ...(career.recentRatings || [])].slice(0, 5);
    const projectedAppearances = career.appearances + 1;
    const projectedGoals = career.goals + (scored ? 1 : 0);
    const projectedAssists = career.assists + (assisted ? 1 : 0);
    const projectedAverage = Math.round(((career.averageRating * career.appearances + rating) / projectedAppearances) * 10) / 10;
    const projected: PlayerCareer = { ...career, appearances: projectedAppearances, goals: projectedGoals, assists: projectedAssists, averageRating: projectedAverage, lastRating: rating, recentRatings };
    patchCareer((current) => {
      const appearances = current.appearances + 1;
      const goals = current.goals + (scored ? 1 : 0);
      const assists = current.assists + (assisted ? 1 : 0);
      const newAverage = Math.round(((current.averageRating * current.appearances + rating) / appearances) * 10) / 10;
      const table = current.officialTable;
      let objectives = current.objectives.map((objective) => {
        const achieved = objective.trigger === "contribution" ? scored || assisted
          : objective.trigger === "rating" ? rating >= (objective.title === "Be reliable" ? 6.8 : 7)
            : objective.trigger === "fitness" ? current.fitness >= 70 : false;
        return { ...objective, progress: Math.min(objective.target, objective.progress + (achieved ? 1 : 0)) };
      });
      let skillPoints = current.skillPoints;
      let trustReward = 0;
      let shootingReward = 0;
      let fitnessReward = 0;
      objectives = objectives.map((objective) => {
        if (objective.progress >= objective.target && objective.target > 0) {
          if (objective.reward.includes("trust")) trustReward += 2;
          if (objective.reward.includes("shooting")) shootingReward += 1;
          if (objective.reward.includes("fitness")) fitnessReward += 8;
          skillPoints += 1;
          return { ...objective, target: 0, detail: "Completed · reward added to your career." };
        }
        return objective;
      });
      const next: PlayerCareer = {
        ...current, appearances, goals, assists, averageRating: newAverage, lastRating: rating, recentRatings,
        stats: { ...current.stats, shooting: Math.min(99, current.stats.shooting + shootingReward) },
        fitness: Math.max(20, Math.min(100, current.fitness - (7 + Math.floor(Math.random() * 4)) + fitnessReward)), morale: Math.min(100, current.morale + (won ? 4 : draw ? 1 : -3)),
        managerTrust: Math.max(0, Math.min(100, current.managerTrust + trustReward + (rating >= 7 ? 3 : rating < 6 ? -2 : 1))),
        reputation: Math.min(100, current.reputation + (scored ? 4 : assisted ? 3 : won ? 1 : 0)),
        marketValue: Math.round(current.marketValue * (1 + (rating >= 7.5 ? 0.035 : 0.006))),
        matchday: current.matchday + 1, skillPoints, objectives,
        history: [{ date: new Date().toISOString(), title: `${won ? "A win" : draw ? "A draw" : "A loss"} · ${final.home}–${final.away} vs ${opponent}`, detail: `${scored ? "You scored. " : ""}${assisted ? "You supplied an assist. " : ""}Match rating ${rating.toFixed(1)}.`, rating }, ...current.history].slice(0, 80),
      };
      if (next.matchday > 38) { next.season += 1; next.matchday = 1; next.objectives = randomObjectives(next.position); next.history = [{ date: new Date().toISOString(), title: `Season ${next.season} begins`, detail: "A new league campaign starts. Your next chapter is waiting." }, ...next.history]; }
      if (table?.length) {
        const own = table.find((row) => row.team === current.club);
        if (own) next.officialTable = table.map((row) => row.team === current.club ? { ...row, playedGames: row.playedGames + 1, won: row.won + (won ? 1 : 0), draw: row.draw + (draw ? 1 : 0), lost: row.lost + (!won && !draw ? 1 : 0), points: row.points + (won ? 3 : draw ? 1 : 0) } : row).sort((a, b) => b.points - a.points).map((row, index) => ({ ...row, position: index + 1 }));
      }
      return next;
    });
    setMessage(`Full-time · your rating: ${rating.toFixed(1)}${scored ? " · You scored" : assisted ? " · You assisted" : ""}`);
    setMatchRunning(false);
    setTab("matchday");
    void requestTransferReview(projected, final, rating, scored || assisted).then((offer) => {
      if (!offer) return;
      patchCareer((current) => ({ ...current, pendingOffer: offer, history: [{ date: new Date().toISOString(), title: `Club interest · ${offer.club}`, detail: `${offer.reason} They propose a ${offer.role.toLowerCase()} in ${offer.league}.` }, ...current.history].slice(0, 80) }));
      setMessage(`${offer.club} have made an offer. Review it on matchday.`);
    });
  };

  const startCareerMatch = async () => {
    if (!career || career.injuryDays > 0) { setMessage("You are not available for selection yet. Check the medical room."); return; }
    setDirectorBusy(true);
    setMessage("The career director is studying the opposition…");
    const opponentName = nextOpponent(career);
    const plan = await requestMatchPlan(career, opponentName);
    setDirectorBusy(false);
    const home = matchStrength(career, tactic);
    const oppositionLevel = clubLevel(opponentName) + plan.difficulty * 1.5;
    const approachAdjustments: Record<OpponentApproach, { attack: number; defense: number; pace: number }> = {
      press: { attack: 2.5, defense: -1.5, pace: 2 },
      mid_block: { attack: 0, defense: 0, pace: 0 },
      low_block: { attack: -1, defense: 3, pace: -1 },
      counter: { attack: 1, defense: 1, pace: 3 },
    };
    const adjustment = approachAdjustments[plan.approach];
    const away: TeamStrength = {
      attack: oppositionLevel + adjustment.attack + (Math.random() - 0.5) * 8,
      defense: oppositionLevel + adjustment.defense + (Math.random() - 0.5) * 8,
      pace: oppositionLevel + adjustment.pace + (Math.random() - 0.5) * 10,
      passing: oppositionLevel + (Math.random() - 0.5) * 10,
      shooting: oppositionLevel + (Math.random() - 0.5) * 8,
      stamina: 68 + Math.random() * 20,
      form: 42 + Math.random() * 34,
      approach: plan.approach,
    };
    const timeline = createMatchTimeline(home, away);
    timelineRef.current = timeline; matchIndex.current = 0;
    setMatchLog([]); setLiveMatch({ ...timeline[0], minute: 0, home: 0, away: 0, homeShots: 0, awayShots: 0, commentary: "The tunnel opens. The referee checks both teams before kick-off.", kind: "kickoff" });
    setMatchRunning(true); setTab("matchday"); setMessage(`The opposition will use a ${plan.approach.replace("_", " ")} approach.`);
    if (matchTimer.current) clearInterval(matchTimer.current);
    matchTimer.current = setInterval(() => {
      const index = matchIndex.current;
      const event = timelineRef.current[index];
      if (!event) return;
      setLiveMatch(event); setMatchLog((current) => [event, ...current].slice(0, 8));
      matchIndex.current += 1;
      if (matchIndex.current >= timelineRef.current.length) {
        if (matchTimer.current) clearInterval(matchTimer.current);
        matchTimer.current = null;
        finishCareerMatch(timelineRef.current);
      }
    }, 1350);
  };

  const loadStandings = async (leagueCode: string) => {
    setLiveTableMessage("Loading the latest league table…");
    try {
      const response = await fetch(`/api/football-data/standings?league=${encodeURIComponent(leagueCode)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not load the standings.");
      const rows = (data.standings || []) as LeagueRow[];
      setLiveTable(rows); setLiveTableMessage(data.stale ? "Showing the provider’s last recorded table." : data.updatedAt ? `Current table · fetched ${formatTime(data.updatedAt)}` : "Current table loaded.");
      patchCareer((current) => ({ ...current, officialTable: rows, officialTableUpdatedAt: data.updatedAt || new Date().toISOString() }));
    } catch (error) {
      setLiveTable([]); setLiveTableMessage(error instanceof Error ? error.message : "League data is unavailable right now.");
    }
  };

  const loadLivePlayers = async () => {
    if (liveSearch.trim().length < 2) { setLiveStatsMessage("Enter at least 2 letters to search the live player feed."); return; }
    setLiveStatsBusy(true); setLiveStatsMessage("");
    try {
      const response = await fetch(`/api/live-football/players?search=${encodeURIComponent(liveSearch.trim())}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Live player data is unavailable.");
      setLivePlayers((data.players || []) as LivePlayer[]); setLiveStatsMessage(data.updatedAt ? `Player feed refreshed ${formatTime(data.updatedAt)}.` : "Player feed loaded.");
    } catch (error) { setLivePlayers([]); setLiveStatsMessage(error instanceof Error ? error.message : "Could not reach live player data."); }
    finally { setLiveStatsBusy(false); }
  };

  const completeTraining = (focus: keyof Stats, cost: number, amount: number, label: string) => {
    if (!career) return;
    if (career.fitness < cost) { setMessage("Your fitness is too low for another hard session. Choose recovery first."); return; }
    patchCareer((current) => {
      let staminaReward = 0;
      let trustReward = 0;
      let skillPoints = current.skillPoints;
      const objectives = current.objectives.map((objective) => {
        const progress = objective.trigger === "training" ? Math.min(objective.target, objective.progress + 1) : objective.progress;
        if (objective.trigger === "training" && progress >= objective.target && objective.target > 0) {
          staminaReward += 1; trustReward += objective.reward.includes("trust") ? 2 : 0; skillPoints += 1;
          return { ...objective, progress, target: 0, detail: "Completed · reward added to your career." };
        }
        return { ...objective, progress };
      });
      return { ...current, objectives, skillPoints, stats: { ...current.stats, [focus]: Math.min(99, current.stats[focus] + amount), stamina: Math.min(99, current.stats.stamina + staminaReward) }, managerTrust: Math.min(100, current.managerTrust + trustReward), fitness: Math.max(0, current.fitness - cost), trainingPoints: current.trainingPoints + 1, history: [{ date: new Date().toISOString(), title: `Training · ${label}`, detail: `${label} improved by ${amount}.` }, ...current.history].slice(0, 80) };
    });
    setMessage(`${label} session complete. You feel sharper already.`);
  };

  const acceptOffer = () => {
    if (!career?.pendingOffer) return;
    const offer = career.pendingOffer;
    patchCareer((current) => ({ ...current, club: offer.club, league: offer.league, leagueCode: offer.code, salary: offer.wages, contractYears: offer.weeks, managerTrust: Math.max(35, current.managerTrust - 5), morale: Math.min(100, current.morale + 8), pendingOffer: undefined, officialTable: undefined, history: [{ date: new Date().toISOString(), title: `Transfer agreed · ${offer.club}`, detail: `You accept the ${offer.role.toLowerCase()} and begin a new chapter in ${offer.league}.` }, ...current.history] }));
    setLiveTable([]); setLiveTableMessage("Choose a league to load its latest table."); setMessage(`Transfer agreed. Welcome to ${offer.club}.`);
  };

  const menu: { id: Tab; title: string; icon: typeof Trophy }[] = [
    { id: "overview", title: "My Journey", icon: Shield }, { id: "matchday", title: "Matchday", icon: Swords },
    { id: "training", title: "Training", icon: Dumbbell }, { id: "inbox", title: "Inbox", icon: MessageCircle },
    { id: "league", title: "League & Scouting", icon: Trophy }, { id: "rules", title: "Rules room", icon: CircleHelp },
    { id: "profile", title: "Player profile", icon: UserRound },
  ];

  const rosterAverage = career ? Math.round(Object.values(career.stats).reduce((sum, stat) => sum + stat, 0) / 10) : 0;
  const activeObjectives = career?.objectives.filter((objective) => objective.target > 0) || [];

  const renderSaveSlots = () => (
    <div className="career-save-page">
      <div className="career-save-heading"><div><span className="career-eyebrow"><Save size={14} /> LOCAL CAREER SAVES</span><h1>Pick up where you left off.</h1><p>Your career files live in this browser. Create as many stories as you like.</p></div><button className="career-button career-button-light" onClick={onBack}><ArrowLeft size={15} /> GAME MODES</button></div>
      <div className="save-slot-list">
        {saves.map((slot, index) => <motion.article className="save-slot-card" key={slot.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .055 }}>
          <div className="save-avatar" style={{ background: `linear-gradient(145deg,${slot.career.skin},#14231c)` }}><span>{slot.career.kitNumber.toString().padStart(2, "0")}</span><Shirt size={24} /></div>
          <div className="save-slot-info">{editingSave === slot.id ? <div className="rename-save"><input value={renameText} onChange={(event) => setRenameText(event.target.value)} autoFocus /><button onClick={() => renameSave(slot.id)} aria-label="Save name"><Check size={16} /></button><button onClick={() => setEditingSave(null)} aria-label="Cancel rename"><X size={16} /></button></div> : <h2>{slot.saveName}</h2>}<p>{slot.career.playerName} · {slot.career.age} · {slot.career.position} · {slot.career.club}</p><div className="save-meta"><span><Clock3 size={13} /> Last played {formatTime(slot.lastPlayed)}</span><span>SEASON {slot.career.season} · MATCHDAY {slot.career.matchday}</span></div></div>
          <div className="save-slot-actions"><button className="career-button career-button-green" onClick={() => loadSave(slot.id)}>CONTINUE <ArrowRight size={14} /></button><div><button onClick={() => { setEditingSave(slot.id); setRenameText(slot.saveName); }} aria-label="Rename save"><span>RENAME</span></button><button onClick={() => exportSave(slot)} aria-label="Export save"><Download size={15} /></button><button onClick={() => window.confirm("Delete this career save from this browser?") && deleteSave(slot.id)} aria-label="Delete save"><Trash2 size={15} /></button></div></div>
        </motion.article>)}
        <button className="new-save-card" onClick={() => { setCreating(true); setActiveId(null); setStep(0); }}><span className="new-save-plus"><Plus size={24} /></span><span><b>Start a new career</b><small>New player. New club. New story.</small></span><ArrowRight size={19} /></button>
        {!saves.length && <p className="no-careers">Nothing saved yet. Your first career will appear here.</p>}
      </div>
    </div>
  );

  const renderCreator = () => {
    const selectedLeague = LEAGUES.find((league) => league.name === draft.league) || LEAGUES[0];
    const updateDraft = (values: Partial<typeof draft>) => setDraft((current) => ({ ...current, ...values }));
    const chooseLeague = (league: typeof LEAGUES[number]) => updateDraft({ league: league.name, leagueCode: league.apiCode, club: league.clubs[0] });
    const shuffle = () => updateDraft({ playerName: RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)], age: 17 + Math.floor(Math.random() * 10), randomAge: false, position: POSITIONS[Math.floor(Math.random() * POSITIONS.length)], foot: Math.random() > .5 ? "Right" : "Left", kitNumber: 1 + Math.floor(Math.random() * 99), skin: SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)], hair: HAIR_STYLES[Math.floor(Math.random() * HAIR_STYLES.length)], hairColor: HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)], boots: BOOT_COLORS[Math.floor(Math.random() * BOOT_COLORS.length)], kitColor: KIT_COLORS[Math.floor(Math.random() * KIT_COLORS.length)] });
    return <div className="career-create-page"><div className="career-create-top"><button className="career-back" onClick={() => { if (step > 0) setStep(step - 1); else setCreating(false); }}><ArrowLeft size={15} /> BACK</button><span>PLAYER CREATION · {step + 1} OF 3</span><button className="shuffle-player" onClick={shuffle}><WandSparkles size={15} /> RANDOMISE PLAYER</button></div><div className="creator-progress"><i style={{ width: `${(step + 1) / 3 * 100}%` }} /></div>
      <AnimatePresence mode="wait"><motion.section key={step} className="creator-step" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }} transition={{ duration: .22 }}>
        {step === 0 && <><span className="career-eyebrow"><UserRound size={14} /> FIRST, WHO ARE YOU?</span><h1>Every career starts<br />with a name.</h1><p>Start with the basics. You can shape the rest of your story as you play.</p><div className="creator-form-grid"><label>PLAYER NAME<input maxLength={32} value={draft.playerName} onChange={(event) => updateDraft({ playerName: event.target.value })} placeholder="Your player name" /></label><label>CAREER SAVE NAME<input maxLength={32} value={draft.saveName} onChange={(event) => updateDraft({ saveName: event.target.value })} placeholder="My Career" /></label><label>AGE<div className="age-picker"><input type="range" min="16" max="38" value={draft.age} disabled={draft.randomAge} onChange={(event) => updateDraft({ age: Number(event.target.value) })} /><b>{draft.randomAge ? "RANDOM" : draft.age}</b><button className={draft.randomAge ? "choice-pill selected" : "choice-pill"} onClick={() => updateDraft({ randomAge: !draft.randomAge })}><WandSparkles size={13} /> Random age</button></div></label><label>POSITION<select value={draft.position} onChange={(event) => updateDraft({ position: event.target.value })}>{POSITIONS.map((position) => <option key={position}>{position}</option>)}</select></label><label>PREFERRED FOOT<div className="creator-choice-row"><button className={draft.foot === "Right" ? "choice-pill selected" : "choice-pill"} onClick={() => updateDraft({ foot: "Right" })}>RIGHT</button><button className={draft.foot === "Left" ? "choice-pill selected" : "choice-pill"} onClick={() => updateDraft({ foot: "Left" })}>LEFT</button></div></label><label>PLAYING STYLE<select value={draft.style} onChange={(event) => updateDraft({ style: event.target.value })}><option>Quick feet</option><option>Power finisher</option><option>Playmaker</option><option>Ball winner</option><option>Box-to-box</option><option>Calm keeper</option></select></label></div><button className="career-button career-button-green creator-next" onClick={() => setStep(1)}>CUSTOMISE YOUR PLAYER <ArrowRight size={16} /></button></>}
        {step === 1 && <><span className="career-eyebrow"><Shirt size={14} /> MAKE IT FEEL LIKE YOU</span><h1>Make an entrance.</h1><p>Choose the look, then pick a league and a club ready to give you your first chance.</p><div className="creator-custom-layout"><div className="player-preview-card" style={{ "--player-skin": draft.skin, "--player-boot": draft.boots, "--player-hair": draft.hairColor, "--player-kit": draft.kitColor } as CSSProperties}><div className="preview-stadium" /><div className="preview-rating">{draft.kitNumber.toString().padStart(2, "0")}<small>{draft.position}</small></div><div className="preview-player"><i className={`preview-hair preview-hair-${draft.hair.replaceAll(" ", "-").toLowerCase()}`} /><Shirt size={82} /></div><div className="preview-name">{draft.playerName || "YOUR PLAYER"}</div><div className="preview-club">{draft.club.toUpperCase()} · {draft.league.toUpperCase()}</div><div className="preview-statline">PACE <b>{startingStats(draft.age, draft.position, draft.style).pace}</b> SHO <b>{startingStats(draft.age, draft.position, draft.style).shooting}</b> PAS <b>{startingStats(draft.age, draft.position, draft.style).passing}</b></div></div><div className="creator-controls"><div className="creator-setting"><span>SKIN TONE</span><div className="swatch-row">{SKIN_TONES.map((tone) => <button key={tone} onClick={() => updateDraft({ skin: tone })} className={draft.skin === tone ? "swatch selected" : "swatch"} style={{ background: tone }} aria-label="Choose skin tone" />)}</div></div><div className="creator-setting"><span>HAIRSTYLE</span><select value={draft.hair} onChange={(event) => updateDraft({ hair: event.target.value })}>{HAIR_STYLES.map((hair) => <option key={hair}>{hair}</option>)}</select></div><div className="creator-setting"><span>HAIR COLOUR</span><div className="swatch-row">{HAIR_COLORS.map((color) => <button key={color} onClick={() => updateDraft({ hairColor: color })} className={draft.hairColor === color ? "swatch selected" : "swatch"} style={{ background: color }} aria-label="Choose hair colour" />)}</div></div><div className="creator-setting"><span>BOOT COLOUR</span><div className="swatch-row">{BOOT_COLORS.map((color) => <button key={color} onClick={() => updateDraft({ boots: color })} className={draft.boots === color ? "swatch selected" : "swatch"} style={{ background: color }} aria-label="Choose boot colour" />)}</div></div><div className="creator-setting"><span>SHIRT COLOUR</span><div className="swatch-row">{KIT_COLORS.map((color) => <button key={color} onClick={() => updateDraft({ kitColor: color })} className={draft.kitColor === color ? "swatch selected" : "swatch"} style={{ background: color }} aria-label="Choose kit colour" />)}</div></div><div className="creator-setting"><span>SHIRT NUMBER</span><input type="number" min="1" max="99" value={draft.kitNumber} onChange={(event) => updateDraft({ kitNumber: Math.max(1, Math.min(99, Number(event.target.value) || 1)) })} /></div><div className="creator-setting"><span>LEAGUE</span><div className="league-chip-row">{LEAGUES.map((league) => <button key={league.code} className={draft.leagueCode === league.code ? "league-chip selected" : "league-chip"} onClick={() => chooseLeague(league)}>{league.name}</button>)}</div></div><div className="creator-setting"><span>YOUR FIRST CLUB</span><div className="club-pick-grid">{selectedLeague.clubs.map((club) => <button key={club} className={draft.club === club ? "club-pick selected" : "club-pick"} onClick={() => updateDraft({ club })}><Shield size={13} />{club}</button>)}</div></div></div></div><div className="creator-foot-actions"><button className="career-button career-button-light" onClick={() => setStep(0)}>BACK</button><button className="career-button career-button-green" onClick={() => setStep(2)}>REVIEW THE OFFER <ArrowRight size={15} /></button></div></>}
        {step === 2 && <><span className="career-eyebrow"><BriefcaseBusiness size={14} /> YOUR FIRST CONTRACT</span><h1>They see something<br />in you.</h1><p>It is only the beginning. Your minutes, reputation and next move are yours to earn.</p><div className="first-contract-card"><div className="first-contract-crest"><Shield size={30} /></div><div><span>FIRST PROFESSIONAL DEAL</span><h2>{draft.club}</h2><p>{draft.league} · {draft.position} · {draft.randomAge ? "random age on signing" : `${draft.age} years old`}</p></div><div className="contract-facts"><span>ROLE <b>YOUNG PROSPECT</b></span><span>CONTRACT <b>3 YEARS</b></span><span>STARTING WAGE <b>£1,800 / WEEK</b></span></div></div><div className="creator-note"><Sparkles size={16} /><span>Your decisions will shape fitness, morale, manager trust, reputation and which clubs come calling.</span></div><button className="career-button career-button-green creator-next" onClick={createCareer}><Trophy size={16} /> SIGN AND BEGIN YOUR CAREER <ArrowRight size={16} /></button><button className="plain-link" onClick={() => setStep(1)}>CHANGE YOUR PLAYER OR CLUB</button></>}
      </motion.section></AnimatePresence></div>;
  };

  const renderOverview = () => career && <div className="career-page-grid"><section className="career-welcome-card"><div className="career-welcome-backdrop" /><div className="career-welcome-copy"><span className="career-eyebrow"><MapPin size={13} /> {career.club.toUpperCase()} · {career.league.toUpperCase()}</span><span className={`form-grade grade-${formGrade(career.recentRatings).toLowerCase()}`}>FORM {formGrade(career.recentRatings)}</span><h1>The next chapter<br /><em>starts here.</em></h1><p>{career.playerName}, the manager is watching. Your next chance could change everything.</p><div className="career-hero-actions"><button className="career-button career-button-green" onClick={() => setTab("matchday")}><Swords size={16} /> MATCHDAY {career.matchday}<ArrowRight size={15} /></button><button className="career-button career-button-light" onClick={requestNewEvent}><Sparkles size={15} /> SEE WHAT HAPPENS</button></div></div><div className="career-player-silhouette" style={{ "--player-skin": career.skin, "--player-boot": career.boots, "--player-kit": career.kitColor } as CSSProperties}><span>{career.kitNumber.toString().padStart(2, "0")}</span><Shirt size={122} /></div><div className="career-hero-mark">NEBULA<br /><b>CAREER</b></div></section>
      <div className="career-quick-stats"><div><span>LAST RATING</span><b>{career.lastRating ? career.lastRating.toFixed(1) : "—"}</b><small>{career.lastRating >= 7 ? "A performance to build on" : "Your first rating is waiting"}</small></div><div><span>FITNESS</span><b>{career.fitness}<small>%</small></b><i><em style={{ width: `${career.fitness}%` }} /></i></div><div><span>MANAGER TRUST</span><b>{career.managerTrust}<small>%</small></b><i><em style={{ width: `${career.managerTrust}%` }} /></i></div><div><span>MARKET VALUE · CAREER ESTIMATE</span><b>£{career.marketValue.toLocaleString()}</b><small>Moves with your game, age and reputation</small></div></div>
      <section className="form-run"><div><span className="career-eyebrow">RECENT FORM</span><b>{career.recentRatings?.length ? "Your last five match ratings" : "Your form starts with your first appearance"}</b></div><div className="form-rating-list">{(career.recentRatings || []).slice(0, 5).map((rating, index) => { const grade = formGrade([rating]); return <span className={`form-rating grade-${grade.toLowerCase()}`} key={`${rating}-${index}`} title={`Match rating ${rating.toFixed(1)}`}>{grade}<small>{rating.toFixed(1)}</small></span>; })}{!career.recentRatings?.length && <span className="form-empty">C · —</span>}</div><span className={`form-grade grade-${formGrade(career.recentRatings).toLowerCase()}`}>{formGrade(career.recentRatings)}</span></section><div className="career-overview-columns"><section className="career-panel objective-panel"><div className="career-panel-heading"><div><span className="career-eyebrow">MANAGER’S BRIEF</span><h2>This week, make it count.</h2></div><span className="contract-live"><i /> ACTIVE</span></div><div className="objectives-list">{activeObjectives.map((objective, index) => <article key={`${objective.title}-${index}`} className="career-objective"><span className="objective-index">0{index + 1}</span><div><b>{objective.title}</b><p>{objective.detail}</p><div className="career-objective-track"><i style={{ width: `${objective.progress / objective.target * 100}%` }} /></div></div><span className="objective-reward">{objective.reward}</span></article>)}{!activeObjectives.length && <div className="career-empty-inline"><Check size={17} /> Every objective complete. The staff will set a new brief soon.</div>}</div><button className="plain-link" onClick={() => setTab("training")}>VIEW TRAINING OPTIONS <ArrowRight size={14} /></button></section>
        <section className="career-panel story-panel"><div className="career-panel-heading"><div><span className="career-eyebrow">THE STORY SO FAR</span><h2>Little moments matter.</h2></div><button className="round-action" onClick={requestNewEvent} aria-label="New story event"><Plus size={16} /></button></div>{career.history.slice(0, 4).map((item, index) => <div className="story-timeline-item" key={`${item.date}-${index}`}><i /><div><b>{item.title}</b><p>{item.detail}</p><small>{formatTime(item.date)}{item.rating ? ` · RATING ${item.rating.toFixed(1)}` : ""}</small></div></div>)}<button className="plain-link" onClick={() => setTab("inbox")}>OPEN CAREER INBOX <ArrowRight size={14} /></button></section></div>
      <section className="career-panel objectives-pulse"><div className="pulse-icon"><CalendarDays size={20} /></div><div><span className="career-eyebrow">SEASON {career.season} · MATCHDAY {career.matchday} OF 38</span><h2>{career.injuryDays > 0 ? `Medical team: ${career.injuryDays} day${career.injuryDays === 1 ? "" : "s"} until your next fitness check.` : career.fitness < 45 ? "Your body is asking for recovery." : "The next selection list is being prepared."}</h2><p>{career.injuryDays > 0 ? "Take the recovery plan seriously. A rushed return can cost you more minutes." : "Stay sharp, keep your fitness up and let the manager see what you can do."}</p></div><button className="career-button career-button-light" onClick={() => setTab(career.injuryDays > 0 || career.fitness < 45 ? "training" : "matchday")}>{career.injuryDays > 0 || career.fitness < 45 ? "RECOVERY PLAN" : "VIEW MATCHDAY"}<ArrowRight size={14} /></button></section>
      </div>;

  const renderMatchday = () => career && <div className="career-page-grid"><div className="career-title-row"><div><span className="career-eyebrow"><Swords size={13} /> MATCHDAY {career.matchday} · SEASON {career.season}</span><h1>Earn the next minute.</h1><p>Choose your approach. The match engine will play out every phase and key decision.</p></div><button className="career-button career-button-light" onClick={() => setRulesOpen(true)}><CircleHelp size={15} /> THE 17 LAWS</button></div>
      {career.pendingOffer && <section className="club-offer-card"><div className="offer-spark"><BriefcaseBusiness size={21} /></div><div><span className="career-eyebrow">CLUB INTEREST · OFFER ON THE TABLE</span><h2>{career.pendingOffer.club} want to talk.</h2><p>{career.pendingOffer.reason} They offer a {career.pendingOffer.role.toLowerCase()} in the {career.pendingOffer.league}.</p><div className="offer-facts"><span>WAGE <b>£{career.pendingOffer.wages.toLocaleString()} / WEEK</b></span><span>DEAL <b>{career.pendingOffer.weeks} YEARS</b></span></div></div><div className="offer-actions"><button className="career-button career-button-green" onClick={acceptOffer}>ACCEPT MOVE <ArrowRight size={15} /></button><button className="plain-link" onClick={() => patchCareer((current) => ({ ...current, pendingOffer: undefined, history: [{ date: new Date().toISOString(), title: `Offer declined · ${current.pendingOffer?.club}`, detail: "You choose to focus on your current club for now." }, ...current.history] }))}>STAY AT {career.club.toUpperCase()}</button></div></section>}
      <div className="matchday-layout"><section className="career-panel matchday-center"><div className="matchday-top"><div><span className="career-eyebrow">{career.club.toUpperCase()}</span><h2>Matchday <span>·</span> {career.matchday}</h2></div><div className="matchday-opponent"><span>NEXT UP</span><b>{nextOpponent(career)}</b><small>{career.league} · League fixture</small></div></div>
        <div className="career-match-score"><div className="career-team-crest"><Shield size={27} /><span>{career.club}</span></div><div><span>{liveMatch?.minute ? `${liveMatch.minute}'` : "PRE-MATCH"}</span><b>{liveMatch ? `${liveMatch.home} : ${liveMatch.away}` : "— : —"}</b><small>{liveMatch?.commentary || "A place on the team sheet has not been earned yet."}</small></div><div className="career-team-crest away-crest"><Shield size={27} /><span>{nextOpponent(career)}</span></div></div>
        <div className="career-match-stat-strip"><span>SHOTS <b>{liveMatch ? `${liveMatch.homeShots}–${liveMatch.awayShots}` : "—"}</b></span><span>POSSESSION <b>{liveMatch ? `${liveMatch.homePossession}%–${100 - liveMatch.homePossession}%` : "—"}</b></span><span>OFFSIDES <b>{liveMatch ? `${liveMatch.homeOffsides}–${liveMatch.awayOffsides}` : "—"}</b></span><span>CARDS <b>{liveMatch ? `${liveMatch.homeYellowCards + liveMatch.homeRedCards}–${liveMatch.awayYellowCards + liveMatch.awayRedCards}` : "—"}</b></span></div>
        <MatchPitch state={liveMatch} />
        <div className="career-match-actions"><div className="career-tactic-pick"><span>TEAM APPROACH</span>{(["DEFENDING", "BALANCED", "ATTACKING"] as Tactic[]).map((choice) => <button key={choice} className={tactic === choice ? "selected" : ""} disabled={matchRunning} onClick={() => setTactic(choice)}>{choice}</button>)}</div><button className="career-button career-button-green career-kickoff" disabled={matchRunning || directorBusy || career.injuryDays > 0 || career.fitness < 25} onClick={startCareerMatch}>{matchRunning ? <><Sparkles size={15} /> LIVE MATCH IN PROGRESS</> : directorBusy ? <><Sparkles size={15} /> DIRECTOR STUDYING…</> : career.injuryDays > 0 ? <>UNAVAILABLE · {career.injuryDays} DAYS</> : <><Swords size={15} /> {liveMatch ? "PLAY NEXT MATCH" : "KICK OFF"}<ArrowRight size={15} /></>}</button></div>
        {message && <div className="career-feedback"><Sparkles size={15} />{message}</div>}
      </section><aside className="career-panel matchday-side"><section className={`director-card ${directorPlan?.source === "groq" ? "director-groq" : "director-local"}`}><div className="director-status"><Sparkles size={15} /><span>{directorBusy ? "ANALYZING OPPOSITION" : directorTransferBusy ? "SCOUTING REVIEW" : directorPlan?.source === "groq" ? "GROQ AI DIRECTOR" : "LOCAL DIRECTOR"}</span><i /></div><h3>Career director</h3><p>{directorMessage}</p>{directorPlan && <div className="director-plan"><span>OPPOSITION APPROACH</span><b>{directorPlan.approach.replace("_", " ")}</b><span>DIFFICULTY</span><b>{directorPlan.difficulty > 0 ? `+${directorPlan.difficulty}` : directorPlan.difficulty}</b></div>}{directorPlan?.scoutingClub && <p className="director-scout-note">Scouts from <b>{directorPlan.scoutingClub.name}</b> are watching. {directorPlan.scoutingNote}</p>}{!directorPlan?.scoutingClub && directorPlan && <small className="director-scout-note">{directorPlan.scoutingNote}</small>}</section><div className="career-panel-heading"><div><span className="career-eyebrow">MATCH REPORT</span><h2>What’s happening.</h2></div><Bell size={17} /></div>{matchLog.length ? <div className="career-live-log">{matchLog.map((event, index) => <article key={`${event.minute}-${index}`} className={event.goal ? "career-log-event goal-event" : "career-log-event"}><b>{event.minute}{event.addedMinute ? `+${event.addedMinute}` : ""}&apos;</b><div><span>{event.kind.replaceAll("-", " ").toUpperCase()}</span><p>{event.commentary}</p>{event.rule && <small>{event.rule}</small>}</div></article>)}</div> : <div className="career-rules-teaser"><div><Swords size={20} /></div><b>There is more to a match than the score.</b><p>Offside calls, card decisions, set pieces and injuries can all change what happens next.</p><button className="plain-link" onClick={() => setRulesOpen(true)}>BROWSE THE RULES ROOM <ArrowRight size={13} /></button></div>}<div className="career-player-match-card"><span className="career-eyebrow">YOUR PLAYER</span><div><b>{career.playerName}</b><span>{career.position} · {career.kitNumber}</span></div><div className="career-player-meter"><span>FITNESS</span><b>{career.fitness}%</b><i><em style={{ width: `${career.fitness}%` }} /></i></div><div className="career-player-meter"><span>FORM · LAST FIVE</span><b className={`form-grade-text grade-${formGrade(career.recentRatings).toLowerCase()}`}>{formGrade(career.recentRatings)}</b></div></div></aside></div></div>;

  const renderTraining = () => career && <div className="career-page-grid"><div className="career-title-row"><div><span className="career-eyebrow"><Dumbbell size={13} /> DEVELOPMENT CENTRE</span><h1>Put the work in.</h1><p>Training raises one attribute at a time. Hard sessions use fitness; recovery helps you return ready.</p></div><div className="training-fitness-chip"><Heart size={15} /> FITNESS <b>{career.fitness}%</b></div></div><div className="training-grid">{[
    ["pace", "Acceleration & pace", "Explosive starts, recovery runs and sprint timing.", 9, 2], ["shooting", "Finishing", "Placement, power and calm decision-making in front of goal.", 8, 2], ["passing", "Passing range", "First touch, through balls and finding a teammate under pressure.", 7, 2], ["dribbling", "Close control", "Take-on timing, balance and keeping the ball in tight spaces.", 8, 2], ["defending", "Defensive craft", "Positioning, tackling and reading the next pass.", 8, 2], ["stamina", "Match engine", "Build the legs for a full ninety minutes and added time.", 10, 2], ["composure", "Mental sharpness", "Decision-making under pressure and response after a mistake.", 5, 1], ["vision", "Tactical awareness", "Scan the pitch, spot space and anticipate movement.", 6, 1], ["strength", "Strength & balance", "Hold your position and stay strong in contact.", 9, 2],
  ].map(([key, title, detail, cost, amount]) => <article className="training-card" key={key as string}><div className="training-card-icon"><BarChart3 size={19} /></div><span className="career-eyebrow">{(key as string).toUpperCase()}</span><h2>{title as string}</h2><p>{detail as string}</p><div className="training-attribute"><span>YOUR RATING</span><b>{career.stats[key as keyof Stats]}</b><i><em style={{ width: `${career.stats[key as keyof Stats]}%` }} /></i></div><button className="career-button career-button-light" disabled={career.stats[key as keyof Stats] >= 99} onClick={() => completeTraining(key as keyof Stats, cost as number, amount as number, title as string)}><Plus size={14} /> TRAIN · {cost as number} FITNESS</button></article>)}<article className="training-card recovery-card"><div className="training-card-icon"><Heart size={19} /></div><span className="career-eyebrow">RECOVERY</span><h2>Take a breather.</h2><p>Listen to the medical team and let your body catch up with the fixture list.</p><div className="training-attribute"><span>INJURY STATUS</span><b>{career.injuryDays ? `${career.injuryDays}d` : "CLEAR"}</b></div><button className="career-button career-button-green" onClick={() => patchCareer((current) => ({ ...current, fitness: Math.min(100, current.fitness + 18), morale: Math.min(100, current.morale + 3), injuryDays: Math.max(0, current.injuryDays - 1), history: [{ date: new Date().toISOString(), title: "Recovery day", detail: "You followed the recovery plan and came back feeling better." }, ...current.history] }))}><Heart size={14} /> REST AND RECOVER</button></article></div></div>;

  const renderInbox = () => career && <div className="career-page-grid"><div className="career-title-row"><div><span className="career-eyebrow"><MessageCircle size={13} /> YOUR PRIVATE INBOX</span><h1>Every choice leaves a mark.</h1><p>Football is part of your life. Decide how to handle everything around it.</p></div><button className="career-button career-button-green" onClick={requestNewEvent}><Sparkles size={15} /> ROLL A NEW EVENT</button></div>
    {career.pendingEvent ? <AnimatePresence mode="wait"><motion.article key={career.pendingEvent.id} className="story-event-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}><div className="event-card-visual"><div className="event-light-orb" /><span>{career.pendingEvent.tag}</span><MessageCircle size={38} /></div><div className="event-card-copy"><span className="career-eyebrow">A MOMENT BETWEEN MATCHES</span><h2>{career.pendingEvent.title}</h2><p>{career.pendingEvent.text}</p><div className="story-choice-grid">{career.pendingEvent.choices.map((choice) => <button key={choice.label} className="story-choice" onClick={() => chooseStory(choice)}><span><b>{choice.label}</b><small>{choice.note}</small></span><ChevronRight size={17} /><i>{choice.result}</i></button>)}</div></div></motion.article></AnimatePresence> : <div className="inbox-empty"><div className="inbox-empty-icon"><Sparkles size={23} /></div><h2>Nothing is asking for you right now.</h2><p>New moments arrive as your career moves forward. You get to decide what kind of player people remember.</p><button className="career-button career-button-green" onClick={requestNewEvent}>SEE WHAT COMES NEXT <ArrowRight size={15} /></button></div>}
    <section className="career-panel inbox-archive"><div className="career-panel-heading"><div><span className="career-eyebrow">RECENT CHOICES</span><h2>What you decided.</h2></div><span>{career.history.length} moments</span></div>{career.history.slice(0, 10).map((item, index) => <article className="inbox-history" key={`${item.title}-${index}`}><div><b>{item.title}</b><p>{item.detail}</p></div><small>{formatTime(item.date)}</small></article>)}</section></div>;

  const renderLeague = () => career && <div className="career-page-grid"><div className="career-title-row"><div><span className="career-eyebrow"><Trophy size={13} /> OUTSIDE THE TOUCHLINE</span><h1>The world keeps moving.</h1><p>Check your club’s league table or look up real players in the live stats feed.</p></div><button className="career-button career-button-light" onClick={() => void loadStandings(career.leagueCode)}><Search size={14} /> REFRESH TABLE</button></div><div className="league-data-layout"><section className="career-panel standings-panel"><div className="career-panel-heading"><div><span className="career-eyebrow">{career.league.toUpperCase()}</span><h2>League standings</h2></div><span className="live-table-badge"><i /> LIVE DATA</span></div><div className="league-select-row"><select value={career.leagueCode} onChange={(event) => { const found = LEAGUES.find((league) => league.code === event.target.value); if (found) { patchCareer((current) => ({ ...current, league: found.name, leagueCode: found.code, officialTable: undefined })); void loadStandings(found.apiCode); } }}>{LEAGUES.map((league) => <option key={league.code} value={league.code}>{league.name}</option>)}</select><button className="career-button career-button-light" onClick={() => void loadStandings(career.leagueCode)}>UPDATE</button></div><p className="live-table-message">{liveTableMessage}</p>{liveTable.length ? <div className="standing-table"><div className="standing-row standing-header"><span>POS</span><b>CLUB</b><span>P</span><span>W</span><span>D</span><span>L</span><strong>PTS</strong></div>{liveTable.slice(0, 20).map((row) => <div className={row.team === career.club ? "standing-row own-club" : "standing-row"} key={`${row.position}-${row.team}`}><span>{row.position}</span><b><img src={row.crest} alt="" />{row.team}</b><span>{row.playedGames}</span><span>{row.won}</span><span>{row.draw}</span><span>{row.lost}</span><strong>{row.points}</strong></div>)}</div> : <div className="provider-empty"><div><Trophy size={19} /></div><b>The latest table is waiting.</b><p>{liveTableMessage}</p><small>Live standings use the current league table feed. Add LIVE_FOOTBALL_API_KEY in Vercel environment variables to switch it on.</small><button className="career-button career-button-green" onClick={() => void loadStandings(career.leagueCode)}>TRY AGAIN</button></div>}</section>
      <section className="career-panel live-scout-panel"><div className="career-panel-heading"><div><span className="career-eyebrow">LIVE PLAYER FEED</span><h2>Scout the real game.</h2></div><Search size={17} /></div><p>Search real player profiles, recent season output and reported transfer market value. This is separate from your fictional career character.</p><div className="live-scout-search"><input value={liveSearch} onChange={(event) => setLiveSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadLivePlayers(); }} placeholder="Search a real player name" /><button className="career-button career-button-green" disabled={liveStatsBusy} onClick={() => void loadLivePlayers()}>{liveStatsBusy ? "SEARCHING…" : "SEARCH"}</button></div>{liveStatsMessage && <p className="live-table-message">{liveStatsMessage}</p>}{livePlayers.map((entry) => <article className="live-player-result" key={entry.id}>{entry.photo ? <img src={entry.photo} alt="" /> : <div className="live-player-fallback"><UserRound size={19} /></div>}<div><b>{entry.name}</b><small>{entry.age || "—"} · {entry.country || "Profile"} · {entry.currentTeam || "No current team"} · {entry.position || "Player"}</small><div className="live-stat-pills"><span>Apps <b>{entry.appearances ?? "—"}</b></span><span>Goals <b>{entry.goals ?? "—"}</b></span><span>Assists <b>{entry.assists ?? "—"}</b></span><span>YC / RC <b>{entry.yellowCards ?? 0} / {entry.redCards ?? 0}</b></span></div><small>{entry.leagueName || "Most recent recorded competition"} · {entry.seasonName || "Season not listed"}</small><small className="value-estimate">REPORTED MARKET VALUE · {entry.marketValue || "UNAVAILABLE"}</small></div></article>)}<div className="provider-note"><CircleHelp size={15} /><span>NEBULA keeps the provider key on the server. Coverage, freshness and market-value estimates depend on the data provider.</span></div></section></div></div>;

  const renderProfile = () => career && <div className="career-page-grid"><div className="career-title-row"><div><span className="career-eyebrow"><UserRound size={13} /> PLAYER RECORD</span><h1>More than the number on your shirt.</h1><p>Your season grows one appearance at a time. Every attribute moves with your choices.</p></div><button className="career-button career-button-light" onClick={() => exportSave(activeSave!)}><Download size={14} /> EXPORT SAVE</button></div><div className="profile-overview"><div className="profile-player-card" style={{ "--player-skin": career.skin, "--player-boot": career.boots, "--player-kit": career.kitColor } as CSSProperties}><div className="profile-player-number">{career.kitNumber.toString().padStart(2, "0")}</div><div className="profile-player-figure"><Shirt size={88} /></div><h2>{career.playerName}</h2><p>{career.club} · {career.position}</p><div className="profile-overall"><span>CAREER LEVEL</span><b>{rosterAverage}</b><small>DEVELOPING PRO</small></div></div><div className="profile-data-grid"><div><span>AGE</span><b>{career.age}</b></div><div><span>STRONG FOOT</span><b>{career.foot}</b></div><div><span>APPEARANCES</span><b>{career.appearances}</b></div><div><span>GOALS</span><b>{career.goals}</b></div><div><span>ASSISTS</span><b>{career.assists}</b></div><div><span>FORM · LAST FIVE</span><b className={`form-grade-text grade-${formGrade(career.recentRatings).toLowerCase()}`}>{formGrade(career.recentRatings)}</b></div><div><span>AVG. RATING</span><b>{career.averageRating ? career.averageRating.toFixed(1) : "—"}</b></div><div><span>MORALE</span><b>{career.morale}%</b></div><div><span>REPUTATION</span><b>{career.reputation}%</b></div><div><span>CONTRACT</span><b>{career.contractYears} YEARS</b></div><div><span>WEEKLY WAGE</span><b>£{career.salary.toLocaleString()}</b></div><div><span>YELLOW / RED</span><b>{career.yellowCards} / {career.redCards}</b></div><div><span>VALUE · IN-GAME</span><b>£{career.marketValue.toLocaleString()}</b></div></div></div><section className="career-panel detailed-stats-panel"><div className="career-panel-heading"><div><span className="career-eyebrow">PLAYER ATTRIBUTES</span><h2>Build every part of your game.</h2></div><span>10 attributes</span></div><div className="detailed-stats-grid">{(Object.entries(career.stats) as [keyof Stats, number][]).map(([key, value]) => <article key={key}><span>{key.toUpperCase()}</span><b>{value}</b><i><em style={{ width: `${value}%` }} /></i></article>)}</div></section><div className="profile-save-management"><span><Save size={15} /> Autosaved in this browser · Last used {formatTime(activeSave!.lastPlayed)}</span><button className="career-button career-button-light" onClick={() => { setActiveId(null); setTab("overview"); }}>SAVE SELECTOR</button></div></div>;

  const renderRules = () => <div className="career-page-grid"><div className="career-title-row"><div><span className="career-eyebrow"><CircleHelp size={13} /> MATCHDAY HANDBOOK</span><h1>Know the game.</h1><p>The match engine uses these laws to shape the events you see on the pitch.</p></div><span className="law-count">17 LAWS · ONE GAME</span></div><div className="law-grid">{laws.map(([number, title, detail]) => <article className="law-card" key={number}><span className="law-number">{number.padStart(2, "0")}</span><div><h2>{title}</h2><p>{detail}</p><small>{["11", "12", "13", "14", "15", "16", "17"].includes(number) ? "SIMULATION RULE" : "MATCH FOUNDATION"}</small></div></article>)}</div></div>;

  if (!hydrated) return <main className="career-loading"><span className="career-loader" /><b>Opening your career files…</b></main>;
  if (!activeId && !creating) return <main className="career-app"><header className="career-topbar"><span className="nebula-wordmark"><strong>NEBULA</strong><small>FUT.</small></span><span className="mode-live"><i /> OFFLINE CAREER</span><button className="career-button career-button-light" onClick={onOnline}>SWITCH TO ONLINE <ArrowRight size={14} /></button></header>{renderSaveSlots()}</main>;
  if (creating) return <main className="career-app"><header className="career-topbar"><span className="nebula-wordmark"><strong>NEBULA</strong><small>FUT.</small></span><span className="mode-live"><i /> BUILD YOUR PLAYER</span><button className="career-button career-button-light" onClick={() => { setCreating(false); setActiveId(null); }}>SAVE SELECTOR</button></header>{renderCreator()}</main>;
  if (!career || !activeSave) return <main className="career-app">{renderSaveSlots()}</main>;

  return <main className="career-app career-app-inside">
    <header className="career-topbar"><button className="career-brand-button" onClick={() => { setActiveId(null); setTab("overview"); }}><span className="nebula-wordmark"><strong>NEBULA</strong><small>FUT.</small></span><span className="career-divider" /><span>PLAYER CAREER</span></button><div className="career-top-status"><span><i /> SEASON {career.season} · MATCHDAY {career.matchday}</span><span>FITNESS <b>{career.fitness}%</b></span><span>TRUST <b>{career.managerTrust}%</b></span></div><div className="career-top-actions"><button className="career-button career-button-light" onClick={() => { setActiveId(null); setTab("overview"); }}>SAVES <Save size={14} /></button><button className="career-button career-button-light" onClick={onOnline}>ONLINE <ArrowRight size={14} /></button></div></header>
    <div className="career-shell"><aside className="career-sidebar"><div className="career-mini-player"><div style={{ background: `linear-gradient(145deg,${career.skin},#13241d)` }}><span>{career.kitNumber}</span><Shirt size={25} /></div><span><b>{career.playerName}</b><small>{career.position} · {career.club}</small></span></div><nav>{menu.map((item) => { const Icon = item.icon; return <button key={item.id} className={tab === item.id ? "career-nav-active" : ""} onClick={() => { setTab(item.id); setMessage(""); if (item.id === "league" && !career.officialTable?.length) void loadStandings(career.leagueCode); }}><Icon size={16} /><span>{item.title}</span>{tab === item.id && <i />}{item.id === "inbox" && career.pendingEvent && <em />}</button>; })}</nav><div className="career-side-bottom"><div><span>CONTRACT</span><b>{career.contractYears} YEARS LEFT</b></div><button onClick={() => exportSave(activeSave)}><Download size={14} /> EXPORT THIS CAREER</button><small>Saved on this device · {saves.length} save{saves.length === 1 ? "" : "s"}</small></div></aside>
      <section className="career-main"><header className="career-main-header"><div><span>CAREER / {tab.replaceAll("-", " ").toUpperCase()}</span><b>{career.playerName}</b></div><div className="career-header-right"><span><Coins size={14} /> £{career.salary.toLocaleString()} / WEEK</span><span><Award size={14} /> {career.reputation} REPUTATION</span><button onClick={onBack} aria-label="Switch game modes"><ArrowLeft size={15} /> MODES</button></div></header><div className="career-content"><AnimatePresence mode="wait"><motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: .2 }}>
        {tab === "overview" && renderOverview()}{tab === "matchday" && renderMatchday()}{tab === "training" && renderTraining()}{tab === "inbox" && renderInbox()}{tab === "league" && renderLeague()}{tab === "rules" && renderRules()}{tab === "profile" && renderProfile()}
      </motion.div></AnimatePresence></div></section></div>
    <AnimatePresence>{rulesOpen && <motion.div className="career-modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.currentTarget === event.target) setRulesOpen(false); }}><motion.div className="laws-modal" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 12, opacity: 0 }}><div className="laws-modal-head"><div><span className="career-eyebrow"><CircleHelp size={13} /> THE MATCHDAY HANDBOOK</span><h2>All 17 Laws of the Game.</h2></div><button onClick={() => setRulesOpen(false)} aria-label="Close rules"><X size={18} /></button></div><div className="laws-modal-list">{laws.map(([number, title, detail]) => <article key={number}><b>{number.padStart(2, "0")}</b><div><strong>{title}</strong><p>{detail}</p></div></article>)}</div></motion.div></motion.div>}</AnimatePresence>
    {message && <div className="career-toast"><Sparkles size={15} />{message}<button onClick={() => setMessage("")} aria-label="Dismiss"><X size={14} /></button></div>}
  </main>;
}









