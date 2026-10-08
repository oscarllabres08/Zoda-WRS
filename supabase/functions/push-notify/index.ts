// Supabase Edge Function: push-notify
// Sends real FCM push notifications to Android device tokens stored in `push_tokens`.
//
// Env vars required:
// - SB_URL  (Supabase project URL)
// - SB_SERVICE_ROLE_KEY  (Supabase service role key)
// - PUSH_WEBHOOK_SECRET (must match `system_settings.push_webhook_secret`)
// - FCM_SERVICE_ACCOUNT_JSON  (Firebase service account JSON string)
// - FCM_PROJECT_ID            (Firebase project id, e.g. "aquabeast-wrs")
//
// Deploy:
//   supabase functions deploy push-notify
//
// Then set system_settings.push_webhook_url to:
//   https://<project-ref>.supabase.co/functions/v1/push-notify

type WebhookPayload = {
  notification_id?: string;
  recipient_id?: string;
  order_id?: string | null;
  kind?: string | null;
  title?: string | null;
  body?: string | null;
  data?: Record<string, unknown> | null;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function getEnvAny(names: string[]) {
  for (const n of names) {
    const v = Deno.env.get(n);
    if (v) return v;
  }
  throw new Error(`Missing env (any of): ${names.join(", ")}`);
}

function base64UrlEncode(input: string | Uint8Array) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  // Avoid spread on huge arrays (stack overflow in `String.fromCharCode(...bytes)`).
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  let b64 = btoa(binary);
  b64 = b64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  return b64;
}

async function signJwtRs256(privateKeyPem: string, header: Record<string, unknown>, payload: Record<string, unknown>) {
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const data = `${headerB64}.${payloadB64}`;

  const pemBody = privateKeyPem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replaceAll("\n", "")
    .trim();
  const pkDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pkDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(data));
  const sigB64 = base64UrlEncode(new Uint8Array(sig));
  return `${data}.${sigB64}`;
}

