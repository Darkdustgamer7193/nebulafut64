"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight, ArrowUpRight, BadgeCheck, Bell, Bolt, ChevronDown,
  CircleHelp, Coins, Crosshair, Home, LogOut, Medal, PackageOpen, ShieldCheck,
  Plus, Search, Shield, ShoppingBag, Sparkles, Swords, Users, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { CareerMode, GameModeSelect } from "@/components/career-mode";
import { MatchPitch } from "@/components/match-pitch";
import { getPlayer, PlayerCard, type InventoryCard, type Player } from "@/components/player-card";
import { createMatchTimeline, getTeamStrength, type MatchEvent, type Tactic, type TeamStrength } from "@/lib/match-simulation";
import { playerMatchesSearch } from "@/lib/player-search";
import { createClient } from "@/lib/supabase/client";

type Section = "home" | "packs" | "club" | "squad" | "matches" | "market";
type Squad = { id: string; name: string; formation: string };
type Slot = { slot_number: number; inventory_id: string | null; position: string | null };
type Listing = { id: string; price_coins: number; seller_id: string; player_id: number; players: Player | Player[] | null };
type Pack = { id: string; name: string; subtitle: string; price: number; theme: string; itemCount: number; badge: string; drop: string };
type MatchState = MatchEvent & { running: boolean };
type MatchMode = "ai" | "online";
type MatchStyle = "quick" | "manager";
type MatchHistoryRow = { home_goals: number; away_goals: number };
type PackResult = { coins_remaining: number; cards: { inventory_id: string; player: Player }[] };

const PACKS: Pack[] = [
  { id: "starter", name: "Scouting Report", subtitle: "A little something to get going.", price: 250, theme: "mint", itemCount: 3, badge: "STARTER PACK", drop: "3 PLAYERS" },
  { id: "gold", name: "Gold Rush", subtitle: "The next big name could be in here.", price: 800, theme: "gold", itemCount: 5, badge: "FAN FAVOURITE", drop: "5 PLAYERS" },
  { id: "elite", name: "Prime Time", subtitle: "Five chances. One unforgettable pull.", price: 1500, theme: "violet", itemCount: 5, badge: "LIMITED DROP", drop: "5 PLAYERS" },
];

const NAV: { id: Section; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "packs", label: "Packs", icon: PackageOpen },
  { id: "club", label: "My Club", icon: Medal },
  { id: "squad", label: "Squad", icon: Users },
  { id: "matches", label: "Matches", icon: Swords },
  { id: "market", label: "Market", icon: ShoppingBag },
];

