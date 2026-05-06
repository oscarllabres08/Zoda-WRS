## Supabase Edge Functions (Push Notifications)

This repo includes an Edge Function that sends **real Android push notifications** (FCM) even when the app is closed/killed.

### 1) Deploy the function

From the repo root:

```bash
supabase functions deploy push-notify
```

Kapag nag-edit ka ng `supabase/functions/push-notify/index.ts`, kailangan mo ulit **`deploy`** bago lumabas ang bagong behavior/logs sa Dashboard.

### 2) Set Edge Function secrets

In Supabase Dashboard:

- **`PUSH_WEBHOOK_SECRET`**: any strong secret string
- **`FCM_PROJECT_ID`**: your Firebase project id (example: `aquabeast-wrs`)
- **`FCM_SERVICE_ACCOUNT_JSON`**: paste your Firebase service account JSON (as one line)
- **`SB_URL`**: your Supabase project URL
- **`SB_SERVICE_ROLE_KEY`**: service role key (kept secret)

### 3) Configure DB settings (required for automatic sending)

> **Note:** `push_function_jwt` ay naka-store sa **`public.system_settings` (database)**, hindi sa Edge Function Secrets list — tama ang nakalagay doon kahit hindi lumalabas sa screenshot ng Secrets UI.

In the `system_settings` table, set:

- `push_webhook_url` = `https://<project-ref>.supabase.co/functions/v1/push-notify`
- `push_webhook_secret` = same value as `PUSH_WEBHOOK_SECRET`
- **`push_function_jwt`** = your Supabase **anon** JWT only (Dashboard → Settings → API → `anon` `public` key — the long string starting with `eyJ...`; do **not** include the word `Bearer`). The DB trigger sends `Authorization: Bearer <this>` because the Edge Functions gateway rejects requests without it.

Existing projects without this row:

```sql
insert into public.system_settings (key, value)
values ('push_function_jwt', 'CONFIGURE_PROJECT_ANON_JWT')
on conflict (key) do nothing;
```

Then `update … set value = '<anon_jwt>' where key = 'push_function_jwt'`.

Once set, every `INSERT` into `public.notifications` will trigger a push (fire-and-forget).

### Notes

- Tokens are read from `public.push_tokens` for the **recipient** user, filtered to `platform='android'` (works for both `app='seller'` and `app='customer'` rows).
- Your app already defines Android channels in `seller-app/app/_layout.tsx`. FCM sends to `channel_id: "default"` so it matches your custom sound setup.

### Quick sanity test (script)

From the repo root (set env vars first — see script header):

```bash
node supabase/scripts/test-push-notify.mjs
```

### Walang lumalabas na push sa APK (troubleshooting)

1. **Database pa rin ba ang default?** Sa Supabase SQL Editor, tingnan:
   `select key, value from public.system_settings where key like 'push_%' or key = 'push_function_jwt';`  
   Kung `push_webhook_url` ay `CONFIGURE_HTTPS_ENDPOINT` o walang secret, **hindi tatakbo ang FCM** — i-set ang totoong function URL at secret (see step 3 sa taas).

2. **Naka-deploy ba ang Edge Function at may secrets?** Sa Dashboard → Edge Functions → `push-notify` → dapat naka-set ang `FCM_SERVICE_ACCOUNT_JSON`, `FCM_PROJECT_ID`, `PUSH_WEBHOOK_SECRET`, `SB_URL`, `SB_SERVICE_ROLE_KEY`.

3. **pg_net** — Dapat naka-enable ang extension `pg_net` sa project (kasama sa `schema.sql`). Kung hindi, `net.http_post` ay hindi gagana.

4. **Telepono** — Payagan ang notifications para sa app; sa Android 13+ kailangan ang **POST_NOTIFICATIONS** (idinagdag na sa `app.json`). Pagkatapos mag-install, buksan muli ang app pagkatapos mag-login para ma-save ang FCM token sa `push_tokens`.

5. **401 `UNAUTHORIZED_NO_AUTH_HEADER`** — Dapat may `Authorization: Bearer` kapag tinatawag ang Edge Function. Ang DB trigger ay nagdadagdag na nito kung na-set na ang `push_function_jwt`. Ang test script ay gumagamit ng `SUPABASE_SERVICE_ROLE_KEY` bilang Bearer.

6. **Tingnan ang token** — `select * from public.push_tokens where platform = 'android';` Dapat may row pagkatapos mag-login sa tunay na device.

