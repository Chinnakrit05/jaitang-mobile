import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

/**
 * The Shiba mascot from `ui/Dashboard.html`. Pure SVG, no asset
 * download — small enough to inline. Sizes the viewBox to 100×100 so a
 * `size` prop maps directly to width/height.
 */
export function ShibaMascot({ size = 94 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* ground shadow */}
      <Ellipse cx={50} cy={92} rx={22} ry={3} fill="rgba(58,40,24,0.20)" />
      {/* outer ears */}
      <Path d="M28 38 L22 16 L40 30 Z" fill="#C97A4B" />
      <Path d="M72 38 L78 16 L60 30 Z" fill="#C97A4B" />
      {/* inner ears */}
      <Path d="M30 33 L26 22 L37 30 Z" fill="#F4B07A" />
      <Path d="M70 33 L74 22 L63 30 Z" fill="#F4B07A" />
      {/* head */}
      <Ellipse cx={50} cy={58} rx={28} ry={24} fill="#E89766" />
      {/* face mask (cream) */}
      <Path
        d="M28 60 Q40 54 50 56 Q60 54 72 60 Q66 80 50 80 Q34 80 28 60 Z"
        fill="#FCEADC"
      />
      {/* forehead blaze */}
      <Path
        d="M46 36 Q50 42 54 36 Q56 50 50 54 Q44 50 46 36 Z"
        fill="#FCEADC"
      />
      {/* eyes */}
      <Path d="M37 52 Q40 49 43 52 Q40 56 37 52 Z" fill="#2B1812" />
      <Path d="M57 52 Q60 49 63 52 Q60 56 57 52 Z" fill="#2B1812" />
      <Circle cx={41} cy={51} r={0.8} fill="#fff" />
      <Circle cx={61} cy={51} r={0.8} fill="#fff" />
      {/* nose */}
      <Ellipse cx={50} cy={63} rx={3} ry={2.2} fill="#2B1812" />
      {/* mouth */}
      <Path
        d="M44 69 Q50 75 56 69"
        stroke="#2B1812"
        strokeWidth={1.6}
        fill="none"
        strokeLinecap="round"
      />
      {/* tongue */}
      <Path
        d="M47 70 Q50 75 53 70"
        stroke="#E96B8E"
        strokeWidth={1}
        fill="#F4A0B0"
        strokeLinejoin="round"
      />
      {/* cheeks */}
      <Ellipse cx={32} cy={65} rx={4} ry={2.4} fill="#E8855E" opacity={0.45} />
      <Ellipse cx={68} cy={65} rx={4} ry={2.4} fill="#E8855E" opacity={0.45} />
    </Svg>
  );
}
