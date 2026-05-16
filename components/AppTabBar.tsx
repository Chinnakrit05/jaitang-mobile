import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

/**
 * Custom bottom tab bar matching the `ui/Dashboard.html` design
 * (variation v2-playful). Five slots, with the third one rendered as a
 * floating action button that pops above the bar — the quick-add path.
 *
 * The design uses warm earth tones rather than the default expo cyan:
 *
 *   - active label / icon: rgb(217, 133, 86)  ("toffee orange")
 *   - inactive: zinc-500
 *   - bar fill: rgba(255, 255, 255, 0.95)
 *   - hairline top border: zinc-200
 *
 * Routes are looked up by name in `state.routes` so the visual order
 * here is independent of the `<Tabs.Screen>` declaration order. Tabs
 * that aren't declared (or are hidden via `href: null`) simply get
 * skipped — the FAB will still render even if `quick` is absent from
 * the state (in practice it always is, since it's declared as a tab).
 */

type IconProps = { color: string; size: number };

function HomeIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 11l9-8 9 8v9a2 2 0 01-2 2h-4v-7h-6v7H5a2 2 0 01-2-2v-9z"
        stroke={color}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ListIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 6h16M4 12h16M4 18h16"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function PlusIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 5v14M5 12h14"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function ChartIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 20V10M10 20V4M16 20v-7M22 20H2"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function ProfileIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8} r={4} stroke={color} strokeWidth={1.7} />
      <Path
        d="M4 21c1.5-4.5 5-6 8-6s6.5 1.5 8 6"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
      />
    </Svg>
  );
}

type NavItem = {
  route: string;
  label: string;
  Icon: (p: IconProps) => React.ReactElement;
  fab?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { route: 'dashboard', label: 'หน้าหลัก', Icon: HomeIcon },
  { route: 'transactions', label: 'รายการ', Icon: ListIcon },
  { route: 'quick', label: '', Icon: PlusIcon, fab: true },
  { route: 'insights', label: 'รายงาน', Icon: ChartIcon },
  { route: 'settings', label: 'โปรไฟล์', Icon: ProfileIcon },
];

const ACTIVE_COLOR = '#D98556';
const INACTIVE_COLOR = '#9a958c';

export function AppTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

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
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderTopWidth: 1,
        borderTopColor: '#e4e4e7',
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
                backgroundColor: ACTIVE_COLOR,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: -24,
                shadowColor: ACTIVE_COLOR,
                shadowOpacity: 0.35,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 },
                elevation: 6,
              }}
            >
              <PlusIcon color="#ffffff" size={26} />
            </Pressable>
          );
        }

        const color = isActive ? ACTIVE_COLOR : INACTIVE_COLOR;
        return (
          <Pressable
            key={item.route}
            onPress={() => press(item.route)}
            className="flex-1 items-center py-1.5"
          >
            <item.Icon color={color} size={22} />
            <Text
              style={{
                color,
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
