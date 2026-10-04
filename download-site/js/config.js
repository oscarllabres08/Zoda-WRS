/**
 * Optional: host APKs on Supabase Storage instead of git (recommended for large files).
 * Leave empty to use customer-app.apk / seller-app.apk next to index.html.
 *
 * Example after upload to bucket wrs-assets/apks/:
 * customerApkUrl: 'https://YOUR_PROJECT.supabase.co/storage/v1/object/public/wrs-assets/apks/customer-app.apk',
 */
window.ZODA_DOWNLOAD_CFG = {
  customerApkUrl: '',
  sellerApkUrl: '',
};
