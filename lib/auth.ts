export const AUTH_COOKIE_NAME = "llamarole_auth";

const SESSION_VALUE = "authenticated";

export function isPasswordProtectionEnabled() {
  return getAppPassword().length > 0;
}

export function getAppPassword() {
  return process.env.LLAMAROLE_PASSWORD?.trim() ?? "";
}

export function shouldUseSecureCookies() {
  return process.env.LLAMAROLE_SECURE_COOKIES === "true";
}

export async function createAuthToken() {
  const signature = await signValue(SESSION_VALUE);

  return `${SESSION_VALUE}.${signature}`;
}

export async function isValidAuthToken(token?: string | null) {
  if (!isPasswordProtectionEnabled() || !token) {
    return !isPasswordProtectionEnabled();
  }

  const [value, signature] = token.split(".");

  if (value !== SESSION_VALUE || !signature) {
    return false;
  }

  return signature === (await signValue(value));
}

async function signValue(value: string) {
  const secret = process.env.LLAMAROLE_AUTH_SECRET?.trim() || getAppPassword();
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));

  return base64UrlEncode(signature);
}

function base64UrlEncode(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
