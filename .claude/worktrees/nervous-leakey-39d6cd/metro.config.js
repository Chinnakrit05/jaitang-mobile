const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// We treat the sprite .svg files in assets/icons/ as plain text assets
// fetched at runtime via expo-asset (see components/icons/sprite.ts) —
// NOT as React components. Adding "svg" to assetExts is enough; the
// default sourceExts list doesn't include "svg" either, so there's no
// transformer competing for the files.
config.resolver.assetExts.push('svg');

module.exports = withNativeWind(config, { input: './global.css' });
