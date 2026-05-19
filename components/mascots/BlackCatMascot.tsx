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
 * Black cat mascot — sleek all-black head with tall pointed ears,
 * bright yellow slit-pupil eyes, pink nose and inner ears, plus pale
 * whiskers and a tiny moon-sparkle for the moody/witchy vibe.
 */
export function BlackCatMascot({ size = 94 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Defs>
        <LinearGradient id="bFur" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#3A3147" />
          <Stop offset="0.55" stopColor="#241B30" />
          <Stop offset="1" stopColor="#14101C" />
        </LinearGradient>
        <LinearGradient id="bEar" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F2A8C2" />
          <Stop offset="1" stopColor="#D078A0" />
        </LinearGradient>
        <RadialGradient id="bEye" cx="0.4" cy="0.35" r="0.8">
          <Stop offset="0" stopColor="#F2D44A" />
          <Stop offset="0.7" stopColor="#E9A816" />
          <Stop offset="1" stopColor="#8C5A07" />
        </RadialGradient>
        <RadialGradient id="bBlush" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#E489A4" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#E489A4" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      <Ellipse cx={60} cy={110} rx={26} ry={3.4} fill="rgba(14,12,22,0.22)" />

      {/* Chest fluff */}
      <Path
        d="M38 86 Q44 96 50 98 Q60 102 70 98 Q76 96 82 86 Q80 100 70 104 Q60 108 50 104 Q40 100 38 86 Z"
        fill="url(#bFur)"
      />

      {/* Tall pointed ears */}
      <Path
        d="M28 48 Q22 10 32 12 Q40 18 46 36 Z"
        fill="url(#bFur)"
        strokeLinejoin="round"
      />
      <Path
        d="M92 48 Q98 10 88 12 Q80 18 74 36 Z"
        fill="url(#bFur)"
        strokeLinejoin="round"
      />

      {/* Inner ears — pink */}
      <Path
        d="M31 44 Q28 20 32 18 Q36 24 44 36 Z"
        fill="url(#bEar)"
        opacity={0.9}
      />
      <Path
        d="M89 44 Q92 20 88 18 Q84 24 76 36 Z"
        fill="url(#bEar)"
        opacity={0.9}
      />

      {/* Head */}
      <Ellipse cx={60} cy={64} rx={32} ry={28} fill="url(#bFur)" />

      {/* Subtle top highlight to keep the head from going flat */}
      <Ellipse cx={52} cy={48} rx={12} ry={6} fill="#FFFFFF" opacity={0.08} />

      {/* Eyes — big almond with vertical slit pupils */}
      <Path
        d="M42 60 Q48 53 54 60 Q48 65 42 60 Z"
        fill="url(#bEye)"
        stroke="#5A3B07"
        strokeWidth={0.4}
        strokeOpacity={0.4}
      />
      <Path
        d="M66 60 Q72 53 78 60 Q72 65 66 60 Z"
        fill="url(#bEye)"
        stroke="#5A3B07"
        strokeWidth={0.4}
        strokeOpacity={0.4}
      />
      <Ellipse cx={48} cy={60} rx={1} ry={4} fill="#14101C" />
      <Ellipse cx={72} cy={60} rx={1} ry={4} fill="#14101C" />
      <Circle cx={49.2} cy={58.5} r={1} fill="#FFFFFF" />
      <Circle cx={73.2} cy={58.5} r={1} fill="#FFFFFF" />
      <Circle cx={46.8} cy={61} r={0.4} fill="#FFFFFF" opacity={0.6} />
      <Circle cx={70.8} cy={61} r={0.4} fill="#FFFFFF" opacity={0.6} />

      {/* Tiny pink nose */}
      <Path
        d="M57 72 Q60 70 63 72 Q61 75 60 75 Q59 75 57 72 Z"
        fill="#E489A4"
        stroke="#B66280"
        strokeWidth={0.4}
      />

      {/* Mouth — small upside-down Y */}
      <Path
        d="M60 75 L60 78"
        stroke="#0E0B14"
        strokeWidth={0.8}
        strokeLinecap="round"
      />
      <Path
        d="M55 81 Q60 84 60 78"
        stroke="#FBE7F1"
        strokeWidth={1.2}
        fill="none"
        strokeLinecap="round"
      />
      <Path
        d="M60 78 Q60 84 65 81"
        stroke="#FBE7F1"
        strokeWidth={1.2}
        fill="none"
        strokeLinecap="round"
      />

      {/* Whiskers — pale lavender so they read on black */}
      <G stroke="#D5C9E4" strokeWidth={0.6} strokeLinecap="round" opacity={0.85}>
        <Path d="M40 73 L28 70" fill="none" />
        <Path d="M40 76 L28 78" fill="none" />
        <Path d="M80 73 L92 70" fill="none" />
        <Path d="M80 76 L92 78" fill="none" />
      </G>

      {/* Subtle cheek blush */}
      <Ellipse cx={36} cy={72} rx={5} ry={3} fill="url(#bBlush)" />
      <Ellipse cx={84} cy={72} rx={5} ry={3} fill="url(#bBlush)" />

      {/* Moon-style sparkle */}
      <Path
        d="M94 30 L95 33 L98 34 L95 35 L94 38 L93 35 L90 34 L93 33 Z"
        fill="#FBE7F1"
        opacity={0.9}
      />
      <Circle cx={20} cy={26} r={1} fill="#FBE7F1" opacity={0.7} />
      <Circle cx={26} cy={20} r={0.7} fill="#FBE7F1" opacity={0.6} />
    </Svg>
  );
}
