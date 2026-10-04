# Push admin-web, apps, supabase, etc. WITHOUT download-site/.
# Usage (from repo root):
#   .\scripts\push-monorepo.ps1
#   .\scripts\push-monorepo.ps1 "Update admin-web and mobile apps"

param(
  [string]$Message = "Update project"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

$branch = git rev-parse --abbrev-ref HEAD
if ($LASTEXITCODE -ne 0) { throw "Not a git repository." }

git add -A
git reset HEAD download-site/

$staged = git diff --cached --name-only
if (-not $staged) {
  Write-Host "No changes outside download-site/ to commit." -ForegroundColor Yellow
  exit 0
}

Write-Host "Staging everything except download-site/:" -ForegroundColor Cyan
$staged | ForEach-Object { Write-Host "  $_" }

git commit -m $Message
if ($LASTEXITCODE -ne 0) { throw "Commit failed." }

git push origin $branch
if ($LASTEXITCODE -ne 0) { throw "Push failed." }

Write-Host "Done. download-site/ was NOT included in this push." -ForegroundColor Green
