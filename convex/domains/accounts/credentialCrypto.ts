const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function key() {
  const secret = process.env.ANIME_ACCOUNT_ENCRYPTION_KEY;
  if (!secret) throw new Error("Set ANIME_ACCOUNT_ENCRYPTION_KEY in Convex environment variables");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptCredential(value: unknown) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    await key(),
    encoder.encode(JSON.stringify(value))
  );
  return `${btoa(String.fromCharCode(...nonce))}.${btoa(String.fromCharCode(...new Uint8Array(encrypted)))}`;
}

export async function decryptCredential<T>(value: string): Promise<T> {
  const [nonceValue, encryptedValue] = value.split(".");
  if (!nonceValue || !encryptedValue) throw new Error("Stored anime account credential is invalid");
  const nonce = Uint8Array.from(atob(nonceValue), (character) => character.charCodeAt(0));
  const encrypted = Uint8Array.from(atob(encryptedValue), (character) => character.charCodeAt(0));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, await key(), encrypted);
  return JSON.parse(decoder.decode(plain)) as T;
}
