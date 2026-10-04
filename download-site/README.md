# Download site

APK files live in this folder and deploy to Vercel via GitHub.

## After each new build

1. Copy APKs here: `customer-app.apk`, `seller-app.apk`
2. Run:

```powershell
cd "c:\Users\Oscar Jomer\Documents\WRS Aquabeast\Aquabeast"
git add download-site/customer-app.apk download-site/seller-app.apk download-site/
.\scripts\push-download-site.ps1 "Update APK files"
```

3. Wait ~2 min for Vercel, refresh download page.
