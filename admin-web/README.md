# Zoda WRS Admin Website

Web dashboard for the **store owner (master admin)**. Uses the same Supabase project as `seller-app` and `customer-app`:

- **Products / inventory** → customer catalog & POS
- **Orders & sales** → realtime with mobile apps
- **Staff approvals** → seller app login for staff

## Setup

1. Copy `admin-web/.env.local.example` → `admin-web/.env.local`
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (same values as seller/customer env).
3. Run:

```bash
cd admin-web
npm install
npm run dev
```

Open http://localhost:5174 — sign in with your **owner** account (first registered seller becomes owner automatically).

Staff accounts cannot use the admin site; they sign in on the Seller mobile app after approval here.
