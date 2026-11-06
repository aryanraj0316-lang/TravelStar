const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// Server source, test databases and release-tool caches are not mobile modules.
const backendPath = path.resolve(__dirname, 'backend') + path.sep;
const escapeRegex = value => value.replace(/[.*+?^${}()|[]\\]/g, '\\$&');
const existing = config.resolver.blockList;
config.resolver.blockList = [ ...(Array.isArray(existing) ? existing : existing ? [existing] : []), new RegExp('^' + escapeRegex(backendPath)) ];
module.exports = config;
