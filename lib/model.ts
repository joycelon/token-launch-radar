// Token Launch Radar — the valuation and ranking model (model version catmult-2).
//
// One sealed DefiLlama snapshot in, one ranked board out. Every figure on the board is derived
// from the snapshot's own records: no outside prices, no hand-kept list of names, no clock and
// no randomness, so two runs over the same snapshot write the same bytes.
//
// The board's population is the snapshot's watchlist rule applied at every size, not only above
// the $50M floor: a protocol joins the board when DefiLlama records no token for it (no market
// cap, no CoinGecko id, no symbol) and it is not a wrapped, staked or bridged product of a token
// that already trades (the house's excluded categories, version-marked pool names, names that
// carry the whole words wrapped / staked / staking, and names that begin with an exchange's).
// Every watchlist slug is on the board; the smaller protocols below the floor are the early
// rows a launch radar exists to find.
//
// Implied value, per protocol:
//
//   multiple   the median market-cap / TVL ratio of the snapshot's token-bearing protocols in
//              the same DefiLlama category, each ratio first clamped to [0.01, 5] so one
//              runaway print cannot bend a whole category. A category with fewer than 4
//              token-bearing peers falls back to its family median (lending, trading, yield,
//              staking, bridges, asset issuers, allocators, infrastructure), and a family with
//              fewer than 4 falls back to the snapshot-wide median. The row records which
//              level priced it, how many peers stood behind the number, and the three largest
//              peers by TVL, so a reader can audit every price on the board.
//   growth     1 + clamp(change_7d, -50, 100) / 100 * 0.35; an unreported change counts as 0.
//   maturity   0.8 + 0.2 * min(age_days, 1825) / 1825, where age is measured from listed_at to
//              the snapshot's as_of; an unknown listing date counts as the neutral 0.9.
//   implied    round(TVL * multiple * growth * maturity), at least $1.
//
// Rank is by implied value, descending; ties break on the radar score, then on slug, so the
// order is total and stable. The radar score (0-100) is a separate triage signal, never the
// rank: size 35 (log TVL between the $5M snapshot floor and $20B), momentum 20 (7-day TVL
// change), track record 20 (days listed, capped at five years), reach 10 (chains, capped at
// five) and multiple confidence 15 (category peers 1.0, family 0.6, global 0.3).

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's version label: the dashboard and the README name it. */
export const MODEL_VERSION = 'catmult-2';

/** The model's stated constants, printed in the dashboard's methodology panel. */
export const MODEL = {
  ratio_clamp_lo: 0.01,
  ratio_clamp_hi: 5,
  min_peers: 4,
  growth_weight: 0.35,
  growth_floor: -50,
  growth_cap: 100,
  maturity_base: 0.8,
  maturity_range: 0.2,
  maturity_days: 1825,
  unknown_age_factor: 0.9,
} as const;

/** One token-bearing peer behind a multiple: the audit trail of a price. */
export interface Peer {
  name: string;
  symbol: string | null;
  tvl_usd: number;
  mcap_usd: number;
  ratio: number;
}

/** The multiple one protocol was priced with, and where the number came from. */
export interface MultipleInfo {
  value: number;
  source: 'category' | 'family' | 'global';
  source_name: string;
  peer_count: number;
  peers: Peer[];
}

