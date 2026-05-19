import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';

/**
 * Penguin mascot — round black body with a white belly oval, golden
 * cheek patches (emperor-style), and small orange feet poking out.
 *
 * Same gradient-shaded style as the Shiba/Calico mascots so all five
 * read as a single illustration set.
 */
export function PenguinMascot({ size = 94 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Defs>
        <LinearGradient id="pBody" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#3D5063" />
          <Stop offset="0.55" stopColor="#22324A" />
          <Stop offset="1" stopColor="#0E1620" />
        </LinearGradient>
        <LinearGradient id="pBelly" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#E8EEF4" />
        </LinearGradient>
        <LinearGradient id="pBeak" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F2B43A" />
          <Stop offset="1" stopColor="#D38918" />
        </LinearGradient>
        <LinearGradient id="pFoot" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F2A02A" />
          <Stop offset="1" stopColor="#D17314" />
        </LinearGradient>
        <RadialGradient id="pEye" cx="0.35" cy="0.3" r="0.8">
          <Stop offset="0" stopColor="#3A2A1E" />
          <Stop offset="1" stopColor="#0E0805" />
        </RadialGradient>
        <RadialGradient id="pCheek" cx="0.5" cy="0.5" r="0.6">
          <Stop offset="0" stopColor="#F2B43A" stopOpacity="0.85" />
          <Stop offset="1" stopColor="#F2B43A" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      <Ellipse cx={60} cy={113} rx={28} ry={3.4} fill="rgba(14,22,32,0.22)" />

      {/* Feet */}
      <Path
        d="M40 100 Q36 108 42 110 Q50 110 52 104 Z"
        fill="url(#pFoot)"
      />
      <Path
        d="M80 100 Q84 108 78 110 Q70 110 68 104 Z"
        fill="url(#pFoot)"
      />

      {/* Body */}
      <Path
        d="M30 60 Q30 30 60 30 Q90 30 90 60 Q90 102 60 102 Q30 102 30 60 Z"
        fill="url(#pBody)"
      />

      {/* Belly */}
      <Path
        d="M42 62 Q42 48 60 46 Q78 48 78 62 Q78 92 60 96 Q42 92 42 62 Z"
        fill="url(#pBelly)"
      />

      {/* Top-of-head highlight */}
      <Ellipse cx={54} cy={36} rx={10} ry={5} fill="#FFFFFF" opacity={0.18} />

      {/* Golden cheek patches (emperor look) */}
      <Ellipse cx={42} cy={56} rx={8} ry={6} fill="url(#pCheek)" />
      <Ellipse cx={78} cy={56} rx={8} ry={6} fill="url(#pCheek)" />

      {/* Eyes */}
      <Ellipse cx={50} cy={54} rx={4} ry={3} fill="#FFFFFF" />
      <Ellipse cx={70} cy={54} rx={4} ry={3} fill="#FFFFFF" />
      <Circle cx={50} cy={54} r={2.2} fill="url(#pEye)" />
      <Circle cx={70} cy={54} r={2.2} fill="url(#pEye)" />
      <Circle cx={50.8} cy={53} r={0.8} fill="#FFFFFF" />
      <Circle cx={70.8} cy={53} r={0.8} fill="#FFFFFF" />
      <Circle cx={49} cy={54.5} r={0.4} fill="#FFFFFF" opacity={0.7} />
      <Circle cx={69} cy={54.5} r={0.4} fill="#FFFFFF" opacity={0.7} />

      {/* Beak — pointy triangle, slightly open */}
      <Path
        d="M54 62 Q60 60 66 62 L60 70 Z"
        fill="url(#pBeak)"
        stroke="#A66509"
        strokeWidth={0.6}
        strokeOpacity={0.5}
        strokeLinejoin="round"
      />
      <Path d="M55 64 Q60 65 65 64" stroke="#A66509" strokeWidth={0.5} fill="none" />

      {/* Flippers — sit at the body edges */}
      <Path
        d="M28 64 Q22 80 28 92 Q34 88 34 76 Q32 68 28 64 Z"
        fill="url(#pBody)"
        stroke="#0A111A"
        strokeWidth={0.6}
        strokeOpacity={0.6}
      />
      <Path
        d="M92 64 Q98 80 92 92 Q86 88 86 76 Q88 68 92 64 Z"
        fill="url(#pBody)"
        stroke="#0A111A"
        strokeWidth={0.6}
        strokeOpacity={0.6}
      />

      {/* Tiny rosy belly blush */}
      <Ellipse cx={60} cy={78} rx={8} ry={3} fill="#F58FA8" opacity={0.18} />

      {/* Sparkle */}
      <Path
        d="M96 30 L97 33 L100 34 L97 35 L96 38 L95 35 L92 34 L95 33 Z"
        fill="#FFFFFF"
        opacity={0.9}
      />
    </Svg>
  );
}
