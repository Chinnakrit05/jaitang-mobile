import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { useTheme } from '../providers/ThemeProvider';
import { JtIcon } from './icons/JtIcon';
import type { IconName } from './icons/icon-names';

/**
 * Custom bottom tab bar matching the `ui/Dashboard.html` design
 * (variation v2-playful). Five slots, with the third one rendered as a
 * floating action button that pops above the bar — the quick-add path.
 *
 * Icons render through `JtIcon` so they pick up the active icon-style
 * sprite (sticker / doodle / watercolor / geometric / pixel) — switching
 * style in Settings re-skins the whole nav. JtIcon has baked-in colors
 * per style so the active/inactive distinction lives in the label color
 * + the FAB's accent background, not in tinting the icons themselves.
 *
 * Surfaces (bar background, border, accent) come from `useTheme()` so
 * the bar tracks light / dark / OLED modes.
 */

type NavItem = {
  route: string;
  label: string;
  icon: IconName;
  iconSize?: number;
  fab?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { route: 'dashboard', label: 'หน้าหลัก', icon: 'home' },
  { route: 'transactions', label: 'รายการ', icon: 'transactions' },
  { route: 'quick', label: '', icon: 'plus-fab', iconSize: 28, fab: true },
  { route: 'insights', label: 'รายงาน', icon: 'insights' },
  // "เพิ่มเติม" tab — links out to categories, ledgers, settings,
  // sign-out. Replaces the old "Profile" tab so secondary screens have
  // a discoverable entry point without claiming a top-level slot each.
  { route: 'more', label: 'เพิ่มเติม', icon: 'more' },
];

export function AppTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const c = useTheme().colors;
  const activeColor = c.accent;
  const inactiveColor = c.textMuted;

  function press(routeName: string) {
    const idx = state.routes.findIndex((r) => r.name === routeName);
    if (idx === -1) return;
    const target = state.routes[idx];
    const event = navigation.emit({
      type: 'tabPress',
      target: target.key,
      canPreventDefault: true,
    });
    if (state.index !== idx && !event.defaultPrevented) {
      navigation.navigate(target.name);
    }
  }

  return (
    <View
      style={{
        paddingBottom: Math.max(insets.bottom, 8),
        paddingTop: 8,
        paddingHorizontal: 12,
        backgroundColor: c.card,
        borderTopWidth: 1,
        borderTopColor: c.border,
      }}
      className="flex-row items-end justify-around"
    >
      {NAV_ITEMS.map((item) => {
        const routeIdx = state.routes.findIndex((r) => r.name === item.route);
        const isActive = routeIdx !== -1 && routeIdx === state.index;

        if (item.fab) {
          return (
            <Pressable
              key={item.route}
              onPress={() => press(item.route)}
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: activeColor,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: -24,
                shadowColor: activeColor,
                shadowOpacity: 0.35,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 },
                elevation: 6,
              }}
            >
              <JtIcon name={item.icon} size={item.iconSize ?? 28} />
            </Pressable>
          );
        }

        const labelColor = isActive ? activeColor : inactiveColor;
        return (
          <Pressable
            key={item.route}
            onPress={() => press(item.route)}
            className="flex-1 items-center py-1.5"
            style={{ opacity: isActive ? 1 : 0.7 }}
          >
            <JtIcon name={item.icon} size={item.iconSize ?? 26} />
            <Text
              style={{
                color: labelColor,
                fontSize: 10,
                marginTop: 2,
                fontWeight: isActive ? '600' : '400',
              }}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
