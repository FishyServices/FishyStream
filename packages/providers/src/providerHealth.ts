import type { StreamSource } from "./providerCatalog";

export interface ProviderHealthState {
  providerKey: string;
  lastFailureAt?: number;
  failureCount: number;
  lastSuccessAt?: number;
  lastFailureReason?: string;
}

export interface RankSourcesOptions {
  initialSource?: string;
  defaultProvider?: string;
  health?: ProviderHealthState[];
}

function normalizeName(value: string | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function healthPenalty(state: ProviderHealthState | undefined, now = Date.now()) {
  if (!state?.lastFailureAt || state.failureCount <= 0) return 0;

  const failureAgeMs = now - state.lastFailureAt;
  const recentFailurePenalty = failureAgeMs < 10 * 60_000 ? 50 : 10;
  const recoveryBonus = state.lastSuccessAt && state.lastSuccessAt > state.lastFailureAt ? -25 : 0;

  return recentFailurePenalty + state.failureCount * 5 + recoveryBonus;
}

export function rankSources(sources: StreamSource[], options: RankSourcesOptions = {}) {
  const healthByProvider = new Map(
    (options.health ?? []).map((state) => [state.providerKey, state])
  );
  const preferredName = normalizeName(options.initialSource);

  return [...sources].sort((a, b) => {
    const aInitial = preferredName && normalizeName(a.name) === preferredName ? -1000 : 0;
    const bInitial = preferredName && normalizeName(b.name) === preferredName ? -1000 : 0;
    const aDefault =
      options.defaultProvider &&
      options.defaultProvider !== "auto" &&
      a.key === options.defaultProvider
        ? -500
        : 0;
    const bDefault =
      options.defaultProvider &&
      options.defaultProvider !== "auto" &&
      b.key === options.defaultProvider
        ? -500
        : 0;
    const aScore = aInitial + aDefault + healthPenalty(healthByProvider.get(a.key));
    const bScore = bInitial + bDefault + healthPenalty(healthByProvider.get(b.key));

    return aScore - bScore;
  });
}

export function markProviderFailure(
  providerKey: string,
  reason: string,
  previous?: ProviderHealthState,
  now = Date.now()
): ProviderHealthState {
  return {
    providerKey,
    failureCount: (previous?.failureCount ?? 0) + 1,
    lastFailureAt: now,
    lastSuccessAt: previous?.lastSuccessAt,
    lastFailureReason: reason
  };
}

export function markProviderSuccess(
  providerKey: string,
  previous?: ProviderHealthState,
  now = Date.now()
): ProviderHealthState {
  return {
    providerKey,
    failureCount: 0,
    lastFailureAt: previous?.lastFailureAt,
    lastSuccessAt: now,
    lastFailureReason: previous?.lastFailureReason
  };
}
