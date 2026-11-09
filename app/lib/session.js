const SESSION_COOKIE = "auth";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export function getSessionSecret() {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV !== "production") {
    return "local-development-only-secret-change-before-deploy";
  }
  throw new Error("AUTH_SECRET must be set to at least 32 characters.");
}

function toBase64Url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function getSigningKey() {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function createSessionToken(userId) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${userId}.${expiresAt}`;
  const signature = await crypto.subtle.sign("HMAC", await getSigningKey(), new TextEncoder().encode(payload));
  return `${payload}.${toBase64Url(signature)}`;
}

export async function verifySessionToken(token) {
  if (typeof token !== "string") return null;
  const [userId, expiration, signature, ...rest] = token.split(".");
  if (!userId || !expiration || !signature || rest.length || !/^[a-f\d]{24}$/i.test(userId)) return null;
  if (!/^\d+$/.test(expiration) || Number(expiration) <= Math.floor(Date.now() / 1000)) return null;
  const valid = await crypto.subtle.verify(
    "HMAC",
    await getSigningKey(),
    fromBase64Url(signature),
    new TextEncoder().encode(`${userId}.${expiration}`)
  );
  return valid ? userId : null;
}

export async function getSessionUserId(request) {
  const cookie = request.headers.get("cookie") || "";
  const token = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  try {
    return await verifySessionToken(token ? decodeURIComponent(token) : null);
  } catch {
    return null;
  }
}

export function setSessionCookie(response, token) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}

export function clearSessionCookie(response) {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
