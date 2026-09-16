import { createHash, randomBytes } from "node:crypto";

/**
 * OAuth 2.0 Authorization Code flow with PKCE (RFC 7636).
 *
 * The code verifier never reaches the browser: it is generated here, stored
 * encrypted against a single-use `state` row (OAuthAuthorization), and read
 * back only to exchange the authorization code. The client sees the authorize
 * URL and nothing else, so an intercepted redirect cannot be replayed.
 */

/** RFC 7636 allows 43–128 unreserved characters; 32 random bytes → 43. */
export function createCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

/** S256 challenge — the only method we offer (plain is not accepted). */
export function codeChallengeFor(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function createState(): string {
  return randomBytes(24).toString("base64url");
}

export interface AuthorizeUrlInput {
  authorizeUrl: string;
  clientId: string;
  redirectUri: string;
  scopes: readonly string[];
  state: string;
  codeChallenge: string;
  /** Extra provider-specific params (e.g. `prompt`, `audience`). */
  extra?: Record<string, string>;
}

/** Build the provider's authorize URL. The base URL comes from our own
 *  catalog, never from user input, so this cannot be pointed elsewhere. */
export function buildAuthorizeUrl(input: AuthorizeUrlInput): string {
  const url = new URL(input.authorizeUrl);
  const params = new URLSearchParams({
    response_type: "code",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  });
  if (input.scopes.length > 0) params.set("scope", input.scopes.join(" "));
  for (const [key, value] of Object.entries(input.extra ?? {})) params.set(key, value);
  url.search = params.toString();
  return url.toString();
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

export interface TokenExchangeResult {
  ok: boolean;
  tokens?: TokenResponse;
  error?: string;
  httpStatus?: number;
}

/**
 * Exchange the authorization code for tokens. Confidential clients send the
 * client secret as well as the verifier; public clients send the verifier
 * only. Time-boxed so a hung provider cannot stall the callback.
 */
export async function exchangeCodeForTokens(input: {
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
  timeoutMs?: number;
}): Promise<TokenExchangeResult> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: input.clientId,
    code_verifier: input.codeVerifier,
  });
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  if (input.clientSecret) {
    // Basic auth is the form every provider in the catalog accepts.
    headers.Authorization = `Basic ${Buffer.from(`${input.clientId}:${input.clientSecret}`).toString("base64")}`;
  }
  try {
    const response = await fetch(input.tokenUrl, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(input.timeoutMs ?? 10_000),
    });
    const text = await response.text();
    if (!response.ok) {
      return { ok: false, httpStatus: response.status, error: `Token exchange failed (${response.status})` };
    }
    const tokens = JSON.parse(text) as TokenResponse;
    if (!tokens.access_token) return { ok: false, error: "Token exchange returned no access token" };
    return { ok: true, tokens };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Token exchange failed" };
  }
}

/** Refresh an expiring access token (same client authentication rules). */
export async function refreshAccessToken(input: {
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  refreshToken: string;
  timeoutMs?: number;
}): Promise<TokenExchangeResult> {
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  if (input.clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${input.clientId}:${input.clientSecret}`).toString("base64")}`;
  }
  try {
    const response = await fetch(input.tokenUrl, {
      method: "POST",
      headers,
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: input.refreshToken, client_id: input.clientId }),
      signal: AbortSignal.timeout(input.timeoutMs ?? 10_000),
    });
    if (!response.ok) return { ok: false, httpStatus: response.status, error: `Token refresh failed (${response.status})` };
    const tokens = (await response.json()) as TokenResponse;
    if (!tokens.access_token) return { ok: false, error: "Token refresh returned no access token" };
    return { ok: true, tokens };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Token refresh failed" };
  }
}