const FORMATION = [
  { position: "ST", x: 50, y: 12 },
  { position: "LW", x: 22, y: 26 },
  { position: "RW", x: 78, y: 26 },
  { position: "CM", x: 50, y: 43 },
  { position: "CM", x: 30, y: 54 },
  { position: "CM", x: 70, y: 54 },
  { position: "LB", x: 14, y: 73 },
  { position: "CB", x: 38, y: 73 },
  { position: "CB", x: 62, y: 73 },
  { position: "RB", x: 86, y: 73 },
  { position: "GK", x: 50, y: 91 },
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const playerForListing = (listing: Listing) => Array.isArray(listing.players) ? listing.players[0] ?? null : listing.players;

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export function GameClient({
  userId,
  email,
  name,
  avatar,
}: {
  userId: string;
  email: string;
  name?: string;
  avatar?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const playerName = name || email.split("@")[0] || "Manager";
  const [gameMode, setGameMode] = useState<"choose" | "offline" | "online">("choose");
  const [section, setSection] = useState<Section>("home");
  const [coins, setCoins] = useState(0);
  const [inventory, setInventory] = useState<InventoryCard[]>([]);
  const [squad, setSquad] = useState<Squad | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [market, setMarket] = useState<Listing[]>([]);
  const [catalogCount, setCatalogCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [marketSearch, setMarketSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState("ALL");
  const [selectedPack, setSelectedPack] = useState<Pack | null>(null);
  const [revealed, setRevealed] = useState<InventoryCard[]>([]);
  const [slotToFill, setSlotToFill] = useState<number | null>(null);
  const [listingCard, setListingCard] = useState<InventoryCard | null>(null);
  const [listingPrice, setListingPrice] = useState("750");
  const [match, setMatch] = useState<MatchState | null>(null);
  const [quickTactic, setQuickTactic] = useState<Tactic>("BALANCED");
  const [matchMode, setMatchMode] = useState<MatchMode>("ai");
  const [matchStyle, setMatchStyle] = useState<MatchStyle>("quick");
  const [divisionPoints, setDivisionPoints] = useState(0);
  const [matchLog, setMatchLog] = useState<MatchEvent[]>([]);
  const [roomInput, setRoomInput] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [roomStatus, setRoomStatus] = useState("");
  const [onlinePlayers, setOnlinePlayers] = useState(0);
  const [onlineOpponent, setOnlineOpponent] = useState<{ manager: string; strength: TeamStrength } | null>(null);
  const [isRoomHost, setIsRoomHost] = useState(false);
  const [scoutTab, setScoutTab] = useState(false);
  const [scoutResults, setScoutResults] = useState<Player[]>([]);
  const [scoutLoading, setScoutLoading] = useState(false);
  const [scoutError, setScoutError] = useState("");
  const [slotSearch, setSlotSearch] = useState("");
  const matchRef = useRef<MatchState | null>(null);
  const matchTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const onlineChannel = useRef<RealtimeChannel | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3400);
  }, []);

  const loadGame = useCallback(async () => {
    setLoading(true);
    const [profileResult, inventoryResult, squadResult, catalogResult, matchHistoryResult] = await Promise.all([
      supabase.from("users").select("coins").eq("id", userId).maybeSingle(),
      supabase.from("user_inventory").select("inventory_id, card_variant, is_untradeable, players(*)").eq("user_id", userId).order("acquired_at", { ascending: false }).limit(250),
      supabase.from("squads").select("id, name, formation").eq("user_id", userId).order("updated_at", { ascending: false }).limit(1),
      supabase.from("players").select("id", { count: "exact", head: true }),
      supabase.from("match_history").select("home_goals, away_goals").eq("user_id", userId).order("played_at", { ascending: false }).limit(100),
    ]);

    if (profileResult.data) setCoins(Number(profileResult.data.coins));
    if (inventoryResult.data) setInventory(inventoryResult.data as unknown as InventoryCard[]);
    setCatalogCount(catalogResult.count || 0);
    if (matchHistoryResult.data) {
      const points = (matchHistoryResult.data as MatchHistoryRow[]).reduce((total, result) => (
        total + (result.home_goals > result.away_goals ? 3 : result.home_goals === result.away_goals ? 1 : 0)
      ), 0);
      setDivisionPoints(points);
    }
    let activeSquad = squadResult.data?.[0] as Squad | undefined;

    if (!activeSquad) {
      const created = await supabase.from("squads").insert({ user_id: userId, name: "First XI", formation: "4-3-3" }).select("id, name, formation").single();
      if (created.data) {
        activeSquad = created.data as Squad;
        await supabase.from("squad_slots").upsert(
          FORMATION.map((slot, index) => ({ squad_id: activeSquad!.id, slot_number: index + 1, position: slot.position, inventory_id: null })),
          { onConflict: "squad_id,slot_number" },
        );
      }
    }

    if (activeSquad) {
      setSquad(activeSquad);
      const slotResult = await supabase.from("squad_slots").select("slot_number, inventory_id, position").eq("squad_id", activeSquad.id).order("slot_number");
      if (slotResult.data) setSlots(slotResult.data as Slot[]);
    }
    setLoading(false);
  }, [supabase, userId]);

  useEffect(() => {
    void loadGame();
    return () => {
      if (matchTimer.current) clearInterval(matchTimer.current);
      if (onlineChannel.current) void supabase.removeChannel(onlineChannel.current);
    };
  }, [loadGame, supabase]);

  useEffect(() => {
    if (!scoutTab) return;
    const query = search.trim();
    if (query.length < 2) {
      setScoutResults([]);
      setScoutError("");
      setScoutLoading(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setScoutLoading(true);
      setScoutError("");
      try {
        const { data, error } = await supabase.rpc("search_players", { p_query: query, p_limit: 48 });
        if (cancelled) return;
        if (error) {
          setScoutResults([]);
          setScoutError("Player search needs the one-time database update shown in the next steps.");
        } else {
          setScoutResults((data || []) as Player[]);
        }
      } catch {
        if (!cancelled) {
          setScoutResults([]);
          setScoutError("Player search could not reach Supabase. Check the connection and try again.");
        }
      } finally {
        if (!cancelled) setScoutLoading(false);
      }
    }, 320);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [search, scoutTab, supabase]);

  const ownedById = useMemo(() => new Map(inventory.map((card) => [card.inventory_id, card])), [inventory]);
  const squadPlayers = useMemo(
    () => slots.map((slot) => slot.inventory_id ? getPlayer(ownedById.get(slot.inventory_id) || { inventory_id: "", card_variant: "base", players: null }) : null),
    [slots, ownedById],
  );
  const filledPlayers = squadPlayers.filter((player): player is Player => Boolean(player));
  const squadRating = filledPlayers.length ? Math.round(filledPlayers.reduce((sum, player) => sum + player.overall, 0) / filledPlayers.length) : 0;
  const chemistry = useMemo(() => {
    let score = 0;
    for (let left = 0; left < filledPlayers.length; left += 1) {
      for (let right = left + 1; right < filledPlayers.length; right += 1) {
        const a = filledPlayers[left];
        const b = filledPlayers[right];
        if (a.club_name && a.club_name === b.club_name) score += 2;
        else if (a.league_name && a.league_name === b.league_name) score += 1;
        if (a.nationality_name && a.nationality_name === b.nationality_name) score += 1;
      }
    }
    return clamp(Math.round(score / 4), 0, 33);
  }, [filledPlayers]);

  const filteredInventory = useMemo(() => inventory.filter((card) => {
    const player = getPlayer(card);
    if (!player) return false;
    const matchesText = playerMatchesSearch([player.full_name, player.short_name, player.club_name, player.league_name, player.nationality_name], search);
    const matchesPosition = positionFilter === "ALL" || player.positions?.includes(positionFilter);
    return matchesText && matchesPosition;
  }), [inventory, positionFilter, search]);

  const division = Math.max(1, 10 - Math.floor(divisionPoints / 9));
  const divisionProgress = division === 1 ? 100 : Math.round((divisionPoints % 9) / 9 * 100);

  async function openPack(pack: Pack) {
    if (!catalogCount) {
      notify("Player data has not been loaded into this club yet. Open the player setup page first.");
      return;
    }
    setWorking(true);
    const { data, error } = await supabase.rpc("open_pack", { p_pack_type: pack.id });
    if (error) {
      notify(error.message.includes("not enough") ? "You need more coins for that pack." : error.message);
      setWorking(false);
      return;
    }
    const result = data as PackResult;
    setCoins(result.coins_remaining);
    const cards = result.cards.map((card) => ({ inventory_id: card.inventory_id, card_variant: "base", players: card.player } as InventoryCard));
    setInventory((current) => [...cards, ...current]);
    setSelectedPack(pack);
    setRevealed(cards);
    setWorking(false);
  }

  async function quickSell(card: InventoryCard) {
    if (card.is_untradeable) {
      notify("This card cannot be quick sold.");
      return;
    }
    setWorking(true);
    const { data, error } = await supabase.rpc("quick_sell_card", { p_inventory_id: card.inventory_id });
    if (error) notify(error.message);
    else {
      const result = data as { coins: number; sale_price: number };
      setCoins(result.coins);
      setInventory((current) => current.filter((owned) => owned.inventory_id !== card.inventory_id));
      setSlots((current) => current.map((slot) => slot.inventory_id === card.inventory_id ? { ...slot, inventory_id: null } : slot));
      notify(`Card sold for ${result.sale_price.toLocaleString()} coins.`);
    }
    setWorking(false);
  }

  async function saveListing() {
    if (!listingCard) return;
    setWorking(true);
    const price = Number(listingPrice);
    if (!Number.isInteger(price) || price < 1) {
      notify("Enter a whole number above zero.");
      setWorking(false);
      return;
    }
    const { error } = await supabase.rpc("list_card_for_sale", { p_inventory_id: listingCard.inventory_id, p_price: price });
    if (error) notify(error.message);
    else {
      notify("Your card is now on the market.");
      setListingCard(null);
      await loadMarket();
    }
    setWorking(false);
  }

  async function loadMarket() {
    const { data, error } = await supabase.from("transfer_market").select("id, price_coins, seller_id, player_id, players(*)").eq("status", "active").order("created_at", { ascending: false }).limit(60);
    if (error) notify(error.message);
    else setMarket((data || []) as unknown as Listing[]);
  }

  async function buyListing(listing: Listing) {
    setWorking(true);
    const { data, error } = await supabase.rpc("buy_market_listing", { p_listing_id: listing.id });
    if (error) notify(error.message);
    else {
      const result = data as { coins: number; inventory_id: string; player: Player };
      setCoins(result.coins);
      setInventory((current) => [{ inventory_id: result.inventory_id, card_variant: "base", players: result.player }, ...current]);
      setMarket((current) => current.filter((entry) => entry.id !== listing.id));
      notify("Transfer complete. The card is in your club.");
    }
    setWorking(false);
  }

  async function cancelListing(listing: Listing) {
    setWorking(true);
    const { error } = await supabase.rpc("cancel_market_listing", { p_listing_id: listing.id });
    if (error) notify(error.message);
    else {
      setMarket((current) => current.filter((entry) => entry.id !== listing.id));
      notify("Your card has been removed from the transfer room.");
    }
    setWorking(false);
  }

  async function fillSlot(slotNumber: number, cardId: string | null) {
    if (!squad) return;
    const place = FORMATION[slotNumber - 1];
    const { error } = await supabase.from("squad_slots").upsert(
      { squad_id: squad.id, slot_number: slotNumber, position: place.position, inventory_id: cardId },
      { onConflict: "squad_id,slot_number" },
    );
    if (error) notify(error.message);
    else {
      setSlots((current) => {
        const rest = current.filter((slot) => slot.slot_number !== slotNumber);
        return [...rest, { slot_number: slotNumber, position: place.position, inventory_id: cardId }].sort((a, b) => a.slot_number - b.slot_number);
      });
      setSlotToFill(null);
    }
  }

  async function saveMatchReward(homeGoals: number, awayGoals: number) {
    const { data, error } = await supabase.rpc("record_match_result", { p_home_goals: homeGoals, p_away_goals: awayGoals });
    if (error) {
      notify(error.message.includes("breather") ? "Wait a couple of minutes before earning another match reward." : error.message);
      return;
    }
    if (data && typeof data === "object" && "coins" in data) setCoins(Number((data as { coins: number }).coins));
    setDivisionPoints((current) => current + (homeGoals > awayGoals ? 3 : homeGoals === awayGoals ? 1 : 0));
  }

  async function broadcastMatchState(state: MatchState) {
    if (matchMode === "online" && isRoomHost && onlineChannel.current) {
      await onlineChannel.current.send({ type: "broadcast", event: "match-state", payload: state });
    }
  }

  function startMatch() {
    if (matchRef.current?.running) return;
    if (matchMode === "online" && (!roomCode || !isRoomHost || onlinePlayers < 2)) return;
    if (matchTimer.current) clearInterval(matchTimer.current);

    const homeStrength = getTeamStrength(filledPlayers, quickTactic, chemistry);
    const aiRating = clamp(squadRating + Math.round((Math.random() - 0.5) * 18), 58, 94);
    const awayStrength = matchMode === "online"
      ? onlineOpponent?.strength || { attack: 74, defense: 74, pace: 72, passing: 72 }
      : { attack: aiRating + Math.random() * 5, defense: aiRating + Math.random() * 4, pace: aiRating, passing: aiRating - 1 };
    const timeline = createMatchTimeline(homeStrength, awayStrength);

    if (matchStyle === "quick" && matchMode === "ai") {
      const final = timeline[timeline.length - 1];
      const result: MatchState = { ...final, running: false, commentary: `Full time. ${final.home > final.away ? "A win for your club!" : final.home === final.away ? "A hard-fought draw." : "The rivals take the points this time."}` };
      matchRef.current = result;
      setMatch(result);
      setMatchLog(timeline.slice(-6));
      void saveMatchReward(result.home, result.away);
      return;
    }

    const opening: MatchState = {
      ...timeline[0], minute: 0, home: 0, away: 0, homeShots: 0, awayShots: 0,
      possession: "home", ballX: 0.5, ballY: 0.5,
      commentary: matchMode === "online" ? "Both managers are ready. The referee starts the match!" : "Kick-off! Your manager has set the team to work.",
      goal: false, running: true,
    };
    matchRef.current = opening;
    setMatch(opening);
    setMatchLog([]);
    if (matchMode === "online") void broadcastMatchState(opening);
    let index = 0;
    matchTimer.current = setInterval(() => {
      const event = timeline[index];
      if (!event) return;
      const next: MatchState = {
        ...event,
        running: index < timeline.length - 1,
        commentary: index === timeline.length - 1
          ? event.home > event.away ? "Full time. A big win for your club!"
            : event.home === event.away ? "Full time. The points are shared."
              : "Full time. The rivals take the points this time."
          : event.commentary,
      };
      matchRef.current = next;
      setMatch(next);
      setMatchLog((current) => [...current.slice(-4), event]);
      if (matchMode === "online" && isRoomHost) void broadcastMatchState(next);
      index += 1;
      if (index >= timeline.length) {
        if (matchTimer.current) clearInterval(matchTimer.current);
        matchTimer.current = null;
        void saveMatchReward(next.home, next.away);
      }
    }, matchMode === "online" ? 700 : 560);
  }

  function connectOnlineRoom(code: string, host: boolean) {
    const safeCode = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    if (safeCode.length < 4) {
      notify("Room codes need at least four letters or numbers.");
      return;
    }
    if (onlineChannel.current) void supabase.removeChannel(onlineChannel.current);
    setRoomStatus("Connecting to the friend room…");
    setOnlinePlayers(0);
    setOnlineOpponent(null);
    setMatch(null);
    setMatchLog([]);
    setIsRoomHost(host);
    setRoomCode(safeCode);
    const channel = supabase.channel(`nebula-match-${safeCode}`, {
      config: { private: true, broadcast: { self: false }, presence: { key: userId } },
    });
    channel
      .on("presence", { event: "sync" }, () => {
        const entries = Object.values(channel.presenceState()).flat() as Array<{ manager?: string; user_id?: string; strength?: TeamStrength }>;
        setOnlinePlayers(entries.length);
        const opponent = entries.find((entry) => entry.user_id !== userId && entry.strength);
        setOnlineOpponent(opponent ? { manager: opponent.manager || "Friend", strength: opponent.strength! } : null);
      })
      .on("broadcast", { event: "match-state" }, ({ payload }) => {
        if (host || !payload || typeof payload !== "object") return;
        const incoming = payload as MatchState;
        const state: MatchState = {
          ...incoming,
          home: incoming.away,
          away: incoming.home,
          possession: incoming.possession === "home" ? "away" : "home",
          ballX: 1 - incoming.ballX,
          running: incoming.running,
        };
        matchRef.current = state;
        setMatch(state);
        setMatchLog((current) => [...current.slice(-4), state]);
        if (!state.running) void saveMatchReward(state.home, state.away);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ manager: playerName, user_id: userId, strength: getTeamStrength(filledPlayers, quickTactic, chemistry), joined_at: new Date().toISOString() });
          setRoomStatus(host ? "Room ready. Share the code with a friend." : "Connected. Waiting for the host to start.");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setRoomStatus("Could not join this room. Check that the database update has been run, then try again.");
        }
      });
    onlineChannel.current = channel;
  }

  function createOnlineRoom() {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    setRoomInput(code);
    connectOnlineRoom(code, true);
  }

  function leaveOnlineRoom() {
    if (onlineChannel.current) void supabase.removeChannel(onlineChannel.current);
    onlineChannel.current = null;
    setRoomCode("");
    setRoomStatus("");
    setOnlinePlayers(0);
    setOnlineOpponent(null);
    setIsRoomHost(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.assign("/");
  }

  function chooseSection(next: Section) {
    setSection(next);
    if (next === "market") void loadMarket();
    if (next === "matches") setMatch(null);
  }

  function renderHome() {
    const topCard = inventory.map((item) => getPlayer(item)).filter((player): player is Player => Boolean(player)).sort((a, b) => b.overall - a.overall)[0];
    return (
      <div className="page-content">
        <div className="home-hero">
          <div className="home-hero-copy">
            <div className="eyebrow"><span className="live-dot" /> SEASON 26 · CLUB FOOTBALL</div>
            <h1>Build your club.<br /><span>Make it legendary.</span></h1>
            <p>Every great side starts somewhere. Find your next star and take the first step.</p>
            <div className="hero-actions">
              <button className="button button-lime" onClick={() => chooseSection("packs")}><PackageOpen size={17} /> OPEN A PACK <ArrowRight size={16} /></button>
              <button className="button button-quiet" onClick={() => chooseSection("squad")}>VIEW YOUR SQUAD <ArrowUpRight size={16} /></button>
            </div>
            <div className="hero-footnote"><Shield size={14} /> YOUR JOURNEY. YOUR CLUB. YOUR CALL.</div>
          </div>
          <div className="home-hero-art" aria-hidden="true">
            <div className="hero-stadium-glow" />
            <div className="hero-arc arc-a" /><div className="hero-arc arc-b" />
            <div className="home-feature-card">
              <div className="feature-card-ribbon">YOUR CLUB STARTS NOW</div>
              <div className="feature-card-person"><div className="feature-silhouette" /></div>
              <div className="feature-card-info"><span>BUILD YOUR LEGACY</span><strong>MAKE A<br />STATEMENT.</strong></div>
              <div className="feature-card-bottom"><span>NEBULAFUT.</span><span>26 / 27</span></div>
            </div>
            <div className="float-tag float-tag-one"><Sparkles size={13} /> THE NEXT STAR</div>
            <div className="float-tag float-tag-two">✦ CLUB RATING <b>{squadRating || "--"}</b></div>
          </div>
        </div>

        <div className="section-heading"><div><span className="eyebrow muted-eyebrow">YOUR SEASON</span><h2>Club overview</h2></div><button className="text-button" onClick={() => chooseSection("club")}>GO TO CLUB <ArrowRight size={15} /></button></div>
        <div className="overview-grid">
          <div className="overview-card"><div className="overview-label"><span>PLAYERS IN CLUB</span><Users size={16} /></div><div className="overview-value">{inventory.length}<small>cards</small></div><div className="overview-caption">Every great club starts with one.</div><div className="overview-bar"><i style={{ width: `${Math.min(inventory.length * 4, 100)}%` }} /></div></div>
          <div className="overview-card"><div className="overview-label"><span>FIRST XI RATING</span><Crosshair size={16} /></div><div className="overview-value">{squadRating || "--"}<small>/ 99</small></div><div className="overview-caption">{filledPlayers.length} of 11 spots filled</div><div className="overview-bar"><i style={{ width: `${Math.min(filledPlayers.length / 11 * 100, 100)}%` }} /></div></div>
          <div className="overview-card featured-overview"><div className="overview-label"><span>TOP PLAYER</span><Sparkles size={16} /></div>{topCard ? <><div className="top-player-value">{topCard.overall}<small> OVR</small></div><div className="overview-caption">{topCard.full_name}</div></> : <><div className="top-player-value">—</div><div className="overview-caption">Your first star is waiting in a pack.</div></>}<button className="mini-link" onClick={() => chooseSection("packs")}>FIND YOUR STAR <ArrowRight size={13} /></button></div>
        </div>

        <div className="section-heading objective-heading"><div><span className="eyebrow muted-eyebrow">MAKE TODAY COUNT</span><h2>Manager's checklist</h2></div><span className="daily-pill"><span className="live-dot" /> READY WHEN YOU ARE</span></div>
        <div className="objective-grid">
          <button className="objective-card" onClick={() => chooseSection("packs")}><span className="objective-icon mint"><PackageOpen size={19} /></span><span className="objective-copy"><b>Open your first pack</b><small>There’s a future star in there.</small></span><ArrowRight size={16} /></button>
          <button className="objective-card" onClick={() => chooseSection("squad")}><span className="objective-icon blue"><Users size={19} /></span><span className="objective-copy"><b>Pick your First XI</b><small>Set your team up for matchday.</small></span><ArrowRight size={16} /></button>
          <button className="objective-card" onClick={() => chooseSection("matches")}><span className="objective-icon orange"><Swords size={19} /></span><span className="objective-copy"><b>Step onto the pitch</b><small>Your first match is waiting.</small></span><ArrowRight size={16} /></button>
        </div>
      </div>
    );
  }

  function renderPacks() {
    return (
      <div className="page-content">
        <div className="page-title-row"><div><span className="eyebrow muted-eyebrow">THE TUNNEL IS OPEN</span><h1>Pick your pack.</h1><p>New faces. New stories. Your next favourite player might be one click away.</p></div><div className="pack-coin-chip"><Coins size={17} /><b>{coins.toLocaleString()}</b><span>COINS</span></div></div>
        {!catalogCount && <div className="notice-banner"><CircleHelp size={18} /><span><b>Player cards are not loaded yet.</b> Ask the site owner to load the player catalogue from the online setup page.</span></div>}
        <div className="pack-grid">
          {PACKS.map((pack, index) => (
            <motion.article key={pack.id} className={`pack-card pack-${pack.theme}`} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.08 }}>
              <div className="pack-card-head"><span className="pack-badge">{pack.badge}</span><span className="pack-card-count">{pack.drop}</span></div>
              <div className="pack-visual"><div className="pack-aura" /><div className="pack-shape"><div className="pack-emblem">N<span>✦</span></div><div className="pack-shape-lines" /><div className="pack-shape-title">NEBULA<br /><b>FUT.</b></div><div className="pack-shape-season">SEASON 26</div></div><div className="pack-orbit pack-orbit-left" /><div className="pack-orbit pack-orbit-right" /><div className="pack-stars">✦　·　✧　·</div></div>
              <div className="pack-card-copy"><h2>{pack.name}</h2><p>{pack.subtitle}</p></div>
              <div className="pack-card-bottom"><span><Coins size={16} /> {pack.price.toLocaleString()}</span><button className="button button-lime" disabled={working || coins < pack.price || !catalogCount} onClick={() => void openPack(pack)}>{working ? "OPENING…" : "OPEN PACK"}<ArrowRight size={15} /></button></div>
              {coins < pack.price && catalogCount > 0 && <div className="pack-insufficient">Play a match to earn more coins.</div>}
            </motion.article>
          ))}
        </div>
        <div className="pack-note"><ShieldCheck size={16} /><span>Packs are opened securely. Coins are only spent when your cards are ready to add to your club.</span></div>
      </div>
    );
  }

  function renderClub() {
    return (
      <div className="page-content">
        <div className="page-title-row"><div><span className="eyebrow muted-eyebrow">YOUR PLAYERS, YOUR CLUB</span><h1>The club room.</h1><p>{inventory.length} {inventory.length === 1 ? "player" : "players"} in your collection. Build a squad, list a card, or scout the full player catalogue.</p></div><button className="button button-lime" onClick={() => chooseSection("packs")}><Plus size={17} /> OPEN PACKS</button></div>
        <div className="club-view-tabs"><button className={!scoutTab ? "club-view-active" : ""} onClick={() => { setScoutTab(false); setSearch(""); }}>MY CLUB <span>{inventory.length}</span></button><button className={scoutTab ? "club-view-active" : ""} onClick={() => { setScoutTab(true); setSearch(""); }}>SCOUT PLAYERS <span>{catalogCount.toLocaleString()}</span></button></div>
        <div className="collection-toolbar"><div className="search-box"><Search size={17} /><input placeholder={scoutTab ? "Search any player, club, league, or nation…" : "Search your players, club, or country…"} value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>ACCENTS OPTIONAL</kbd></div>{!scoutTab && <div className="filter-pills">{["ALL", "ST", "LW", "RW", "CF", "CAM", "CM", "CDM", "LB", "CB", "RB", "GK"].map((value) => <button key={value} className={positionFilter === value ? "filter-active" : ""} onClick={() => setPositionFilter(value)}>{value}</button>)}</div>}<span className="collection-count">{scoutTab ? `${scoutResults.length} PLAYERS` : `${filteredInventory.length} CARDS`}</span></div>
        {!scoutTab && (filteredInventory.length ? <div className="collection-grid">{filteredInventory.map((card) => {
          const player = getPlayer(card);
          if (!player) return null;
          return <div className="collection-item" key={card.inventory_id}><PlayerCard player={player} /><div className="collection-actions"><button onClick={() => { setListingCard(card); setListingPrice(String(Math.max(200, player.overall * 40))); }} disabled={Boolean(card.is_untradeable) || working}>LIST ON MARKET</button><button className="quick-sell-button" onClick={() => void quickSell(card)} disabled={working || Boolean(card.is_untradeable)}>QUICK SELL</button></div></div>;
        })}</div> : search ? <div className="empty-state small-empty"><div className="empty-crest"><Search size={22} /></div><h2>No cards match that search.</h2><p>Try another spelling, club, country, or position.</p></div> : <div className="empty-state"><div className="empty-crest"><PackageOpen size={25} /></div><h2>Your club room is ready.</h2><p>Open a pack to bring your first players home.</p><button className="button button-lime" onClick={() => chooseSection("packs")}>FIND YOUR FIRST PLAYER <ArrowRight size={16} /></button></div>)}
        {scoutTab && (search.trim().length < 2 ? <div className="scout-welcome"><div className="empty-crest"><Crosshair size={24} /></div><div><h2>Search the player catalogue</h2><p>Type at least two letters. Accents and punctuation are ignored, so <b>Alvarez</b> also finds <b>Álvarez</b>.</p></div></div> : scoutLoading ? <div className="scout-status"><span className="live-dot" /> Scouting the player database…</div> : scoutError ? <div className="notice-banner"><CircleHelp size={18} /><span>{scoutError} Once I finish the files, I’ll show you how to run that one-time update in Supabase.</span></div> : scoutResults.length ? <div className="collection-grid scout-grid">{scoutResults.map((player) => <div className="scout-player" key={player.id}><PlayerCard player={player} /><div className="scout-player-copy"><b>{player.club_name || "Club not listed"}</b><span>{player.nationality_name || player.league_name || "Player"}</span></div><button className="collection-scout-button" onClick={() => chooseSection("packs")}>LOOK FOR THIS PLAYER IN PACKS <ArrowRight size={14} /></button></div>)}</div> : <div className="empty-state small-empty"><div className="empty-crest"><Search size={22} /></div><h2>No players found.</h2><p>Try a surname, club, league, or country.</p></div>)}
      </div>
    );
  }

  function renderSquad() {
    return (
      <div className="page-content">
        <div className="page-title-row"><div><span className="eyebrow muted-eyebrow">YOUR TACTICAL BOARD</span><h1>Pick your First XI.</h1><p>Tap a spot on the pitch, then choose a player from your club.</p></div><div className="squad-summary"><span><b>{squadRating || "--"}</b><small>RATING</small></span><i /><span><b>{chemistry}</b><small>CHEMISTRY</small></span></div></div>
        <div className="squad-layout">
          <div className="tactics-panel"><div className="tactics-panel-top"><span><span className="live-dot" /> FORMATION</span><button className="formation-button">4-3-3 <ChevronDown size={14} /></button></div><div className="squad-pitch">
            <div className="pitch-outline" /><div className="pitch-halfway" /><div className="pitch-center-circle" /><div className="pitch-box pitch-box-top" /><div className="pitch-box pitch-box-bottom" />
            {FORMATION.map((place, index) => {
              const slot = slots.find((entry) => entry.slot_number === index + 1);
              const card = slot?.inventory_id ? ownedById.get(slot.inventory_id) : null;
              const player = card ? getPlayer(card) : null;
              return <button key={index} className={`squad-slot ${player ? "squad-slot-filled" : ""}`} style={{ left: `${place.x}%`, top: `${place.y}%` }} onClick={() => { setSlotSearch(""); setSlotToFill(index + 1); }}>
                {player ? <><span className="slot-rating">{player.overall}</span><span className="slot-player-face">{player.source_face_url ? <img src={player.cutout_url || player.source_face_url} alt="" /> : initials(player.full_name)}</span><span className="slot-player-name">{player.short_name || player.full_name.split(" ").at(-1)}</span></> : <><span className="slot-plus"><Plus size={17} /></span><span className="slot-position">{place.position}</span></>}
              </button>;
            })}
            <div className="pitch-glow" />
          </div><div className="pitch-bottom"><span><span className="chem-dot" /> CLUB CHEMISTRY</span><div className="chem-meter"><i style={{ width: `${chemistry / 33 * 100}%` }} /></div><b>{chemistry}<small>/33</small></b></div></div>
          <aside className="squad-aside"><div className="aside-heading"><div><span className="eyebrow muted-eyebrow">THE DRESSING ROOM</span><h3>Squad notes</h3></div><Shield size={18} /></div><div className="squad-note-card"><div className="squad-note-icon"><Users size={17} /></div><div><b>Eleven spots. One story.</b><p>Players from the same club, league, or country lift your chemistry.</p></div></div><div className="squad-stat-list"><div><span>STARTING PLAYERS</span><b>{filledPlayers.length} <small>/ 11</small></b></div><div><span>AVERAGE RATING</span><b>{squadRating || "—"}</b></div><div><span>BEST PLAYER</span><b>{filledPlayers.length ? Math.max(...filledPlayers.map((player) => player.overall)) : "—"}</b></div></div><button className="button button-lime full-button" onClick={() => chooseSection("matches")}><Swords size={16} /> TAKE THIS TEAM TO MATCHDAY</button></aside>
        </div>
      </div>
    );
  }

  function renderMatches() {
    const canKickOff = matchMode === "ai"
      ? filledPlayers.length > 0 && !match?.running
      : filledPlayers.length > 0 && !match?.running && Boolean(roomCode && isRoomHost && onlinePlayers >= 2);
    return (
      <div className="page-content">
        <div className="page-title-row"><div><span className="eyebrow muted-eyebrow">MATCHDAY IS HERE</span><h1>Choose your match.</h1><p>Play a fast result, watch your team play it out, or invite a friend online.</p></div><div className="match-record"><span className="live-dot" /> {filledPlayers.length}/11 IN YOUR XI</div></div>
        <div className="division-panel"><div className="division-emblem"><Medal size={24} /></div><div className="division-copy"><span>NEBULA DIVISION</span><b>DIVISION {division} <small>· {division >= 8 ? "BRONZE" : division >= 5 ? "SILVER" : division >= 3 ? "GOLD" : division === 2 ? "ELITE" : "CHAMPIONS"}</small></b><div className="division-progress"><i style={{ width: `${divisionProgress}%` }} /></div><small>{division === 1 ? "Top division reached" : `${divisionPoints % 9} / 9 points to promotion`}</small></div><div className="division-record"><b>{divisionPoints}</b><span>DIVISION POINTS</span></div></div>
        <div className="match-mode-tabs"><button className={matchMode === "ai" ? "match-mode-active" : ""} disabled={Boolean(match?.running)} onClick={() => { leaveOnlineRoom(); setMatchMode("ai"); setMatch(null); matchRef.current = null; }}><Bolt size={17} /><span><b>VS AI</b><small>Play solo against a rival club</small></span></button><button className={matchMode === "online" ? "match-mode-active" : ""} disabled={Boolean(match?.running)} onClick={() => { setMatchMode("online"); setMatchStyle("manager"); setMatch(null); matchRef.current = null; }}><Users size={17} /><span><b>ONLINE FRIENDLY</b><small>Create a room or enter a friend’s code</small></span></button></div>
        {matchMode === "ai" ? <div className="sim-mode-tabs"><span>CHOOSE YOUR SIMULATION</span><button className={matchStyle === "quick" ? "sim-mode-active" : ""} disabled={Boolean(match?.running)} onClick={() => { setMatchStyle("quick"); setMatch(null); }}>QUICK SIM <small>Instant match result</small></button><button className={matchStyle === "manager" ? "sim-mode-active" : ""} disabled={Boolean(match?.running)} onClick={() => { setMatchStyle("manager"); setMatch(null); }}>2D MANAGER SIM <small>Watch a live 90-minute simulation</small></button></div> : <div className="online-room-panel"><div className="online-room-copy"><span className="eyebrow muted-eyebrow">FRIEND ROOM</span><h2>{roomCode ? "Your room is ready." : "Play a friend online."}</h2><p>{roomStatus || "Create a room and share the code, or enter your friend’s code to join."}</p>{roomCode && <div className="room-code-display"><span>ROOM CODE</span><b>{roomCode}</b><small>{onlinePlayers} / 2 MANAGERS CONNECTED</small></div>}</div><div className="online-room-actions"><button className="button button-lime" onClick={createOnlineRoom} disabled={Boolean(match?.running)}><Plus size={16} /> CREATE ROOM</button><span>OR JOIN A FRIEND</span><div className="room-join-row"><input value={roomInput} onChange={(event) => setRoomInput(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))} placeholder="ENTER ROOM CODE" maxLength={8} disabled={Boolean(match?.running)} /><button className="button button-quiet" onClick={() => connectOnlineRoom(roomInput, false)} disabled={roomInput.length < 4 || Boolean(match?.running)}>JOIN</button></div></div></div>}
        <div className="match-layout">
          <section className="match-main-card"><div className="match-card-top"><div className="match-mode-label"><Swords size={16} /> {matchMode === "online" ? "ONLINE FRIENDLY" : matchStyle === "quick" ? "QUICK SIM · VS AI" : "2D MANAGER SIM · VS AI"}</div><span className="match-time-tag">90 MINUTES</span></div><div className="match-center"><div className="match-badge home-badge"><Shield size={29} /><span>YOUR CLUB</span></div><div className="match-vs">VS<span>{matchMode === "online" ? "FRIEND" : "RIVAL AI"}</span></div><div className="match-badge away-badge"><span className="ai-crest">{matchMode === "online" ? "FC" : "AI"}</span><span>{matchMode === "online" ? onlineOpponent?.manager || (onlinePlayers > 1 ? "FRIEND CONNECTED" : "WAITING FOR FRIEND") : "RIVALS FC"}</span></div></div>
            {match && <div className="match-scoreboard"><div className="score-time">{match.running ? `${match.minute}'` : "FULL TIME"}</div><div className="score-numbers"><b>{match.home}</b><span>:</span><b>{match.away}</b></div><p>{match.commentary}</p><div className="match-live-stats"><span>SHOTS <b>{match.homeShots} – {match.awayShots}</b></span><span>ON TARGET <b>{match.homeShotsOnTarget} – {match.awayShotsOnTarget}</b></span><span>POSSESSION <b>{match.homePossession}% – {100 - match.homePossession}%</b></span><span>FOULS <b>{match.homeFouls} – {match.awayFouls}</b></span><span>CARDS <b>{match.homeYellowCards + match.homeRedCards} – {match.awayYellowCards + match.awayRedCards}</b></span><span>CORNERS <b>{match.homeCorners} – {match.awayCorners}</b></span><span>OFFSIDES <b>{match.homeOffsides} – {match.awayOffsides}</b></span><span>xG <b>{match.homeXg.toFixed(2)} – {match.awayXg.toFixed(2)}</b></span></div></div>}
            <div className="tactics-select"><span>YOUR TACTIC · AFFECTS ATTACK AND DEFENCE</span>{(["DEFENDING", "BALANCED", "ATTACKING"] as Tactic[]).map((tactic) => <button key={tactic} className={quickTactic === tactic ? "tactic-selected" : ""} onClick={() => { setQuickTactic(tactic); if (matchMode === "online" && onlineChannel.current) void onlineChannel.current.track({ manager: playerName, user_id: userId, strength: getTeamStrength(filledPlayers, tactic, chemistry), joined_at: new Date().toISOString() }); }} disabled={Boolean(match?.running)}>{tactic}</button>)}</div>
            <button className="button button-lime match-start-button" onClick={startMatch} disabled={!canKickOff}><Swords size={17} /> {match?.running ? "MATCH IN PROGRESS…" : matchMode === "online" && !isRoomHost ? "WAITING FOR HOST" : matchMode === "online" && onlinePlayers < 2 ? "WAITING FOR FRIEND" : matchStyle === "quick" && matchMode === "ai" ? match ? "SIM AGAIN" : "START QUICK SIM" : match ? "PLAY AGAIN" : "KICK OFF"} <ArrowRight size={16} /></button>
            {!filledPlayers.length && <div className="match-hint">Choose players for your First XI before kick-off.</div>}
            {matchMode === "online" && roomStatus && onlinePlayers < 2 && <div className="match-hint">Share the room code with a friend who has an account on this game.</div>}
            {matchMode === "online" && !roomCode && <div className="match-hint">Create or join a room first. Online friend matches use the live Supabase connection.</div>}
          </section>
          <aside className="match-side-card"><div className="aside-heading"><div><span className="eyebrow muted-eyebrow">LIVE MATCH ENGINE</span><h3>{match?.running ? `${match.minute} minutes played` : "Your tactical view."}</h3></div><Bolt size={19} /></div><MatchPitch state={match} /><div className="arcade-caption"><span><i className="arcade-dot lime-dot" /> YOUR XI</span><span><i className="arcade-dot blue-dot" /> {matchMode === "online" ? "FRIEND" : "RIVALS FC"}</span><span>22 PLAYER NODES</span></div><div className="match-event-log">{matchLog.length ? [...matchLog].reverse().slice(0, 5).map((event, index) => <div className="match-event-line" key={`${event.minute}-${index}`}><b>{event.minute}&apos;</b><span>{event.commentary}</span></div>) : <p>Match events and chances will appear here as the simulation runs.</p>}</div><div className="match-reward"><div className="reward-coin"><Coins size={17} /></div><span><b>Matchday reward</b><small>Earn 100 coins after the final whistle.</small></span><span className="reward-amount">+100</span></div></aside>
        </div>
      </div>
    );
  }

  function renderMarket() {
    const filteredMarket = market.filter((listing) => {
      const player = playerForListing(listing);
      return player && playerMatchesSearch([player.full_name, player.short_name, player.club_name, player.league_name, player.nationality_name], marketSearch);
    });
    return (
      <div className="page-content">
        <div className="page-title-row"><div><span className="eyebrow muted-eyebrow">THE TRANSFER ROOM</span><h1>Find your missing piece.</h1><p>Players listed by other managers. Your next signing is out there.</p></div><div className="pack-coin-chip"><Coins size={17} /><b>{coins.toLocaleString()}</b><span>COINS</span></div></div>
        <div className="collection-toolbar market-search-toolbar"><div className="search-box"><Search size={17} /><input placeholder="Search listed players, clubs, or countries…" value={marketSearch} onChange={(event) => setMarketSearch(event.target.value)} /><kbd>ACCENTS OPTIONAL</kbd></div><button className="button button-quiet" onClick={() => void loadMarket()}>REFRESH LISTINGS</button></div>
        {filteredMarket.length ? <div className="market-grid">{filteredMarket.map((listing) => { const player = playerForListing(listing); if (!player) return null; return <article className="market-item" key={listing.id}><PlayerCard player={player} compact /><div className="market-item-meta"><span>{listing.seller_id === userId ? "YOUR LISTING" : "LISTED BY A MANAGER"}</span><b>{listing.price_coins.toLocaleString()} <small>COINS</small></b></div>{listing.seller_id === userId ? <button className="market-cancel-button" disabled={working} onClick={() => void cancelListing(listing)}>REMOVE LISTING</button> : <button className="button button-lime full-button" disabled={working || coins < listing.price_coins} onClick={() => void buyListing(listing)}>MAKE THIS SIGNING<ArrowRight size={15} /></button>}</article>; })}</div> : <div className="empty-state"><div className="empty-crest"><ShoppingBag size={24} /></div><h2>{market.length ? "No listing matches that search." : "The transfer room is quiet."}</h2><p>{market.length ? "Try another player name, club, league, or country." : "When managers list players, you’ll find them here."}</p><button className="button button-quiet" onClick={() => void loadMarket()}>CHECK AGAIN <ArrowRight size={15} /></button></div>}
      </div>
    );
  }

  const currentSection = NAV.find((item) => item.id === section);
  const PageIcon = currentSection?.icon || Home;

  if (gameMode === "choose") return <GameModeSelect onOffline={() => setGameMode("offline")} onOnline={() => setGameMode("online")} />;
  if (gameMode === "offline") return <CareerMode playerName={playerName} onBack={() => setGameMode("choose")} onOnline={() => setGameMode("online")} />;

  return (
    <main className="game-shell">
      <aside className="side-rail">
        <button className="game-brand" onClick={() => chooseSection("home")} aria-label="NEBULAFUT home"><span className="nebula-wordmark sidebar-wordmark"><strong>NEBULA</strong><small>FUT.</small></span></button>
        <div className="rail-season"><span className="live-dot" /> SEASON 26</div>
        <nav className="main-nav" aria-label="Game navigation">
          <div className="nav-section-label">YOUR CLUB</div>
          {NAV.slice(0, 4).map((item) => { const Icon = item.icon; return <button key={item.id} className={`nav-button ${section === item.id ? "nav-button-active" : ""}`} onClick={() => chooseSection(item.id)}><Icon size={18} /><span>{item.label}</span>{section === item.id && <i />}</button>; })}
          <div className="nav-section-label nav-label-second">MATCHDAY</div>
          {NAV.slice(4).map((item) => { const Icon = item.icon; return <button key={item.id} className={`nav-button ${section === item.id ? "nav-button-active" : ""}`} onClick={() => chooseSection(item.id)}><Icon size={18} /><span>{item.label}</span>{item.id === "matches" && <span className="nav-new">PLAY</span>}{section === item.id && <i />}</button>; })}
        </nav>
        <div className="rail-bottom">
          <div className="club-progress"><div className="progress-head"><span>CLUB LEVEL</span><b>01</b></div><div className="progress-track"><i style={{ width: `${Math.min(18 + inventory.length * 6, 88)}%` }} /></div><small>YOUR JOURNEY STARTS NOW</small></div>
          <button className="rail-help" onClick={() => notify("Your club is private. Only you can see your cards and squad.")}><CircleHelp size={16} /> <span>Need a hand?</span></button>
          <div className="user-mini"><div className="user-avatar">{avatar ? <img src={avatar} alt="" /> : initials(playerName)}</div><div className="user-mini-copy"><b>{playerName}</b><span>CLUB MANAGER</span></div><button onClick={() => void signOut()} aria-label="Log out"><LogOut size={16} /></button></div>
        </div>
      </aside>

      <section className="game-main">
        <header className="game-topbar"><div className="mobile-brand"><span className="nebula-wordmark"><strong>NEBULA</strong><small>FUT.</small></span></div><div className="breadcrumb"><span>CLUB</span><i>/</i><b><PageIcon size={15} /> {currentSection?.label.toUpperCase()}</b></div><div className="topbar-right"><div className="season-chip"><span className="live-dot" /> SEASON 26</div><button className="mode-switch-small" onClick={() => setGameMode("choose")}>GAME MODE</button><button className="icon-button notification-button" aria-label="Notifications" onClick={() => notify("You're all caught up.")}><Bell size={17} /><i /></button><div className="coin-balance"><Coins size={16} /><b>{coins.toLocaleString()}</b><span>COINS</span></div><div className="top-avatar">{avatar ? <img src={avatar} alt="" /> : initials(playerName)}</div></div></header>
        <div className="main-scroll">
          <AnimatePresence mode="wait">
            <motion.div key={section} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.2 }}>
              {section === "home" && renderHome()}
              {section === "packs" && renderPacks()}
              {section === "club" && renderClub()}
              {section === "squad" && renderSquad()}
              {section === "matches" && renderMatches()}
              {section === "market" && renderMarket()}
            </motion.div>
          </AnimatePresence>
          {loading && <div className="loading-bar"><i /></div>}
          <footer className="game-footer"><span>NEBULAFUT. <b>26</b></span><span>PLAY YOUR WAY · BUILD YOUR LEGACY</span><span>THE CLUB IS YOURS</span></footer>
        </div>
      </section>

      <AnimatePresence>
        {selectedPack && <motion.div className="modal-backdrop pack-reveal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="reveal-modal" initial={{ scale: 0.86, y: 25, rotateX: 7 }} animate={{ scale: 1, y: 0, rotateX: 0 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: "spring", damping: 21 }}>
            <button className="modal-close" onClick={() => setSelectedPack(null)} aria-label="Close"><X size={19} /></button><div className="reveal-kicker"><Sparkles size={15} /> {selectedPack.name.toUpperCase()} · PACK OPENED</div><h2>New faces. New stories.</h2><p>Your new players are ready for the club.</p><div className="reveal-cards">{revealed.map((card, index) => { const player = getPlayer(card); return player ? <motion.div key={card.inventory_id} initial={{ opacity: 0, y: 28, rotateY: 24 }} animate={{ opacity: 1, y: 0, rotateY: 0 }} transition={{ delay: index * 0.14, duration: 0.45 }}><PlayerCard player={player} compact /></motion.div> : null; })}</div><button className="button button-lime reveal-done" onClick={() => setSelectedPack(null)}>ADD TO MY CLUB <ArrowRight size={16} /></button></motion.div>
        </motion.div>}
        {slotToFill !== null && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) setSlotToFill(null); }}><motion.div className="selection-modal" initial={{ y: 22, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }}><div className="modal-heading"><div><span className="eyebrow muted-eyebrow">POSITION {FORMATION[slotToFill - 1].position}</span><h2>Choose your player.</h2></div><button className="modal-close inline-close" onClick={() => setSlotToFill(null)} aria-label="Close"><X size={18} /></button></div><div className="search-box slot-search"><Search size={17} /><input placeholder="Find by player, club, or country…" value={slotSearch} onChange={(event) => setSlotSearch(event.target.value)} /><kbd>ACCENTS OPTIONAL</kbd></div>{inventory.length ? <div className="player-choice-grid">{inventory.filter((card) => { const player = getPlayer(card); return player && playerMatchesSearch([player.full_name, player.short_name, player.club_name, player.league_name, player.nationality_name], slotSearch); }).map((card) => { const player = getPlayer(card); return player ? <PlayerCard key={card.inventory_id} player={player} compact onClick={() => void fillSlot(slotToFill, card.inventory_id)} /> : null; })}</div> : <div className="empty-state small-empty"><p>Open a pack before choosing players.</p><button className="button button-lime" onClick={() => { setSlotToFill(null); chooseSection("packs"); }}>GO TO PACKS <ArrowRight size={15} /></button></div>}{inventory.length > 0 && !inventory.some((card) => { const player = getPlayer(card); return player && playerMatchesSearch([player.full_name, player.short_name, player.club_name, player.league_name, player.nationality_name], slotSearch); }) && <p className="slot-no-results">No players match that search.</p>}{slots.find((slot) => slot.slot_number === slotToFill)?.inventory_id && <button className="remove-player-button" onClick={() => void fillSlot(slotToFill, null)}>REMOVE PLAYER FROM THIS SPOT</button>}</motion.div></motion.div>}
        {listingCard && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) setListingCard(null); }}><motion.div className="listing-modal" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}><button className="modal-close" onClick={() => setListingCard(null)} aria-label="Close"><X size={18} /></button><span className="eyebrow muted-eyebrow">TRANSFER ROOM</span><h2>List this player.</h2><p>Choose a price in club coins. You can’t use a card in your squad while it’s listed.</p><div className="listing-player-line"><strong>{getPlayer(listingCard)?.short_name || getPlayer(listingCard)?.full_name}</strong><span>OVR {getPlayer(listingCard)?.overall}</span></div><label htmlFor="listing-price">YOUR ASKING PRICE</label><div className="price-input-wrap"><Coins size={17} /><input id="listing-price" type="number" min="1" value={listingPrice} onChange={(event) => setListingPrice(event.target.value)} /></div><button className="button button-lime full-button" disabled={working} onClick={() => void saveListing()}>{working ? "LISTING…" : "LIST PLAYER"}<ArrowRight size={15} /></button></motion.div></motion.div>}
      </AnimatePresence>
      <AnimatePresence>{toast && <motion.div className="toast-message" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}><BadgeCheck size={17} /> {toast}</motion.div>}</AnimatePresence>
    </main>
  );
}
