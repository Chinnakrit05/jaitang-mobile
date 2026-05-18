import { useEffect } from 'react';
import Svg, { Circle, G, Text as SvgText } from 'react-native-svg';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Donut chart with a center label. Pure SVG, no third-party chart lib —
 * each slice is just a circle with a stroke-dasharray/offset trick
 * (same math the Dashboard.html mockup uses verbatim).
 *
 * Slices are drawn in the given order starting from 12 o'clock (the
 * `<G rotation={-90}>` shifts the start). If `data` is empty, only the
 * grey track renders.
 */

export type DonutSlice = {
  value: number;
  color: string;
};

type Props = {
  data: DonutSlice[];
  size?: number;
  strokeWidth?: number;
  trackColor?: string;
  label?: string;
  centerValue?: string;
  labelColor?: string;
  centerColor?: string;
  animated?: boolean;
  animationDuration?: number;
};

export function Donut({
  data,
  size = 108,
  strokeWidth = 16,
  trackColor = '#F4E7D5',
  label,
  centerValue,
  labelColor = '#9a958c',
  centerColor = '#3D2A1E',
  animated = true,
  animationDuration = 820,
}: Props) {
  const r = 38;
  const C = 2 * Math.PI * r;
  const total = data.reduce((s, d) => s + d.value, 0);
  const progress = useSharedValue(animated ? 0 : 1);
  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: animated ? animationDuration : 0,
      easing: Easing.out(Easing.cubic),
    });
  }, [animated, animationDuration, data, progress]);

  let offset = 0;
  const slices = total > 0 ? data : [];

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle
        cx={50}
        cy={50}
        r={r}
        fill="none"
        stroke={trackColor}
        strokeWidth={strokeWidth}
      />
      <G rotation={-90} origin="50, 50">
        {slices.map((slice, i) => {
          const dash = (slice.value / total) * C;
          const startOffset = offset;
          const node = (
            <DonutSegment
              key={i}
              color={slice.color}
              dash={dash}
              circumference={C}
              offset={startOffset}
              progress={progress}
              radius={r}
              strokeWidth={strokeWidth}
            />
          );
          offset += dash;
          return node;
        })}
      </G>
      {label ? (
        <SvgText
          x={50}
          y={48}
          textAnchor="middle"
          fontSize={9}
          fill={labelColor}
        >
          {label}
        </SvgText>
      ) : null}
      {centerValue ? (
        <SvgText
          x={50}
          y={60}
          textAnchor="middle"
          fontSize={13}
          fontWeight="700"
          fill={centerColor}
        >
          {centerValue}
        </SvgText>
      ) : null}
    </Svg>
  );
}

function DonutSegment({
  color,
  dash,
  circumference,
  offset,
  progress,
  radius,
  strokeWidth,
}: {
  color: string;
  dash: number;
  circumference: number;
  offset: number;
  progress: SharedValue<number>;
  radius: number;
  strokeWidth: number;
}) {
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: -offset + dash * (1 - progress.value),
  }));

  return (
    <AnimatedCircle
      cx={50}
      cy={50}
      r={radius}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeDasharray={`${dash} ${circumference - dash}`}
      animatedProps={animatedProps}
      strokeLinecap="round"
    />
  );
}
