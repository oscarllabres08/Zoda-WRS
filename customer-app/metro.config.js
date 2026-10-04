const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/** Bust stale Windows cache entries that break SSR with "dependencies is not iterable". */
config.cacheVersion = 'customer-v3';

module.exports = config;
