import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';

import { supabase } from './supabase/client';

// Required so the auth tab closes itself cleanly after the OAuth round-trip.
WebBrowser.maybeCompleteAuthSession();

/**
 * Kick off Google OAuth via Supabase. The provider returns a URL, we
 * open it in the in-app browser, Supabase redirects back to our scheme,
 * and we hand the resulting tokens back to `supabase.auth.setSession`.
 *
 * Expects the Supabase project to have Google enabled in
 * Authentication → Providers with `jaitang://` listed as an allowed
 * redirect URL.
 */
export async function signInWithGoogle() {
  const redirectTo = makeRedirectUri({ scheme: 'jaitang', path: 'auth-callback' });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      // Bypass Supabase's own redirect page — we hand the user straight
      // to Google.
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;
  if (!data.url) throw new Error('Supabase did not return an OAuth URL');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') {
    return { ok: false as const, reason: result.type };
  }

  // Supabase encodes the access + refresh tokens in the URL fragment
  // (`#access_token=…&refresh_token=…`). expo-auth-session normalizes
  // the fragment into `params` for us.
  const url = new URL(result.url);
  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  const params = new URLSearchParams(hash);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) {
    return { ok: false as const, reason: 'no-tokens' };
  }

  const { error: sessErr } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });
  if (sessErr) throw sessErr;
  return { ok: true as const };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Email + password sign-in. Used by the dev-only quick sign-in path on
 * the login screen so we can skip the Google OAuth round-trip during
 * iteration. The Supabase session this returns is identical to the one
 * the OAuth flow produces — RLS works, sync engine works.
 */
export async function signInWithEmail(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}