/** One row of board.json: the ranked board's row, with its whole audit trail. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  radar_score: number;
  score_parts: { size: number; momentum: number; track: number; reach: number; confidence: number };
  multiple: number;
  multiple_source: 'category' | 'family' | 'global';
  multiple_source_name: string;
  peer_count: number;
  peers: Peer[];
  growth_factor: number;
  maturity_factor: number;
  farm_steps: string[];
}

/** The dashboard's compact view of one row; the detail view recomputes nothing. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  radar_score: number;
  score_parts: { size: number; momentum: number; track: number; reach: number; confidence: number };
  multiple: number;
  multiple_source: 'category' | 'family' | 'global';
  multiple_source_name: string;
  peer_count: number;
  peers: Peer[];
  growth_factor: number;
  maturity_factor: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the page shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  symbol: string | null;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  ratio: number | null;
  change_7d: number | null;
}

/** The category multiples the model derived, for the methodology panel. */
export interface CategoryStat {
  category: string;
  peers: number;
  median: number | null;
  used: number;
  used_source: 'category' | 'family' | 'global';
}

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  model: typeof MODEL;
  snapshot_size: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  total_implied_usd: number;
  global_median: number;
  categories: CategoryStat[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round1 = (n: number): number => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const bySlugAsc = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A whole day count from listed_at to as_of, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether DefiLlama records no token for the protocol. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** Categories that are products of a token that already trades, per the watchlist's own rule. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
/** Names that begin with an exchange's name, per the watchlist's own rule. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)(\s|$)/;

/** Whether a protocol is a wrapped, staked or bridged product of one that trades. */
export function isProductOfTraded(p: SnapshotProtocol): boolean {
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return true;
  if (VERSIONED.test(p.name)) return true;
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return true;
  if (EXCHANGE_PREFIX.test(p.name)) return true;
  return false;
}

/** Whether the board may rank the protocol: pre-token and not a product of a traded token. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !isProductOfTraded(p);
}

/** Category families: the fallback level when a category has too few token-bearing peers. */
const FAMILIES: Record<string, string[]> = {
  Lending: ['Lending', 'CDP', 'CDP Manager', 'Uncollateralized Lending', 'Collateral Markets', 'Collateral Management'],
  Trading: ['Dexs', 'Derivatives', 'Options', 'Options Vault', 'Interest Rate Derivatives', 'Synthetics', 'Prediction Market', 'Basis Trading'],
  Yield: ['Yield', 'Yield Aggregator', 'Farm', 'Leveraged Farming', 'Liquidity Manager'],
  Staking: ['Liquid Staking', 'Staking Pool', 'Restaking', 'Liquid Restaking', 'Restaked BTC', 'Anchor BTC', 'Decentralized BTC'],
  Bridges: ['Bridge', 'Cross Chain Bridge', 'Canonical Bridge'],
  'Asset issuers': ['RWA', 'Indexes', 'Stablecoin Issuer', 'Algo-Stables', 'Dual-Token Stablecoin', 'Stablecoin Wrapper', 'Reserve Currency'],
  Allocators: ['Risk Curators', 'Onchain Capital Allocator'],
};
const FAMILY_OF = new Map<string, string>();
for (const [family, cats] of Object.entries(FAMILIES)) for (const c of cats) FAMILY_OF.set(c, family);

/** The clamped market-cap / TVL ratio of a token-bearing protocol, or null when it has no pair. */
function ratioOf(p: SnapshotProtocol): number | null {
  if (p.mcap_usd === null || p.tvl_usd <= 0) return null;
  return clamp(p.mcap_usd / p.tvl_usd, MODEL.ratio_clamp_lo, MODEL.ratio_clamp_hi);
}

/** The median of a list of numbers, or null when the list is empty. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The peer group behind one level of the fallback ladder: its median, its size, its largest members. */
interface PeerGroup {
  median: number;
  count: number;
  peers: Peer[];
}

function peerGroup(protocols: SnapshotProtocol[]): PeerGroup | null {
  const ratios: number[] = [];
  const peers: Peer[] = [];
  for (const p of protocols) {
    const r = ratioOf(p);
    if (r === null) continue;
    ratios.push(r);
    peers.push({ name: p.name, symbol: p.symbol, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd!, ratio: round4(r) });
  }
  const med = median(ratios);
  if (med === null) return null;
  peers.sort((a, b) => b.tvl_usd - a.tvl_usd || bySlugAsc(a.name, b.name));
  return { median: med, count: ratios.length, peers: peers.slice(0, 3) };
}

/** Every multiple the model can price with, computed once from the snapshot's token-bearing set. */
export interface MultipleTable {
  global: PeerGroup;
  byCategory: Map<string, PeerGroup>;
  byFamily: Map<string, PeerGroup>;
  stats: CategoryStat[];
}

export function buildMultiples(snapshot: Snapshot): MultipleTable {
  const bearing = snapshot.protocols.filter((p) => !isPreToken(p));
  const global = peerGroup(bearing)!;
  const byCategory = new Map<string, PeerGroup>();
  const byFamily = new Map<string, PeerGroup>();
  const catNames = new Set<string>();
  for (const p of snapshot.protocols) if (p.category !== null) catNames.add(p.category);
  for (const cat of [...catNames].sort(bySlugAsc)) {
    const group = peerGroup(bearing.filter((p) => p.category === cat));
    if (group !== null) byCategory.set(cat, group);
  }
  for (const [family, cats] of Object.entries(FAMILIES)) {
    const group = peerGroup(bearing.filter((p) => p.category !== null && cats.includes(p.category)));
    if (group !== null) byFamily.set(family, group);
  }
  const stats: CategoryStat[] = [...catNames].sort(bySlugAsc).map((cat) => {
    const own = byCategory.get(cat);
    const family = FAMILY_OF.get(cat);
    const fam = family !== undefined ? byFamily.get(family) : undefined;
    if (own !== undefined && own.count >= MODEL.min_peers) return { category: cat, peers: own.count, median: round4(own.median), used: round4(own.median), used_source: 'category' as const };
    if (fam !== undefined && fam.count >= MODEL.min_peers) return { category: cat, peers: own?.count ?? 0, median: own !== undefined ? round4(own.median) : null, used: round4(fam.median), used_source: 'family' as const };
    return { category: cat, peers: own?.count ?? 0, median: own !== undefined ? round4(own.median) : null, used: round4(global.median), used_source: 'global' as const };
  });
  return { global, byCategory, byFamily, stats };
}

/** The multiple one protocol is priced with: category, then family, then the snapshot-wide median. */
export function multipleFor(p: SnapshotProtocol, table: MultipleTable): MultipleInfo {
  const cat = p.category;
  if (cat !== null) {
    const own = table.byCategory.get(cat);
    if (own !== undefined && own.count >= MODEL.min_peers) {
      return { value: own.median, source: 'category', source_name: cat, peer_count: own.count, peers: own.peers };
    }
    const family = FAMILY_OF.get(cat);
    if (family !== undefined) {
      const fam = table.byFamily.get(family);
      if (fam !== undefined && fam.count >= MODEL.min_peers) {
        return { value: fam.median, source: 'family', source_name: family, peer_count: fam.count, peers: fam.peers };
      }
    }
  }
  return { value: table.global.median, source: 'global', source_name: 'all categories', peer_count: table.global.count, peers: table.global.peers };
}

/** The radar score's five parts and their sum, each computed from the snapshot's own figures. */
export function radarScore(p: SnapshotProtocol, age: number | null, multiple: MultipleInfo): { total: number; parts: BoardRow['score_parts'] } {
  const size = 35 * clamp(Math.log10(Math.max(p.tvl_usd, 1) / 5_000_000) / Math.log10(20_000_000_000 / 5_000_000), 0, 1);
  const momentum = p.change_7d === null ? 8 : 20 * (clamp(p.change_7d, -20, 40) + 20) / 60;
  const track = age === null ? 8 : 20 * Math.min(age, 1825) / 1825;
  const reach = 10 * Math.min(p.chains.length, 5) / 5;
  const confidence = 15 * (multiple.source === 'category' ? 1 : multiple.source === 'family' ? 0.6 : 0.3);
  const parts = { size: round1(size), momentum: round1(momentum), track: round1(track), reach: round1(reach), confidence: round1(confidence) };
  return { total: round1(parts.size + parts.momentum + parts.track + parts.reach + parts.confidence), parts };
}

/** The growth and maturity factors of one protocol under the model. */
export function factorsOf(p: SnapshotProtocol, age: number | null): { growth: number; maturity: number } {
  const growthPct = clamp(p.change_7d ?? 0, MODEL.growth_floor, MODEL.growth_cap);
  const growth = 1 + (growthPct / 100) * MODEL.growth_weight;
  const maturity = age === null ? MODEL.unknown_age_factor : MODEL.maturity_base + MODEL.maturity_range * Math.min(age, MODEL.maturity_days) / MODEL.maturity_days;
  return { growth, maturity };
}

// ---------------------------------------------------------------- farm plans

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  if (p.tvl_usd >= 20_000_000) return 75;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The category's core farming action and its standing risk, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): { action: string; weekly: string; risk: string } {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return {
      action: `Supply $${capital} of USDC to ${name} on ${chain}, then borrow no more than 40% of it once and re-supply the borrow, so both sides of the market see the wallet.`,
      weekly: `Rebalance the position weekly to keep the health factor above 2.0 and make one small extra supply or repay each week.`,
      risk: `Liquidation is the standing risk: keep the health factor above 2.0 and never let the borrowed share pass 50% of the supplied value.`,
    };
  }
  if (c.includes('dex')) {
    return {
      action: `Swap $${Math.max(25, Math.floor(capital / 2))} of USDC for the pool's second asset on ${name} (${chain}), then add $${capital} of paired liquidity to its main pool and keep the LP position open.`,
      weekly: `Make two or three small swaps a week through ${name} so the wallet shows trading volume as well as liquidity.`,
      risk: `Impermanent loss is the standing risk: prefer the deepest pool and a correlated pair where one exists.`,
    };
  }
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('option')) {
    return {
      action: `Deposit $${capital} of USDC as margin on ${name} (${chain}) and open one small position with a hedge, keeping margin use under a third of the deposit.`,
      weekly: `Trade one small position a week and keep total volume growing slowly rather than in a single burst.`,
      risk: `Margin is the standing risk: a hedge left unmonitored can still liquidate in a fast move, so check the position weekly.`,
    };
  }
  if (c.includes('bridge')) {
    return {
      action: `Bridge $${capital} of USDC from ${chain} to one destination chain through ${name}, then use the bridged funds in one app on the far side instead of bridging straight back.`,
      weekly: `Bridge one small amount a week in alternating directions so the wallet's routes look like use, not farming loops.`,
      risk: `Bridge contracts hold the funds in transit: split larger amounts into two crossings a day apart.`,
    };
  }
  if (c.includes('staking') || c.includes('restak')) {
    return {
      action: `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the staking receipt token in the same wallet.`,
      weekly: `Claim and restake rewards once a week so the wallet shows continuing participation, not a single deposit.`,
      risk: `Lockups and slashing are the standing risks: read the unbonding period before staking and keep an exit buffer unstaked.`,
    };
  }
  if (c.includes('rwa') || c.includes('stable') || c.includes('algo')) {
    return {
      action: `Mint or deposit $${capital} of the protocol's asset through ${name} on ${chain} and hold the issued asset in the farming wallet.`,
      weekly: `Add a small top-up once a week and hold through each weekly snapshot the protocol may take.`,
      risk: `Redemption terms are the standing risk: check the exit window and any lock before minting more than the starter amount.`,
    };
  }
  if (c.includes('curator') || c.includes('allocator') || c.includes('yield') || c.includes('farm') || c.includes('liquidity manager')) {
    return {
      action: `Deposit $${capital} of USDC into one of ${name}'s curated vaults on ${chain} and keep the vault shares in the wallet.`,
      weekly: `Review the vault's allocation once a week and move to a sibling vault only if its curator changes the strategy.`,
      risk: `Curator risk is the standing risk: the vault's manager chooses the markets, so spread larger amounts across two vaults.`,
    };
  }
  if (c.includes('prediction')) {
    return {
      action: `Fund $${capital} on ${name} and take one position in its most liquid market, sized under a fifth of the funds.`,
      weekly: `Trade one market a week and settle positions rather than letting them expire unclaimed.`,
      risk: `Event markets settle to zero on the losing side: size every position as money that can be lost in full.`,
    };
  }
  if (c.includes('insurance')) {
    return {
      action: `Buy $${capital} of cover from ${name} on ${chain} against a position you actually hold, and keep the policy to term.`,
      weekly: `Renew or extend cover as it lapses so the wallet's history is continuous.`,
      risk: `Cover pays only on the events its terms name: read the exclusions before relying on the policy.`,
    };
  }
  if (c.includes('launchpad')) {
    return {
      action: `Register the wallet on ${name} (${chain}) and take part in one launch with $${capital}, completing every step its allocation rules list.`,
      weekly: `Check the launch calendar weekly and complete profile or staking steps as they open, before each sale.`,
      risk: `Launch allocations can lock funds until distribution: never commit money needed before the unlock date.`,
    };
  }
  return {
    action: `Deposit $${capital} of USDC into ${name} on ${chain} through its main app and keep the position open.`,
    weekly: `Make one qualifying action a week inside ${name}'s app, such as a deposit, a claim or a vote.`,
    risk: `Smart-contract risk is the standing risk: keep the position sized so a total loss would not matter.`,
  };
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(text: string, cost: string, time: string): string {
  let s = `${text} Cost: ${cost}. Time: ${time}.`;
  if (s.length > 600) {
    // Cut at a word boundary, never mid-word, and close the sentence the cut opened.
    const cut = s.slice(0, 596);
    s = `${cut.slice(0, cut.lastIndexOf(' '))}...`;
  }
  return s;
}

