export const PASSWORD_ITERATIONS = 600000;
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const encoder = new TextEncoder();

export function normalizeUsername(value) {
  if (typeof value !== "string") return null;
  const username = value.trim().toLowerCase();
  return /^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])$/.test(username) ? username : null;
}

export function validateAccountRegistration(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "A JSON account body is required.";
  if (!normalizeUsername(body.username)) return "Use a 3–32 character username with letters, numbers, dots, underscores, or hyphens.";
  if (typeof body.password !== "string" || body.password.length < 12 || body.password.length > 128 ||
      encoder.encode(body.password).length > 512) {
    return "Use a password between 12 and 128 characters.";
  }
  if (typeof body.display_name !== "string" || body.display_name.trim().length < 2 || body.display_name.trim().length > 40) {
    return "Use a display name between 2 and 40 characters.";
  }
  if (body.role !== "mentor" && body.role !== "mentee") return "Choose mentor or mentee.";
  return null;
}

export function validateLoginCredentials(body) {
  return Boolean(body && typeof body === "object" && !Array.isArray(body) &&
    normalizeUsername(body.username) &&
    typeof body.password === "string" &&
    body.password.length > 0 &&
    body.password.length <= 128 &&
    encoder.encode(body.password).length <= 512);
}

export function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function hashPassword(password, salt, iterations = PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    salt,
    iterations,
    hash: "SHA-256",
  }, key, 256);
  return base64UrlEncode(new Uint8Array(bits));
}

export async function verifyPassword(password, salt, expectedHash, iterations) {
  if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000) return false;
  let expected;
  try {
    expected = base64UrlDecode(expectedHash);
  } catch (_) {
    return false;
  }
  if (expected.length !== 32) return false;

  const actual = base64UrlDecode(await hashPassword(password, salt, iterations));
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= expected[index] ^ actual[index];
  return difference === 0;
}

export async function hashSessionToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return base64UrlEncode(new Uint8Array(digest));
}
