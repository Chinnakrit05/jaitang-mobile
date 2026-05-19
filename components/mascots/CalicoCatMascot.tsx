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
 * Calico cat mascot — white base with orange and dark patches.
 * Triangular ears, slim almond eyes, pink nose, whiskers.
 *
 * Built in the same gradient-shaded style as the Shiba mascot so the
 * two read as siblings in a series rather than from different artists.
 */
export function CalicoCatMascot({ size = 94 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Defs>
        <LinearGradient id="cWhite" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#F4E9DD" />
        </LinearGradient>
        <LinearGradient id="cOrange" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#E8915C" />
          <Stop offset="1" stopColor="#C45A35" />
        </LinearGradient>
        <LinearGradient id="cBlack" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#3D2B1E" />
          <Stop offset="1" stopColor="#1F140C" />
        </LinearGradient>
        <LinearGradient id="cEar" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FBC9A4" />
          <Stop offset="1" stopColor="#F09A7A" />
        </LinearGradient>
        <RadialGradient id="cEye" cx="0.35" cy="0.3" r="0.8">
          <Stop offset="0" stopColor="#4A7C3A" />
          <Stop offset="1" stopColor="#1E3C13" />
        </RadialGradient>
        <RadialGradient id="cBlush" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#F58FA8" stopOpacity="0.7" />
          <Stop offset="1" stopColor="#F58FA8" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      <Ellipse cx={60} cy={110} rx={26} ry={3.4} fill="rgba(58,40,24,0.18)" />

      {/* Chest fluff */}
      <Path
        d="M38 86 Q44 96 50 98 Q60 102 70 98 Q76 96 82 86 Q80 100 70 104 Q60 108 50 104 Q40 100 38 86 Z"
        fill="url(#cWhite)"
        stroke="#E9D9C5"
        strokeWidth={0.6}
        strokeOpacity={0.6}
      />

      {/* Pointier cat ears */}
      <Path
        d="M30 48 Q24 14 32 14 Q38 18 46 36 Z"
        fill="url(#cBlack)"
        strokeLinejoin="round"
      />
      <Path
        d="M90 48 Q96 14 88 14 Q82 18 74 36 Z"
        fill="url(#cOrange)"
        strokeLinejoin="round"
      />

      {/* Inner ears */}
      <Path
        d="M33 44 Q30 22 33 20 Q37 24 44 36 Z"
        fill="url(#cEar)"
        opacity={0.85}
      />
      <Path
        d="M87 44 Q90 22 87 20 Q83 24 76 36 Z"
        fill="url(#cEar)"
        opacity={0.85}
      />

      {/* Head — slightly wider for cat-like cheekiness */}
      <Ellipse cx={60} cy={64} rx={32} ry={28} fill="url(#cWhite)" />

      {/* Calico patches — orange forehead patch (off-center for charm) */}
      <Path
        d="M40 44 Q52 38 62 46 Q60 60 50 64 Q40 60 40 44 Z"
        fill="url(#cOrange)"
        opacity={0.95}
      />
      {/* Black patch on the right side, around the eye */}
      <Path
        d="M72 44 Q86 42 88 56 Q82 66 72 64 Q66 56 72 44 Z"
        fill="url(#cBlack)"
        opacity={0.95}
      />
      {/* Small orange chin spot */}
      <Path
        d="M52 82 Q60 86 68 82 Q64 90 60 90 Q56 90 52 82 Z"
        fill="url(#cOrange)"
        opacity={0.6}
      />

      {/* Eyes — green almond shape */}
      <Ellipse cx={48} cy={60} rx={5.5} ry={3.6} fill="#FFFFFF" opacity={0.4} />
      <Ellipse cx={72} cy={60} rx={5.5} ry={3.6} fill="#FFFFFF" opacity={0.4} />
      <Path d="M44 60 Q48 55 52 60 Q48 63.5 44 60 Z" fill="url(#cEye)" />
      <Path d="M68 60 Q72 55 76 60 Q72 63.5 68 60 Z" fill="url(#cEye)" />
      {/* Vertical pupils */}
      <Ellipse cx={48} cy={60} rx={0.8} ry={2.5} fill="#1A0F0A" />
      <Ellipse cx={72} cy={60} rx={0.8} ry={2.5} fill="#1A0F0A" />
      <Circle cx={49.2} cy={58.8} r={0.9} fill="#FFFFFF" />
      <Circle cx={73.2} cy={58.8} r={0.9} fill="#FFFFFF" />

      {/* Pink nose (cat trait) */}
      <Path
        d="M56 72 Q60 70 64 72 Q62 76 60 76 Q58 76 56 72 Z"
        fill="#E89AB0"
        stroke="#C76787"
        strokeWidth={0.5}
      />

      {/* Mouth — tiny W cat smile */}
      <Path
        d="M56 76 L60 78 L64 76"
        stroke="#3D2B1E"
        strokeWidth={1.2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M52 78 Q56 82 60 78"
        stroke="#3D2B1E"
        strokeWidth={1.2}
        fill="none"
        strokeLinecap="round"
      />
      <Path
        d="M60 78 Q64 82 68 78"
        stroke="#3D2B1E"
        strokeWidth={1.2}
        fill="none"
        strokeLinecap="round"
      />

      {/* Whiskers */}
      <G stroke="#A88B70" strokeWidth={0.6} strokeLinecap="round" opacity={0.7}>
        <Path d="M40 71 L28 68" fill="none" />
        <Path d="M40 74 L28 76" fill="none" />
        <Path d="M80 71 L92 68" fill="none" />
        <Path d="M80 74 L92 76" fill="none" />
      </G>

      {/* Cheek blush */}
      <Ellipse cx={36} cy={72} rx={5} ry={3} fill="url(#cBlush)" />
      <Ellipse cx={84} cy={72} rx={5} ry={3} fill="url(#cBlush)" />

      {/* Sparkle */}
      <Path
        d="M94 32 L95 35 L98 36 L95 37 L94 40 L93 37 L90 36 L93 35 Z"
        fill="#FFFFFF"
        opacity={0.85}
      />
    </Svg>
  );
}
