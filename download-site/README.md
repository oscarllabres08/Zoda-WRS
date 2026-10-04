# Download site

Static page for Customer and Seller APK downloads (Vercel).

## Push to GitHub (download-site only)

From the **repo root**, run:

```powershell
.\scripts\push-download-site.ps1
```

With a custom message:

```powershell
.\scripts\push-download-site.ps1 "Update download page"
```

This commits and pushes **only** `download-site/` — other folders (`admin-web`, apps, etc.) are not included in that commit.

## Push the rest of the project (without download-site)

```powershell
.\scripts\push-monorepo.ps1 "Update admin-web and apps"
```

## Notes

- APK files (`*.apk`) are gitignored. Host APKs on Vercel or link to EAS build URLs in `index.html`.
- Do **not** use `git add .` at repo root if you only mean to update this folder — use the script above instead.
