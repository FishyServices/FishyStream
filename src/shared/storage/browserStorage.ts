export function getLocalStorageItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setLocalStorageItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export function getSessionStorageItem(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setSessionStorageItem(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {}
}
