/** @type {import('@expo/env').loadEnvFiles} */
const { load: loadEnv } = require('@expo/env');

loadEnv(process.cwd());

const base = require('./app.json');

// Baked at build time for EAS (see eas.json env) and local .env for dev.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';

module.exports = () => ({
  expo: {
    ...base.expo,
    extra: {
      ...base.expo.extra,
      supabaseUrl,
      supabaseAnonKey,
    },
  },
});
