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
 * The Jaitang Shiba mascot — a polished, gradient-shaded SVG inu.
 *
 * Built up in layers (back → front) so the face reads as 3D-ish even
 * though everything is flat shapes: chest fluff sits behind the head,
 * the head has a top-down warm gradient (lighter on top), the cream
 * face mask has soft edges via a subtle radial highlight, and the
 * eyes carry two specular dots so they don't look dead.
 *
 * `size` maps directly to the rendered width/height — viewBox is
 * 120×120 with the dog parked in the middle so giving it a tight
 * container (e.g. 76px) doesn't crop the ears or chest fluff.
 */
export function ShibaMascot({ size = 94 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Defs>
        {/* Warm fur gradient — lighter caramel on top, deeper rust at
            the jawline. Gives the head a hint of volume. */}
        <LinearGradient id="fur" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F2A878" />
          <Stop offset="0.55" stopColor="#E58B57" />
          <Stop offset="1" stopColor="#C46F3F" />
        </LinearGradient>
        {/* Inner ear — soft peach with a touch of pink. */}
        <LinearGradient id="ear" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FBC9A4" />
          <Stop offset="1" stopColor="#F19A6F" />
        </LinearGradient>
        {/* Cream face mask — slightly warmer at the chin so it blends
            into the fur instead of looking pasted on. */}
        <LinearGradient id="cream" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFF6EA" />
          <Stop offset="1" stopColor="#FBE2C5" />
        </LinearGradient>
        {/* Chest fluff — same family as cream but a bit cooler. */}
        <LinearGradient id="fluff" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#FBE2C5" />
        </LinearGradient>
        {/* Eye glint — radial so it feels glossy. */}
        <RadialGradient id="eye" cx="0.35" cy="0.3" r="0.8">
          <Stop offset="0" stopColor="#5A3624" />
          <Stop offset="1" stopColor="#1F120A" />
        </RadialGradient>
        {/* Blush — pink with soft falloff. */}
        <RadialGradient id="blush" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#F58FA8" stopOpacity="0.85" />
          <Stop offset="1" stopColor="#F58FA8" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      {/* Ground shadow */}
      <Ellipse cx={60} cy={110} rx={26} ry={3.4} fill="rgba(58,40,24,0.18)" />

      {/* Chest fluff peeking out below the head */}
      <G>
        <Path
          d="M38 86 Q44 96 50 98 Q60 102 70 98 Q76 96 82 86 Q80 100 70 104 Q60 108 50 104 Q40 100 38 86 Z"
          fill="url(#fluff)"
          stroke="#E9B98D"
          strokeWidth={0.6}
          strokeOpacity={0.5}
        />
        {/* tiny fluff tufts */}
        <Path
          d="M48 92 Q50 96 53 93"
          stroke="#E9B98D"
          strokeWidth={0.7}
          strokeOpacity={0.45}
          fill="none"
          strokeLinecap="round"
        />
        <Path
          d="M67 92 Q70 96 72 93"
          stroke="#E9B98D"
          strokeWidth={0.7}
          strokeOpacity={0.45}
          fill="none"
          strokeLinecap="round"
        />
      </G>

      {/* Outer ears — pointy triangle with rounded tips */}
      <Path
        d="M32 44 Q26 18 30 16 Q36 18 46 36 Z"
        fill="url(#fur)"
        stroke="#A55C30"
        strokeWidth={0.8}
        strokeOpacity={0.35}
        strokeLinejoin="round"
      />
      <Path
        d="M88 44 Q94 18 90 16 Q84 18 74 36 Z"
        fill="url(#fur)"
        stroke="#A55C30"
        strokeWidth={0.8}
        strokeOpacity={0.35}
        strokeLinejoin="round"
      />

      {/* Inner ears */}
      <Path
        d="M34 40 Q31 24 34 22 Q38 26 44 36 Z"
        fill="url(#ear)"
        strokeLinejoin="round"
      />
      <Path
        d="M86 40 Q89 24 86 22 Q82 26 76 36 Z"
        fill="url(#ear)"
        strokeLinejoin="round"
      />

      {/* Head — slightly squashed oval for chubby cheeks */}
      <Ellipse
        cx={60}
        cy={64}
        rx={32}
        ry={28}
        fill="url(#fur)"
        stroke="#A55C30"
        strokeWidth={0.6}
        strokeOpacity={0.3}
      />

      {/* Soft highlight on top of the head — adds shine */}
      <Ellipse cx={52} cy={48} rx={12} ry={6} fill="#FFFFFF" opacity={0.18} />

      {/* Cream face mask */}
      <Path
        d="M30 66 Q42 56 60 60 Q78 56 90 66 Q86 86 72 90 Q60 94 48 90 Q34 86 30 66 Z"
        fill="url(#cream)"
      />

      {/* Forehead blaze (cream stripe between the eyes) */}
      <Path
        d="M54 36 Q60 46 66 36 Q68 52 60 60 Q52 52 54 36 Z"
        fill="url(#cream)"
      />

      {/* Eye sockets — subtle indents so the eyes sit in cream */}
      <Ellipse cx={48} cy={58} rx={5.5} ry={3.6} fill="#FFFFFF" opacity={0.5} />
      <Ellipse cx={72} cy={58} rx={5.5} ry={3.6} fill="#FFFFFF" opacity={0.5} />

      {/* Eyes — almond-shape with gradient + double specular highlights */}
      <Path
        d="M44 58 Q48 53 52 58 Q48 61.5 44 58 Z"
        fill="url(#eye)"
      />
      <Path
        d="M68 58 Q72 53 76 58 Q72 61.5 68 58 Z"
        fill="url(#eye)"
      />
      <Circle cx={49.5} cy={57} r={1.1} fill="#FFFFFF" />
      <Circle cx={73.5} cy={57} r={1.1} fill="#FFFFFF" />
      <Circle cx={47} cy={59} r={0.5} fill="#FFFFFF" opacity={0.8} />
      <Circle cx={71} cy={59} r={0.5} fill="#FFFFFF" opacity={0.8} />

      {/* Tiny eyebrow tufts — gives a friendly expression */}
      <Path
        d="M44 51 Q48 49 51 51"
        stroke="#C46F3F"
        strokeWidth={1.2}
        fill="none"
        strokeLinecap="round"
        opacity={0.65}
      />
      <Path
        d="M69 51 Q72 49 76 51"
        stroke="#C46F3F"
        strokeWidth={1.2}
        fill="none"
        strokeLinecap="round"
        opacity={0.65}
      />

      {/* Nose — small triangular boop with shine */}
      <Path
        d="M56 70 Q60 67 64 70 Q62 74 60 74 Q58 74 56 70 Z"
        fill="#231209"
      />
      <Ellipse cx={58.5} cy={69.5} rx={0.9} ry={0.6} fill="#FFFFFF" opacity={0.7} />

      {/* Mouth — gentle W-smile */}
      <Path
        d="M52 78 Q56 82 60 78 Q64 82 68 78"
        stroke="#231209"
        strokeWidth={1.6}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Tongue — tiny peek */}
      <Path
        d="M58 80 Q60 84 62 80 Z"
        fill="#F4A0B0"
        stroke="#E96B8E"
        strokeWidth={0.6}
        strokeLinejoin="round"
      />

      {/* Cheek blush */}
      <Ellipse cx={36} cy={72} rx={5.5} ry={3.5} fill="url(#blush)" />
      <Ellipse cx={84} cy={72} rx={5.5} ry={3.5} fill="url(#blush)" />

      {/* Tiny sparkle near the ear — adds a hint of magic without being
          loud. Sits on the cheek side of the right ear. */}
      <G opacity={0.85}>
        <Path
          d="M92 30 L93.2 33 L96 34.2 L93.2 35.4 L92 38.4 L90.8 35.4 L88 34.2 L90.8 33 Z"
          fill="#FFFFFF"
        />
      </G>
    </Svg>
  );
}
