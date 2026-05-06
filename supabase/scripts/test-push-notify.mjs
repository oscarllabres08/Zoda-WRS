#!/usr/bin/env node
/**
 * Sanity test for push notifications (FCM via Edge Function `push-notify`).
 *
 * Prerequisites:
 * - Deployed Edge Function `push-notify` with secrets set (FCM_*, PUSH_WEBHOOK_SECRET, SB_*)
 * - `system_settings.push_webhook_url` + `push_webhook_secret` if you want the DB-trigger path
 * - Recipient must have logged in on a **real Android device** once so `push_tokens` has a row
 *
 * Windows PowerShell (example):
 *   $env:SUPABASE_URL="https://xxxxx.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="<service_role_key>"
 *   $env:PUSH_WEBHOOK_SECRET="<same as Dashboard secret>"
 *   $env:RECIPIENT_USER_ID="<auth user uuid>"
 *   node supabase/scripts/test-push-notify.mjs
 *
 * Or with Node 20+ and a local file (do not commit secrets):
 *   node --env-file=supabase/.env supabase/scripts/test-push-notify.mjs
 *
 * Flags:
 *   --direct-only       Only POST to the Edge Function (skips INSERT / trigger path)
 *   --trigger-only      Only INSERT a notifications row (skips direct POST)
 */
/* eslint-disable no-console */

const args = process.argv.slice(2);
const DIRECT_ONLY = args.includes("--direct-only");
const TRIGGER_ONLY = args.includes("--trigger-only");

function requireEnv(name) {
  const v = process.env[name];
  if (!v?.trim()) {
    console.error(`Missing env: ${name}`);
    process.exit(1);
  }
  return v.trim();
}

async function restGetTokens(supabaseUrl, serviceRoleKey, recipientId) {
  const url = new URL("/rest/v1/push_tokens", supabaseUrl);
  url.searchParams.set("select", "token,app,platform,updated_at");
  url.searchParams.set("user_id", `eq.${recipientId}`);
  url.searchParams.set("order", "updated_at.desc");
  const res = await fetch(url.toString(), {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    console.error("push_tokens query failed:", res.status, data);
    process.exit(1);
  }
  return Array.isArray(data) ? data : [];
}

async function postPushNotify(functionUrl, secret, supabaseJwt, body) {
  // Supabase Edge Functions require a Supabase JWT on this header (anon or service_role).
  const res = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-webhook-secret": secret,
      authorization: `Bearer ${supabaseJwt}`,
      apikey: supabaseJwt,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text().catch(() => "");
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data, text };
}

async function insertNotificationRow(supabaseUrl, serviceRoleKey, row) {
  const res = await fetch(`${supabaseUrl}/rest/v1/notifications`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  // IMPORTANT: Pass env *names* — never paste secrets inside requireEnv('...').
  const supabaseUrl = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const secret = requireEnv("PUSH_WEBHOOK_SECRET");
  const recipientId = requireEnv("RECIPIENT_USER_ID");

  const functionUrl =
    process.env.PUSH_NOTIFY_URL?.trim() ||
    `${supabaseUrl}/functions/v1/push-notify`;

  console.log("— Step 0: config");
  console.log("  SUPABASE_URL:", supabaseUrl);
  console.log("  PUSH_NOTIFY_URL:", functionUrl);
  console.log("  RECIPIENT_USER_ID:", recipientId);

  console.log("\n— Step 1: push_tokens for recipient (service role)");
  const tokens = await restGetTokens(supabaseUrl, serviceRoleKey, recipientId);
  const android = tokens.filter((t) => (t.platform || "").toLowerCase() === "android");
  console.log(`  rows: ${tokens.length} (android: ${android.length})`);
  if (tokens.length) {
    for (const t of tokens.slice(0, 8)) {
      const tok = String(t.token || "");
      const preview = tok.length > 18 ? `${tok.slice(0, 10)}…${tok.slice(-6)}` : tok;
      console.log(`    - app=${t.app} platform=${t.platform} token=${preview}`);
    }
    if (tokens.length > 8) console.log(`    … ${tokens.length - 8} more`);
  } else {
    console.warn(
      "  WARN: No tokens. Open the app on a real Android device, log in, allow notifications, then re-run."
    );
  }

  if (!TRIGGER_ONLY) {
    console.log("\n— Step 2: direct POST → Edge Function (same shape as DB trigger)");
    const payload = {
      notification_id: "00000000-0000-0000-0000-000000000000",
      recipient_id: recipientId,
      order_id: null,
      kind: "test_push_direct",
      title: "Push test (direct)",
      body: "If you see this on device, FCM + Edge Function are OK.",
      data: { source: "test-push-notify.mjs", path: "direct" },
    };
    const r = await postPushNotify(functionUrl, secret, serviceRoleKey, payload);
    console.log("  HTTP", r.status, r.ok ? "OK" : "FAIL");
    console.log("  response:", r.data ? JSON.stringify(r.data, null, 2) : "(non-JSON / empty body)");
    if (!r.data && r.text) console.log("  raw:", r.text.slice(0, 1200));
    if (!r.ok) process.exit(1);
  }

  if (!DIRECT_ONLY) {
    console.log("\n— Step 3: INSERT notifications row (fires trigger → pg_net → Edge Function)");
    const row = {
      recipient_id: recipientId,
      order_id: null,
      kind: "test_push_trigger",
      title: "Push test (DB trigger)",
      body: "If you see this on device, system_settings + pg_net + trigger are OK.",
      data: { source: "test-push-notify.mjs", path: "db_trigger" },
    };
    const ins = await insertNotificationRow(supabaseUrl, serviceRoleKey, row);
    console.log("  HTTP", ins.status, ins.ok ? "OK" : "FAIL");
    console.log("  response:", JSON.stringify(ins.data, null, 2));
    if (!ins.ok) process.exit(1);
    console.log(
      "\n  Note: trigger is fire-and-forget. If no push, check SQL:\n" +
        "    select key, value from public.system_settings where key like 'push_%';"
    );
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
