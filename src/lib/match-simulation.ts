import type { Player } from "@/components/player-card";

export type Tactic = "DEFENDING" | "BALANCED" | "ATTACKING";
export type MatchEventKind =
  | "kickoff" | "build-up" | "chance" | "goal" | "save" | "foul" | "free-kick"
  | "penalty" | "offside" | "corner" | "goal-kick" | "throw-in" | "yellow-card"
  | "red-card" | "injury" | "substitution" | "halftime" | "var" | "fulltime"
  | "advantage" | "handball" | "own-goal";

export type MatchEvent = {
  minute: number;
  addedMinute?: number;
  home: number;
  away: number;
  homeShots: number;
  awayShots: number;
  homeShotsOnTarget: number;
  awayShotsOnTarget: number;
  possession: "home" | "away";
  homePossession: number;
  homePasses: number;
  awayPasses: number;
  homeFouls: number;
  awayFouls: number;
  homeYellowCards: number;
  awayYellowCards: number;
  homeRedCards: number;
  awayRedCards: number;
  homeCorners: number;
  awayCorners: number;
  homeOffsides: number;
  awayOffsides: number;
  homeXg: number;
  awayXg: number;
  ballX: number;
  ballY: number;
  commentary: string;
  goal: boolean;
  kind: MatchEventKind;
  rule?: string;
  card?: "yellow" | "red";
  playerLabel?: string;
};

export type OpponentApproach = "press" | "mid_block" | "low_block" | "counter";
export type TeamStrength = { attack: number; defense: number; pace: number; passing: number; shooting?: number; stamina?: number; form?: number; tactic?: Tactic; approach?: OpponentApproach };

const clamp = (number: number, min: number, max: number) => Math.max(min, Math.min(max, number));
const value = (number: number | null | undefined, fallback: number) => number ?? fallback;

export function getTeamStrength(players: Player[], tactic: Tactic, chemistry: number): TeamStrength {
  const squad = players.length ? players : [];
  const average = (pick: (player: Player) => number) => squad.length
    ? squad.reduce((sum, player) => sum + pick(player), 0) / squad.length
    : 65;
  const attack = average((player) => (
    value(player.pace, player.overall) + value(player.shooting, player.overall) +
    value(player.passing, player.overall) + value(player.dribbling, player.overall)
  ) / 4);
  const defense = average((player) => (
    value(player.defending, player.overall) + value(player.physicality, player.overall) + value(player.pace, player.overall)
  ) / 3);
  const pace = average((player) => value(player.pace, player.overall));
  const passing = average((player) => value(player.passing, player.overall));
  const shooting = average((player) => value(player.shooting, player.overall));
  const stamina = average((player) => value(player.physicality, player.overall));
  const chemistryBoost = chemistry / 33 * 4;
  const attackChange = tactic === "ATTACKING" ? 7 : tactic === "DEFENDING" ? -5 : 0;
  const defenseChange = tactic === "DEFENDING" ? 7 : tactic === "ATTACKING" ? -5 : 0;
  return {
    attack: clamp(attack + chemistryBoost + attackChange, 35, 99),
    defense: clamp(defense + chemistryBoost + defenseChange, 35, 99),
    pace: clamp(pace, 30, 99),
    passing: clamp(passing, 30, 99),
    shooting: clamp(shooting, 30, 99),
    stamina: clamp(stamina, 30, 99),
    form: 50,
    tactic,
  };
}

const choose = <T,>(values: T[]) => values[Math.floor(Math.random() * values.length)];
const samplePoisson = (lambda: number) => {
  const threshold = Math.exp(-lambda);
  let product = 1;
  let count = 0;
  do { count += 1; product *= Math.random(); } while (product > threshold && count < 9);
  return Math.max(0, count - 1);
};

function expectedGoals(attacking: TeamStrength, defending: TeamStrength, home: boolean) {
  const shooting = attacking.shooting ?? attacking.attack;
  const form = attacking.form ?? 50;
  const approachBonus = attacking.approach === "counter" ? 0.08 : attacking.approach === "press" ? 0.04 : attacking.approach === "low_block" ? -0.08 : 0;
  const tacticBonus = attacking.tactic === "ATTACKING" ? 0.1 : attacking.tactic === "DEFENDING" ? -0.08 : 0;
  const rating = 1.42
    + (attacking.attack - 70) * 0.024
    + (shooting - 70) * 0.014
    + (70 - defending.defense) * 0.018
    + (form - 50) * 0.006
    + approachBonus + tacticBonus + (home ? 0.12 : -0.04);
  return Math.max(0.25, Math.min(3.5, rating));
}

