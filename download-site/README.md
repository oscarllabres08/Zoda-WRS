# Download site

APK files live in this folder and deploy to Vercel via GitHub.

## Seller app PIN

The Seller APK is PIN-protected. The PIN is **not** stored in this repo — set it in **Admin → Settings → Seller app download PIN**.

Edit `js/config.js` before deploy (Supabase URL + anon key only):

```js
window.ZODA_DOWNLOAD_CFG = {
  customerApkUrl: '',
  sellerApkUrl: '',
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR_ANON_KEY',
};
```

Run `supabase/patches/seller-download-pin.sql` in Supabase SQL Editor once.

## After each new build

1. Copy APKs here: `customer-app.apk`, `seller-app.apk`
2. Run:

```powershell
cd "c:\Users\Oscar Jomer\Documents\WRS Aquabeast\Aquabeast"
git add download-site/customer-app.apk download-site/seller-app.apk download-site/
.\scripts\push-download-site.ps1 "Update APK files"
```

3. Wait ~2 min for Vercel, refresh download page.
