# Push ONLY download-site/ to GitHub (other folders stay unchanged on this commit).
# Usage (from repo root):
#   .\scripts\push-download-site.ps1
#   .\scripts\push-download-site.ps1 "Update APK links"

param(
  [string]$Message = "Update download site"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

$branch = git rev-parse --abbrev-ref HEAD
if ($LASTEXITCODE -ne 0) { throw "Not a git repository." }

git add download-site/
$staged = git diff --cached --name-only
if (-not $staged) {
  Write-Host "No changes inside download-site/ to commit." -ForegroundColor Yellow
  exit 0
}

Write-Host "Staging download-site only:" -ForegroundColor Cyan
$staged | ForEach-Object { Write-Host "  $_" }

git commit -m $Message
if ($LASTEXITCODE -ne 0) { throw "Commit failed." }

git push origin $branch
if ($LASTEXITCODE -ne 0) { throw "Push failed." }

Write-Host "Done. Only download-site/ was updated on GitHub." -ForegroundColor Green
