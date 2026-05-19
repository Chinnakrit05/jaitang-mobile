import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';

/**
 * Samoyed mascot — round fluffy white head with cool grey shading,
 * black nose and almond eyes, and the trademark "Samoyed smile". Soft
 * blue tints in the shadows tie it back to the Samoyed palette.
 */
export function SamoyedMascot({ size = 94 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Defs>
        <LinearGradient id="sFur" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.55" stopColor="#EEF3F7" />
          <Stop offset="1" stopColor="#D1DDE6" />
        </LinearGradient>
        <LinearGradient id="sEar" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F5C3D2" />
          <Stop offset="1" stopColor="#D89AAE" />
        </LinearGradient>
        <RadialGradient id="sEye" cx="0.35" cy="0.3" r="0.8">
          <Stop offset="0" stopColor="#3B2A1E" />
          <Stop offset="1" stopColor="#0E0805" />
        </RadialGradient>
        <RadialGradient id="sBlush" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#F58FA8" stopOpacity="0.7" />
          <Stop offset="1" stopColor="#F58FA8" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      <Ellipse cx={60} cy={110} rx={26} ry={3.4} fill="rgba(80,100,120,0.18)" />

      {/* Big fluffy ruff around the neck — the signature Samoyed shape */}
      <Path
        d="M30 78 Q26 88 32 96 Q40 102 52 102 Q60 104 68 102 Q80 102 88 96 Q94 88 90 78 Q86 92 76 96 Q60 100 44 96 Q34 92 30 78 Z"
        fill="url(#sFur)"
        stroke="#C2D2DE"
        strokeWidth={0.6}
        strokeOpacity={0.7}
      />
      {/* Tufts */}
      <Path
        d="M46 92 Q48 96 51 93"
        stroke="#C2D2DE"
        strokeWidth={0.7}
        strokeOpacity={0.6}
        fill="none"
        strokeLinecap="round"
      />
      <Path
        d="M69 92 Q72 96 74 93"
        stroke="#C2D2DE"
        strokeWidth={0.7}
        strokeOpacity={0.6}
        fill="none"
        strokeLinecap="round"
      />

      {/* Pointed-but-rounded ears */}
      <Path
        d="M32 44 Q26 18 32 16 Q40 22 46 36 Z"
        fill="url(#sFur)"
        stroke="#C2D2DE"
        strokeWidth={0.6}
        strokeOpacity={0.6}
        strokeLinejoin="round"
      />
      <Path
        d="M88 44 Q94 18 88 16 Q80 22 74 36 Z"
        fill="url(#sFur)"
        stroke="#C2D2DE"
        strokeWidth={0.6}
        strokeOpacity={0.6}
        strokeLinejoin="round"
      />

      {/* Inner ears */}
      <Path d="M34 40 Q31 24 34 22 Q38 26 44 36 Z" fill="url(#sEar)" opacity={0.7} />
      <Path d="M86 40 Q89 24 86 22 Q82 26 76 36 Z" fill="url(#sEar)" opacity={0.7} />

      {/* Head */}
      <Ellipse
        cx={60}
        cy={64}
        rx={32}
        ry={28}
        fill="url(#sFur)"
        stroke="#C2D2DE"
        strokeWidth={0.5}
        strokeOpacity={0.5}
      />

      {/* Top highlight */}
      <Ellipse cx={52} cy={48} rx={12} ry={6} fill="#FFFFFF" opacity={0.5} />

      {/* Subtle muzzle area — slightly lighter, defined by a soft curve */}
      <Path
        d="M40 70 Q60 64 80 70 Q76 86 60 88 Q44 86 40 70 Z"
        fill="#FFFFFF"
        opacity={0.7}
      />

      {/* Eye sockets (very subtle cool shadow) */}
      <Ellipse cx={48} cy={58} rx={5} ry={3.4} fill="#D1DDE6" opacity={0.5} />
      <Ellipse cx={72} cy={58} rx={5} ry={3.4} fill="#D1DDE6" opacity={0.5} />

      {/* Almond eyes */}
      <Path d="M44 58 Q48 53 52 58 Q48 61.5 44 58 Z" fill="url(#sEye)" />
      <Path d="M68 58 Q72 53 76 58 Q72 61.5 68 58 Z" fill="url(#sEye)" />
      <Circle cx={49.5} cy={57} r={1.1} fill="#FFFFFF" />
      <Circle cx={73.5} cy={57} r={1.1} fill="#FFFFFF" />
      <Circle cx={47} cy={59} r={0.5} fill="#FFFFFF" opacity={0.8} />
      <Circle cx={71} cy={59} r={0.5} fill="#FFFFFF" opacity={0.8} />

      {/* Cool brow tufts */}
      <Path
        d="M44 51 Q48 49 51 51"
        stroke="#7BA7C9"
        strokeWidth={1}
        fill="none"
        strokeLinecap="round"
        opacity={0.45}
      />
      <Path
        d="M69 51 Q72 49 76 51"
        stroke="#7BA7C9"
        strokeWidth={1}
        fill="none"
        strokeLinecap="round"
        opacity={0.45}
      />

      {/* Nose — black, classic */}
      <Path
        d="M56 70 Q60 67 64 70 Q62 74 60 74 Q58 74 56 70 Z"
        fill="#181210"
      />
      <Ellipse cx={58.5} cy={69.5} rx={0.9} ry={0.6} fill="#FFFFFF" opacity={0.7} />

      {/* Signature Samoyed smile — upturned mouth corners */}
      <Path
        d="M50 80 Q54 84 60 82 Q66 84 70 80"
        stroke="#231209"
        strokeWidth={1.6}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Tiny tongue tip */}
      <Path
        d="M57 82 Q60 86 63 82 Z"
        fill="#F4A0B0"
        stroke="#E96B8E"
        strokeWidth={0.5}
        strokeLinejoin="round"
      />

      {/* Cheek blush */}
      <Ellipse cx={36} cy={72} rx={5.5} ry={3.5} fill="url(#sBlush)" />
      <Ellipse cx={84} cy={72} rx={5.5} ry={3.5} fill="url(#sBlush)" />

      {/* Snowflake sparkle */}
      <G opacity={0.85}>
        <Path
          d="M94 30 L95 33 L98 34 L95 35 L94 38 L93 35 L90 34 L93 33 Z"
          fill="#7BA7C9"
        />
      </G>
    </Svg>
  );
}
