import { z } from 'zod';

// ── Player identity ───────────────────────────────────────────────────────────
// The anonymous player id is a client-generated UUID (crypto.randomUUID).
export const playerIdSchema = z.string().uuid();

export function getPlayerId(req: Request): string | null {
  const id = req.headers.get('x-player-id');
  if (!id) return null;
  const parsed = playerIdSchema.safeParse(id);
  return parsed.success ? parsed.data : null;
}

// ── Progress (player_progress row) ────────────────────────────────────────────
// The cap must stay comfortably above the number of skins the game actually
// ships (currently ~250 salads and growing). A player who owns every skin must
// still be able to save; too low a cap rejects their whole payload with 422 and
// silently strands progress in localStorage.
const skinList = z.array(z.string().max(64)).max(2000);

export const progressSchema = z.object({
  coins: z.number().int().min(0).max(1_000_000_000),
  ownedSkins: skinList,
  activeSkin: z.string().max(64),
  purchaseCount: z.number().int().min(0).max(1_000_000),
  ownedBurgerSkins: skinList,
  activeBurgerSkin: z.string().max(64),
  burgerPurchaseCount: z.number().int().min(0).max(1_000_000),
  ownedPizzaSkins: skinList,
  activePizzaSkin: z.string().max(64),
  pizzaPurchaseCount: z.number().int().min(0).max(1_000_000),
  ownedSaladSkins: skinList,
  activeSaladSkin: z.string().max(64),
  saladPurchaseCount: z.number().int().min(0).max(1_000_000),
  displayName: z.string().max(64).nullable().optional(),
});

export type ProgressInput = z.infer<typeof progressSchema>;

// Maps the validated camelCase payload to the snake_case DB columns.
export function progressToRow(playerId: string, p: ProgressInput) {
  const row: Record<string, unknown> = {
    player_id: playerId,
    coins: p.coins,
    owned_skins: p.ownedSkins,
    active_skin: p.activeSkin,
    purchase_count: p.purchaseCount,
    owned_burger_skins: p.ownedBurgerSkins,
    active_burger_skin: p.activeBurgerSkin,
    burger_purchase_count: p.burgerPurchaseCount,
    owned_pizza_skins: p.ownedPizzaSkins,
    active_pizza_skin: p.activePizzaSkin,
    pizza_purchase_count: p.pizzaPurchaseCount,
    owned_salad_skins: p.ownedSaladSkins,
    active_salad_skin: p.activeSaladSkin,
    salad_purchase_count: p.saladPurchaseCount,
    updated_at: new Date().toISOString(),
  };
  if (p.displayName !== undefined) row.display_name = p.displayName;
  return row;
}

// Maps a DB row back to the camelCase shape the client consumes.
export function rowToProgress(row: Record<string, any>) {
  return {
    coins: row.coins,
    ownedSkins: row.owned_skins,
    activeSkin: row.active_skin,
    purchaseCount: row.purchase_count,
    ownedBurgerSkins: row.owned_burger_skins,
    activeBurgerSkin: row.active_burger_skin,
    burgerPurchaseCount: row.burger_purchase_count,
    ownedPizzaSkins: row.owned_pizza_skins,
    activePizzaSkin: row.active_pizza_skin,
    pizzaPurchaseCount: row.pizza_purchase_count,
    ownedSaladSkins: row.owned_salad_skins,
    activeSaladSkin: row.active_salad_skin,
    saladPurchaseCount: row.salad_purchase_count,
    displayName: row.display_name ?? null,
    highScore: row.high_score ?? 0,
  };
}

// Defaults for a brand-new player id (no row yet).
export function defaultProgress() {
  return {
    coins: 0,
    ownedSkins: ['classic'],
    activeSkin: 'classic',
    purchaseCount: 0,
    ownedBurgerSkins: ['classic'],
    activeBurgerSkin: 'classic',
    burgerPurchaseCount: 0,
    ownedPizzaSkins: ['classic'],
    activePizzaSkin: 'classic',
    pizzaPurchaseCount: 0,
    ownedSaladSkins: ['classic'],
    activeSaladSkin: 'classic',
    saladPurchaseCount: 0,
    displayName: null,
    highScore: 0,
  };
}

// ── Game session (game_sessions row) ──────────────────────────────────────────
export const clientSchema = z.enum(['web', 'android', 'ios']).default('web');

export const sessionSchema = z.object({
  score: z.number().int().min(0).max(10_000_000),
  levelReached: z.number().int().min(1).max(100_000),
  coinsEarned: z.number().int().min(0).max(10_000_000),
  burgersCaught: z.number().int().min(0).max(10_000_000),
  pizzasCaught: z.number().int().min(0).max(10_000_000),
  saladsCaught: z.number().int().min(0).max(10_000_000),
  itemsMissed: z.number().int().min(0).max(10_000_000),
  durationMs: z.number().int().min(0).max(86_400_000),
  client: clientSchema.optional(),
});

export type SessionInput = z.infer<typeof sessionSchema>;

export function sessionToRow(playerId: string, s: SessionInput) {
  return {
    player_id: playerId,
    score: s.score,
    level_reached: s.levelReached,
    coins_earned: s.coinsEarned,
    burgers_caught: s.burgersCaught,
    pizzas_caught: s.pizzasCaught,
    salads_caught: s.saladsCaught,
    items_missed: s.itemsMissed,
    duration_ms: s.durationMs,
    client: s.client ?? 'web',
  };
}

// ── Activity event (activity_events row) ──────────────────────────────────────
export const activitySchema = z.object({
  eventType: z.string().min(1).max(64),
  payload: z.record(z.unknown()).default({}),
  client: clientSchema.optional(),
});

export type ActivityInput = z.infer<typeof activitySchema>;
