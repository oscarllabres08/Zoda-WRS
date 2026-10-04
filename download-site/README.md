# Download site

Static page for Customer and Seller APK downloads (Vercel).

## Why APK works locally but not on Vercel

- **Local:** `customer-app.apk` and `seller-app.apk` sit in this folder on your PC.
- **Vercel:** deploys from **GitHub only**. If APKs are not committed, the live site shows *"APK not uploaded yet"*.

## After each EAS build — publish APKs to Vercel

1. Copy the new APKs into this folder:

   ```text
   download-site/customer-app.apk
   download-site/seller-app.apk
   ```

2. Push **download-site only**:

   ```powershell
   cd "c:\Users\Oscar Jomer\Documents\WRS Aquabeast\Aquabeast"
   git add download-site/customer-app.apk download-site/seller-app.apk download-site/
   .\scripts\push-download-site.ps1 "Update APK builds"
   ```

3. Wait for Vercel to redeploy (1–2 minutes), then refresh the download page.

Each APK is ~90 MB. GitHub allows files under 100 MB.

## Alternative: Supabase Storage (optional)

To avoid large files in git, upload APKs to Supabase Dashboard → Storage → `wrs-assets` → folder `apks/`, then set public URLs in `js/config.js`:

```javascript
window.ZODA_DOWNLOAD_CFG = {
  customerApkUrl: 'https://nigvimeeqglqvgvtnbfy.supabase.co/storage/v1/object/public/wrs-assets/apks/customer-app.apk',
  sellerApkUrl: 'https://nigvimeeqglqvgvtnbfy.supabase.co/storage/v1/object/public/wrs-assets/apks/seller-app.apk',
};
```

Commit and push `js/config.js` only (no APK in git).

## Push commands

| Goal | Command |
|------|---------|
| Download site only | `.\scripts\push-download-site.ps1 "message"` |
| Rest of project (no download-site) | `.\scripts\push-monorepo.ps1 "message"` |

Do **not** use `git add .` at repo root when you only mean to update this folder.
