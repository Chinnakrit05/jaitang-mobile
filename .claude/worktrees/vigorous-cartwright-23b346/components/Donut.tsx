import Svg, { Circle, G, Text as SvgText } from 'react-native-svg';

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
}: Props) {
  const r = 38;
  const C = 2 * Math.PI * r;
  const total = data.reduce((s, d) => s + d.value, 0);

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
          const node = (
            <Circle
              key={i}
              cx={50}
              cy={50}
              r={r}
              fill="none"
              stroke={slice.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dash} ${C - dash}`}
              strokeDashoffset={-offset}
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
