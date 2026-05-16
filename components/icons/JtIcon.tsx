import { View, Text } from 'react-native';

import type { IconName, IconStyle } from './icon-names';

export type { IconName, IconStyle } from './icon-names';
export { ICON_NAMES, ICON_STYLES, ICON_STYLE_LABELS } from './icon-names';

type JtIconProps = {
  name: IconName;
  size?: number;
  styleOverride?: IconStyle;
  className?: string;
};

/**
 * Placeholder JtIcon for the React Native build. The web app renders
 * SVG sprite symbols via `<use href="/icons-{style}.svg#ic-{name}" />`,
 * which RN can't do natively. The real implementation will:
 *   1. bundle the sprite files as assets (expo-asset),
 *   2. parse out the requested `<symbol>` at boot,
 *   3. render via react-native-svg `<SvgXml>` or extracted Svg components.
 *
 * For now this renders the name as a labelled box so layouts can be
 * built against the JtIcon API before the visual implementation lands.
 */
export function JtIcon({ name, size = 22, className }: JtIconProps) {
  return (
    <View
      className={className}
      style={{
        width: size,
        height: size,
        backgroundColor: 'rgba(6, 182, 212, 0.12)',
        borderRadius: 4,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: Math.max(6, size / 4), color: '#0e7490' }}>
        {name}
      </Text>
    </View>
  );
}
