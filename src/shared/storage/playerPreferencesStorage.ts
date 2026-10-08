import { getLocalStorageItem, setLocalStorageItem } from "./browserStorage";

const VOLUME_BOOST_KEY = "fishystream:player:volume-boost";
const MIN_VOLUME_BOOST = 1;
const MAX_VOLUME_BOOST = 3;

export function readPlayerVolumeBoost(): number {
  const stored = getLocalStorageItem(VOLUME_BOOST_KEY);
  if (stored === null) return MIN_VOLUME_BOOST;

  const value = Number(stored);
  return Number.isFinite(value) && value >= MIN_VOLUME_BOOST && value <= MAX_VOLUME_BOOST
    ? value
    : MIN_VOLUME_BOOST;
}

export function savePlayerVolumeBoost(boost: number): void {
  const value = Math.min(MAX_VOLUME_BOOST, Math.max(MIN_VOLUME_BOOST, boost));
  setLocalStorageItem(VOLUME_BOOST_KEY, String(value));
}
