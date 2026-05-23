import { Asset } from 'expo-asset';

import type { IconName, IconStyle } from './icon-names';

// Each style points at one of the SVG files copied from the web app.
// Metro will hash + bundle them; expo-asset gives us a downloadable URI
// for `fetch()`.
const SPRITE_MODULES: Record<IconStyle, number> = {
  sticker: require('../../assets/icons/icons-sticker.svg'),
  doodle: require('../../assets/icons/icons-doodle.svg'),
  watercolor: require('../../assets/icons/icons-watercolor.svg'),
  geometric: require('../../assets/icons/icons-geometric.svg'),
  pixel: require('../../assets/icons/icons-pixel.svg'),
};

// Per-style cache of name → standalone-svg string. Populated the first
// time any icon from that style is rendered.
const cache = new Map<IconStyle, Map<string, string>>();
const inflight = new Map<IconStyle, Promise<Map<string, string>>>();

const SYMBOL_RE = /<symbol\s+id="ic-([a-z0-9-]+)"([^>]*)>([\s\S]*?)<\/symbol>/g;

async function loadSprite(style: IconStyle): Promise<Map<string, string>> {
  const cached = cache.get(style);
  if (cached) return cached;
  const pending = inflight.get(style);
  if (pending) return pending;

  const job = (async () => {
    const asset = Asset.fromModule(SPRITE_MODULES[style]);
    await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    const res = await fetch(uri);
    const text = await res.text();
    const map = new Map<string, string>();
    let m: RegExpExecArray | null;
    while ((m = SYMBOL_RE.exec(text)) !== null) {
      const [, name, attrs, inner] = m;
      // Wrap each symbol's inner content in a standalone <svg> so
      // react-native-svg's SvgXml can render it on its own. Pull the
      // viewBox off the symbol if it set one; default 48×48 matches
      // every Jaitang sprite.
      const viewBoxMatch = attrs.match(/viewBox="([^"]+)"/);
      const viewBox = viewBoxMatch?.[1] ?? '0 0 48 48';
      map.set(
        name,
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${inner}</svg>`,
      );
    }
    cache.set(style, map);
    inflight.delete(style);
    return map;
  })();

  inflight.set(style, job);
  return job;
}

export async function getIconXml(
  style: IconStyle,
  name: IconName,
): Promise<string | null> {
  const map = await loadSprite(style);
  return map.get(name) ?? null;
}

/**
 * Sync lookup if the sprite is already cached; otherwise null and the
 * caller should kick off `getIconXml()`. Lets the component render an
 * empty box on first paint and the real icon on the next tick.
 */
export function getCachedIconXml(
  style: IconStyle,
  name: IconName,
): string | null {
  return cache.get(style)?.get(name) ?? null;
}
