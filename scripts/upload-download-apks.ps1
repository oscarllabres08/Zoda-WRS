# DEPRECATED: Supabase free tier max upload is 50 MB; our APKs are ~93 MB.
# Use EAS build URLs in download-site/js/config.js instead (see download-site/README.md).

Write-Host "Supabase Storage cannot host these APKs on the free plan (50 MB limit)." -ForegroundColor Yellow
Write-Host ""
Write-Host "Use EAS instead:" -ForegroundColor Cyan
Write-Host "  1. expo.dev → Builds → copy Application archive URL"
Write-Host "  2. Paste URLs into download-site/js/config.js"
Write-Host "  3. .\scripts\push-download-site.ps1 `"Update APK links`""
exit 1