/**
 * A protocol's farm plan: six steps derived from its own record (category, chains, TVL, age),
 * never from a hand-written list of names. The second step is the category's core action on the
 * protocol's first chain; a multi-chain protocol gets a second-chain step, a single-chain one
 * gets a depth step instead.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = capital >= 150 ? 8 : 4;
  const { action, weekly, risk } = actionFor(p, capital, chain);
  const steps: string[] = [
    stepText(
      `Open a fresh wallet for ${p.name} alone and fund it from your main wallet, keeping the seed phrase offline and the farm funds separate.`,
      'under $3 of gas for the funding transaction',
      '5 minutes',
    ),
    stepText(action, `$${capital} of capital and about $${gas} of gas`, '15 minutes to set up'),
  ];
  if (p.chains.length > 1) {
    steps.push(stepText(
      `Repeat a smaller version of the position on ${p.chains[1]}, the protocol's second chain by its DefiLlama record, so the wallet qualifies on more than one network.`,
      `about $${Math.max(25, Math.floor(capital / 2))} of capital and $4 of gas`,
      '15 minutes',
    ));
  } else {
    steps.push(stepText(
      `Deepen the ${chain} position once, a week after the first deposit, instead of opening it all on one day, so the history shows two separate decisions.`,
      `about $${Math.max(25, Math.floor(capital / 2))} more capital and $3 of gas`,
      '10 minutes',
    ));
  }
  steps.push(stepText(weekly, 'about $2 of gas a week', '10 minutes a week'));
  steps.push(stepText(
    `Hold the position for at least ${hold} days so the activity stands in more than one weekly snapshot of the protocol.`,
    `the $${capital} stays in the position`,
    `${hold} days`,
  ));
  steps.push(stepText(
    `Before withdrawing anything, open ${p.name}'s own points or rewards page and claim only through the link the protocol itself publishes. ${risk}`,
    'no fee to check, and never pay anyone to claim',
    '10 minutes',
  ));
  return steps;
}

// ---------------------------------------------------------------- the board

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, table: MultipleTable): BoardRow[] {
  const watch = new Set(snapshot.watchlist);
  const chosen = snapshot.protocols.filter((p) => watch.has(p.slug) || isRankable(p));
  const scored = chosen.map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const multiple = multipleFor(p, table);
    const { growth, maturity } = factorsOf(p, age);
    const implied = Math.max(1, Math.round(p.tvl_usd * multiple.value * growth * maturity));
    const score = radarScore(p, age, multiple);
    return { p, age, multiple, growth, maturity, implied, score };
  });
  scored.sort((a, b) => b.implied - a.implied || b.score.total - a.score.total || bySlugAsc(a.p.slug, b.p.slug));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    age_days: s.age,
    watchlist: watch.has(s.p.slug),
    implied_value_usd: s.implied,
    radar_score: s.score.total,
    score_parts: s.score.parts,
    multiple: round4(s.multiple.value),
    multiple_source: s.multiple.source,
    multiple_source_name: s.multiple.source_name,
    peer_count: s.multiple.peer_count,
    peers: s.multiple.peers,
    growth_factor: round4(s.growth),
    maturity_factor: round4(s.maturity),
    farm_steps: farmSteps(s.p, s.age),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live tokens view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || bySlugAsc(a.slug, b.slug))
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      symbol: p.symbol,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      ratio: ratioOf(p) === null ? null : round4(ratioOf(p)!),
      change_7d: p.change_7d,
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const table = buildMultiples(snapshot);
  const board = buildBoard(snapshot, table);
  const live = liveRows(snapshot);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    model: MODEL,
    snapshot_size: snapshot.protocols.length,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !r.watchlist).length,
    live_size: live.length,
    total_implied_usd: board.reduce((n, r) => n + r.implied_value_usd, 0),
    global_median: round4(table.global.median),
    categories: table.stats,
    rows: board,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100) return `the board holds ${board.length} rows, under the gate's 100`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value: a board that ranks nothing by value is not a ranking`;
  }
  const seen = new Set<string>();
  for (const r of board) {
    if (seen.has(r.slug)) return `${r.slug} appears twice`;
    seen.add(r.slug);
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