/**
 * A compact match model with explicit restart, offside, foul, card and injury
 * decisions. It is a game simulation, not an officiating tool or a broadcast feed.
 */
export function createMatchTimeline(home: TeamStrength, away: TeamStrength): MatchEvent[] {
  const events: MatchEvent[] = [];
  let homeGoals = 0;
  let awayGoals = 0;
  let homeShots = 0;
  let awayShots = 0;
  let homeShotsOnTarget = 0;
  let awayShotsOnTarget = 0;
  let homeFouls = 0;
  let awayFouls = 0;
  let homeYellowCards = 0;
  let awayYellowCards = 0;
  let homeRedCards = 0;
  let awayRedCards = 0;
  let homeCorners = 0;
  let awayCorners = 0;
  let homeOffsides = 0;
  let awayOffsides = 0;
  let homeXg = 0;
  let awayXg = 0;
  let homePasses = 0;
  let awayPasses = 0;
  let stoppageMinutes = 0;
  const goalMinutes = [5, 10, 15, 20, 25, 30, 35, 40, 50, 60, 65, 70, 75, 80, 85];
  const scheduledGoals = new Map<number, ("home" | "away")[]>();
  const addScheduledGoals = (side: "home" | "away", count: number) => {
    for (let goal = 0; goal < Math.min(count, 8); goal += 1) {
      const unusedMinutes = goalMinutes.filter((candidate) => !(scheduledGoals.get(candidate) || []).includes(side));
      const minute = choose(unusedMinutes.length ? unusedMinutes : goalMinutes);
      scheduledGoals.set(minute, [...(scheduledGoals.get(minute) || []), side]);
    }
  };
  // Poisson goal counts keep scorelines varied while attack, finishing, defence,
  // tactics, form and home advantage shape each side's chances.
  addScheduledGoals("home", samplePoisson(expectedGoals(home, away, true)));
  addScheduledGoals("away", samplePoisson(expectedGoals(away, home, false)));

  const addEvent = (
    minute: number,
    possession: "home" | "away",
    kind: MatchEventKind,
    commentary: string,
    rule?: string,
    extra: Partial<MatchEvent> = {},
  ) => {
    const towardRight = possession === "home";
    const advance = Math.random() * 0.18;
    const ballX = towardRight ? 0.35 + advance + home.pace / 900 : 0.65 - advance - away.pace / 900;
    const attacking = possession === "home" ? home : away;
    const defending = possession === "home" ? away : home;
    const y = clamp(0.18 + Math.random() * 0.64, 0.08, 0.92);
    const pressure = clamp((attacking.attack - defending.defense) / 100, -0.25, 0.25);
    const xg = extra.goal ? (kind === "penalty" ? 0.78 : clamp(0.18 + pressure * 0.5 + Math.random() * 0.35, 0.05, 0.72)) : 0;
    events.push({
      minute,
      home: homeGoals,
      away: awayGoals,
      homeShots,
      awayShots,
      homeShotsOnTarget,
      awayShotsOnTarget,
      possession,
      homePossession: clamp(Math.round(50 + (home.passing - away.passing) * 0.78), 25, 75),
      homePasses,
      awayPasses,
      homeFouls,
      awayFouls,
      homeYellowCards,
      awayYellowCards,
      homeRedCards,
      awayRedCards,
      homeCorners,
      awayCorners,
      homeOffsides,
      awayOffsides,
      homeXg: Math.round(homeXg * 100) / 100,
      awayXg: Math.round(awayXg * 100) / 100,
      ballX: clamp(ballX, 0.04, 0.96),
      ballY: y,
      commentary,
      goal: Boolean(extra.goal),
      kind,
      rule,
      ...extra,
    });
  };

  addEvent(0, "home", "kickoff", "The whistle goes. Your side gets the match under way.", "Law 8 · A kick-off starts each half and restarts play after a goal.");
  for (let period = 1; period <= 18; period += 1) {
    const minute = period * 5;
    if (period === 9) {
      addEvent(45, choose(["home", "away"]), "halftime", "Half-time. A chance to catch your breath and talk through the first half.", "Law 7 · The interval is normally no longer than 15 minutes.");
      continue;
    }
    if (period === 11 && Math.random() < 0.72) {
      addEvent(minute, choose(["home", "away"]), "substitution", "The fourth official raises the board. Fresh legs come on for the second half.", "Law 3 · A substitute may enter only when the referee allows it at a stoppage.");
      continue;
    }
    if (period === 18) {
      stoppageMinutes = 2 + Math.floor(Math.random() * 5);
      addEvent(90, choose(["home", "away"]), "build-up", `The fourth official signals ${stoppageMinutes} minutes of added time. There is still a chance to change the result.`, "Law 7 · The referee allows time for substitutions, injuries and delays.", { addedMinute: stoppageMinutes });
      continue;
    }

    const goalScorers = scheduledGoals.get(minute) || [];
    if (goalScorers.length) {
      for (const scorer of goalScorers) {
        if (scorer === "home") { homeGoals += 1; homeShots += 1; homeShotsOnTarget += 1; homeXg += 0.34 + Math.random() * 0.34; }
        else { awayGoals += 1; awayShots += 1; awayShotsOnTarget += 1; awayXg += 0.34 + Math.random() * 0.34; }
        addEvent(minute, scorer, "goal", scorer === "home" ? "GOAL! A sharp finish sends the home supporters to their feet." : "GOAL for the visitors. The defence was caught in transition.", "Law 10 · A goal counts when the whole ball crosses the goal line between the posts and beneath the crossbar.", { goal: true });
      }
      continue;
    }

    const pressingBias = home.tactic === "ATTACKING" ? 0.035 : home.tactic === "DEFENDING" ? -0.025 : 0;
    const opponentBias = away.approach === "press" ? -0.035 : away.approach === "low_block" ? 0.025 : 0;
    const possessionChance = clamp(0.5 + (home.passing - away.passing) / 190 + pressingBias + opponentBias, 0.28, 0.72);
    const possession: "home" | "away" = Math.random() < possessionChance ? "home" : "away";
    const homeAttack = possession === "home";
    const attacking = homeAttack ? home : away;
    const defending = homeAttack ? away : home;
    const pressure = (attacking.attack - defending.defense) / 100;
    const progress = Math.random();
    const random = Math.random();

    if (random < 0.09) {
      const fouledHome = possession === "home";
      if (fouledHome) awayFouls += 1; else homeFouls += 1;
      const handball = Math.random() < 0.13;
      const inBox = progress > 0.82 && Math.random() < 0.28;
      const secondYellow = (fouledHome ? awayYellowCards : homeYellowCards) > 0 && Math.random() < 0.08;
      if (inBox) {
        const penaltyGoal = Math.random() < clamp(0.72 + ((attacking.shooting || attacking.attack) - defending.defense) / 220, 0.57, 0.9);
        if (homeAttack) { homeShots += 1; homeShotsOnTarget += 1; homeXg += 0.78; if (penaltyGoal) homeGoals += 1; }
        else { awayShots += 1; awayShotsOnTarget += 1; awayXg += 0.78; if (penaltyGoal) awayGoals += 1; }
        addEvent(minute, possession, "penalty", penaltyGoal ? `Penalty scored! ${homeAttack ? "Your side" : "The visitors"} keep their nerve from the spot.` : `Penalty saved! The goalkeeper guesses correctly and keeps the score level.`, "Law 14 · A direct free kick foul by a defender inside their penalty area gives a penalty.", { goal: penaltyGoal });
      } else if (secondYellow) {
        if (fouledHome) { awayYellowCards += 1; awayRedCards += 1; }
        else { homeYellowCards += 1; homeRedCards += 1; }
        addEvent(minute, possession, "red-card", "A second caution means a red card. The dismissed player must leave the field.", "Law 12 · A player sent off cannot be replaced; their team plays with one fewer player.", { card: "red" });
      } else if (Math.random() < 0.2) {
        if (fouledHome) awayYellowCards += 1; else homeYellowCards += 1;
        addEvent(minute, possession, "yellow-card", "The referee books the player for a reckless challenge.", "Law 12 · A yellow card is a caution for unsporting behaviour or persistent offences.", { card: "yellow" });
      } else {
        addEvent(minute, possession, handball ? "handball" : "free-kick", handball ? `${homeAttack ? "Your side" : "The visitors"} win a free kick after a handball offence.` : `${homeAttack ? "Your side" : "The visitors"} win a free kick after a mistimed challenge.`, handball ? "Law 12 · Deliberate handball is penalised; accidental contact is judged by the circumstances." : "Law 13 · Direct and indirect free kicks restart play after offences.");
      }
      continue;
    }

    if (random < 0.105) {
      addEvent(minute, possession, "advantage", "The referee lets play continue after a foul because the attack has a clear advantage.", "Law 5 · The referee may allow play to continue when the non-offending team benefits.");
      continue;
    }

    if (random < 0.17) {
      // Offside requires the attacker to be nearer the opponents' goal than
      // both the ball and the second-last opponent when the pass is played.
      const receiverX = 0.69 + Math.random() * 0.22;
      const ballAtPass = 0.54 + Math.random() * 0.24;
      const secondLastDefender = 0.59 + Math.random() * 0.23;
      const offside = receiverX > ballAtPass && receiverX > secondLastDefender;
      if (offside) {
        if (homeAttack) homeOffsides += 1; else awayOffsides += 1;
        addEvent(minute, possession, "offside", homeAttack ? "The flag is up. Your forward went early and play stops." : "The visitors are caught offside as the back line steps up.", "Law 11 · Offside position alone is not an offence; a player must become involved in active play.");
      } else {
        if (homeAttack) homePasses += 3; else awayPasses += 3;
        addEvent(minute, possession, "build-up", "The forward times the run well and stays level with the second-last defender.", "Law 11 · A player level with the second-last opponent is not offside.");
      }
      continue;
    }

    if (random < 0.24) {
      if (homeAttack) homeCorners += 1; else awayCorners += 1;
      addEvent(minute, possession, "corner", `${homeAttack ? "Your team" : "The visitors"} win a corner after the defender sends the ball over their own goal line.", "Law 17 · A corner is awarded when a defender last touches the ball before it crosses their goal line, outside the goal.");
      continue;
    }

    if (random < 0.29) {
      addEvent(minute, possession, "throw-in", "The ball crosses the touchline. The other side takes a throw-in.", "Law 15 · Both feet stay on or behind the touchline; the ball is thrown with both hands from behind the head.");
      continue;
    }

    if (random < 0.33) {
      addEvent(minute, possession, "injury", "A player stays down after contact. The physio checks them before play restarts.", "Law 5 · The referee stops play for a serious injury and controls the restart.");
      continue;
    }

    if (random < 0.345 && progress > 0.68) {
      if (homeAttack) awayGoals += 1; else homeGoals += 1;
      addEvent(minute, possession === "home" ? "away" : "home", "own-goal", "A deflection sends the ball into the wrong net. The goal is awarded to the attacking side.", "Law 10 · A goal is awarded to the attacking team when the whole ball crosses the goal line.", { goal: true });
      continue;
    }

    const tacticalShotBonus = (homeAttack ? home.tactic === "ATTACKING" : attacking.approach === "counter") ? 0.08 : 0;
    const defensiveBlock = defending.approach === "low_block" ? 0.045 : 0;
    const formBonus = ((attacking.form ?? 50) - (defending.form ?? 50)) * 0.0012;
    const shotChance = clamp(0.34 + pressure * 0.18 + (progress > 0.7 ? 0.1 : 0) + tacticalShotBonus + formBonus - defensiveBlock, 0.18, 0.62);
    if (Math.random() < shotChance) {
      const onTargetChance = clamp(0.37 + ((attacking.shooting || attacking.attack) - defending.defense) / 260, 0.19, 0.66);
      const onTarget = Math.random() < onTargetChance;
      const expected = clamp(0.06 + progress * 0.35 + pressure * 0.2, 0.03, 0.68);
      if (homeAttack) { homeShots += 1; if (onTarget) homeShotsOnTarget += 1; homeXg += expected; }
      else { awayShots += 1; if (onTarget) awayShotsOnTarget += 1; awayXg += expected; }
      const kind: MatchEventKind = onTarget ? "save" : "chance";
      const commentary = onTarget ? `${homeAttack ? "Your forward" : "The visiting striker"} tests the goalkeeper, who makes the save.` : `${homeAttack ? "Your side" : "The visitors"} create a chance, but the shot drifts wide.`;
      addEvent(minute, possession, kind, commentary, "Law 10 · A goal kick follows when an attacker last touches the ball before it crosses the goal line, outside the goal.");
      continue;
    }

    const passes = 2 + Math.floor(Math.random() * 7);
    if (homeAttack) homePasses += passes; else awayPasses += passes;
    if (Math.random() < 0.1) {
      addEvent(minute, possession, "goal-kick", `${homeAttack ? "Your shot" : "The visitors' shot"} misses the target. The goalkeeper restarts with a goal kick.`, "Law 16 · A goal kick is awarded when an attacker last touches the ball before it crosses the goal line, outside the goal.");
    } else {
      addEvent(minute, possession, "build-up", homeAttack ? "Your side builds patiently through midfield and looks for a passing lane." : "The visitors switch play and try to stretch your defensive shape.", "Law 9 · The ball is out only when it wholly crosses a touchline or goal line, on the ground or in the air.");
    }
  }

  // The interval is a restart; second-half stats and possession flow on.
  addEvent(90 + stoppageMinutes, "away", "fulltime", "Full-time. The referee ends the match.", "Law 7 · The referee adds time for delays before ending each half.");
  return events;
}
