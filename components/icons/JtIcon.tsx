import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import type { IconName, IconStyle } from './icon-names';
import { useIconStyle } from './IconStyleContext';
import { getCachedIconXml, getIconXml } from './sprite';

export type { IconName, IconStyle } from './icon-names';
export { ICON_NAMES, ICON_STYLES, ICON_STYLE_LABELS } from './icon-names';

type JtIconProps = {
  name: IconName;
  size?: number;
  /** Override the active sprite style for this render (preview buttons, etc.). */
  styleOverride?: IconStyle;
  /** RN-style override; not commonly needed since size handles dimensions. */
  className?: string;
};

/**
 * Renders an icon from one of the bundled SVG sprites via
 * `react-native-svg`. The sprite for the active style is loaded the
 * first time any icon is asked for, then cached in memory for the rest
 * of the session — keeps startup cheap (~300–600 KB of parse on demand)
 * and renders subsequent icons synchronously.
 */
export function JtIcon({ name, size = 22, styleOverride }: JtIconProps) {
  const activeStyle = useIconStyle();
  const style = styleOverride ?? activeStyle;
  const [xml, setXml] = useState<string | null>(() => getCachedIconXml(style, name));

  useEffect(() => {
    const cached = getCachedIconXml(style, name);
    if (cached) {
      setXml(cached);
      return;
    }
    let mounted = true;
    getIconXml(style, name)
      .then((next) => {
        if (mounted) setXml(next);
      })
      .catch(() => {
        // Swallow: missing icon renders as an empty box.
      });
    return () => {
      mounted = false;
    };
  }, [name, style]);

  if (!xml) {
    // Reserve the layout box while the sprite is still loading so the
    // surrounding flexbox doesn't reflow on first paint.
    return <View style={{ width: size, height: size }} />;
  }
  return <SvgXml xml={xml} width={size} height={size} />;
}