async function getGoogleAccessTokenFromServiceAccount(serviceAccountJson: string) {
  let sa: { client_email: string; private_key: string; token_uri?: string };
  try {
    sa = JSON.parse(serviceAccountJson) as {
      client_email: string;
      private_key: string;
      token_uri?: string;
    };
  } catch {
    throw new Error("FCM_SERVICE_ACCOUNT_JSON is not valid JSON (re-paste the service account JSON as one line in Secrets)");
  }
  if (!sa.client_email || !sa.private_key) {
    throw new Error("FCM_SERVICE_ACCOUNT_JSON missing client_email or private_key");
  }
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = sa.token_uri ?? "https://oauth2.googleapis.com/token";

  const jwt = await signJwtRs256(
    sa.private_key,
    { alg: "RS256", typ: "JWT" },
    {
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: tokenUri,
      iat: now,
      exp: now + 60 * 60,
    },
  );

  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OAuth token error: ${res.status} ${JSON.stringify(body)}`);
  return String((body as any).access_token ?? "");
}

const FCM_CHANNEL_SOUND = "wrs_alerts_v3";
const FCM_CHANNEL_SILENT = "wrs_silent_v1";
const FCM_SOUND_RAW = "notification";

async function supabaseSelectProfileNotifPrefs(recipientId: string) {
  const supabaseUrl = getEnvAny(["SB_URL", "SUPABASE_URL"]);
  const serviceKey = getEnvAny(["SB_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);

  const url = new URL("/rest/v1/profiles", supabaseUrl);
  url.searchParams.set("select", "notifications_enabled,notification_sound_enabled");
  url.searchParams.set("user_id", `eq.${recipientId}`);
  url.searchParams.set("limit", "1");

  const res = await fetch(url.toString(), {
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
    },
  });
  const data = await res.json().catch(() => []);
  if (!res.ok || !Array.isArray(data) || !data.length) {
    return { notificationsEnabled: true, soundEnabled: true };
  }
  const row = data[0] as { notifications_enabled?: boolean | null; notification_sound_enabled?: boolean | null };
  return {
    notificationsEnabled: row.notifications_enabled ?? true,
    soundEnabled: row.notification_sound_enabled ?? true,
  };
}

async function supabaseSelectPushTokens(recipientId: string) {
  // Supabase reserves env names that start with SUPABASE_, so we prefer SB_*.
  const supabaseUrl = getEnvAny(["SB_URL", "SUPABASE_URL"]);
  const serviceKey = getEnvAny(["SB_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);

  const url = new URL("/rest/v1/push_tokens", supabaseUrl);
  url.searchParams.set("select", "token,platform,app");
  url.searchParams.set("user_id", `eq.${recipientId}`);
  url.searchParams.set("platform", "eq.android");
  url.searchParams.set("limit", "50");

  const res = await fetch(url.toString(), {
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
    },
  });
  const data = await res.json().catch(() => []);
  if (!res.ok) throw new Error(`Supabase tokens query failed: ${res.status} ${JSON.stringify(data)}`);
  return (Array.isArray(data) ? data : []) as { token: string; platform: string; app: string }[];
}

function inferTargetApp(payload: WebhookPayload): "seller" | "customer" | null {
  const raw = payload?.data && typeof payload.data === "object" ? (payload.data as Record<string, unknown>) : null;
  const explicit = raw?.app;
  if (explicit === "seller" || explicit === "customer") return explicit;

  const kind = String(payload?.kind ?? "");
  if (
    kind === "new_order" ||
    kind === "seller_registration_pending" ||
    kind === "order_activity" ||
    kind === "pending_order_reminder"
  ) {
    return "seller";
  }
  if (kind === "order_status" || kind === "seller_reminder" || kind === "loyalty_points") return "customer";
  return null;
}

async function sendFcmMessage({
  fcmProjectId,
  accessToken,
  deviceToken,
  title,
  body,
  data,
  soundEnabled,
}: {
  fcmProjectId: string;
  accessToken: string;
  deviceToken: string;
  title: string;
  body: string;
  data: Record<string, string>;
  soundEnabled: boolean;
}) {
  const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(fcmProjectId)}/messages:send`;
  const channelId = soundEnabled ? FCM_CHANNEL_SOUND : FCM_CHANNEL_SILENT;
  const androidNotification: Record<string, string> = {
    channel_id: channelId,
  };
  if (soundEnabled) {
    androidNotification.sound = FCM_SOUND_RAW;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      message: {
        token: deviceToken,
        notification: { title, body },
        data,
        android: {
          priority: "HIGH",
          ttl: "86400s",
          direct_boot_ok: true,
          notification: {
            ...androidNotification,
            title,
            body,
            notification_priority: "PRIORITY_MAX",
            visibility: "PUBLIC",
            default_vibrate_timings: true,
            default_sound: soundEnabled,
          },
        },
      },
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`FCM send failed: ${res.status} ${JSON.stringify(out)}`);
  return out;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const expectedSecret = getEnv("PUSH_WEBHOOK_SECRET");
    const gotSecret = req.headers.get("x-webhook-secret") ?? "";
    if (!gotSecret || gotSecret !== expectedSecret) return json({ ok: false, error: "Unauthorized" }, 401);

    const payload = (await req.json().catch(() => null)) as WebhookPayload | null;
    const recipientId = String(payload?.recipient_id ?? "");
    if (!recipientId) return json({ ok: false, error: "Missing recipient_id" }, 400);

    const title = String(payload?.title ?? "Notification");
    const body = String(payload?.body ?? "");
    const kind = String(payload?.kind ?? "");
    const orderId = payload?.order_id ? String(payload.order_id) : "";

    const targetApp = payload ? inferTargetApp(payload) : null;
    if (!targetApp) {
      return json({ ok: true, skipped: true, reason: "missing_target_app", kind });
    }

    const tokensAll = await supabaseSelectPushTokens(recipientId);
    const tokens = tokensAll.filter((t) => t.app === targetApp);
    if (!tokens.length) return json({ ok: true, skipped: true, reason: "no_android_tokens" });

    const fcmProjectId = getEnv("FCM_PROJECT_ID");
    const saJson = getEnv("FCM_SERVICE_ACCOUNT_JSON");
    const accessToken = await getGoogleAccessTokenFromServiceAccount(saJson);
    const notifPrefs = await supabaseSelectProfileNotifPrefs(recipientId);
    const soundEnabled = notifPrefs.notificationsEnabled && notifPrefs.soundEnabled;

    const data: Record<string, string> = {
      recipientId,
      notificationId: String(payload?.notification_id ?? ""),
      kind,
      orderId,
      app: targetApp,
    };
    const extra = payload?.data && typeof payload.data === "object" ? payload.data : {};
    for (const [k, v] of Object.entries(extra ?? {})) {
      if (v === null || v === undefined) continue;
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") data[k] = String(v);
    }

    const results: Array<{ token: string; ok: boolean; error?: string }> = [];
    for (const t of tokens) {
      try {
        await sendFcmMessage({
          fcmProjectId,
          accessToken,
          deviceToken: t.token,
          title,
          body,
          data,
          soundEnabled,
        });
        results.push({ token: t.token, ok: true });
      } catch (e) {
        results.push({ token: t.token, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }

    return json({ ok: true, sent: results.filter((r) => r.ok).length, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[push-notify]", msg);
    return json({ ok: false, error: msg }, 500);
  }
});

