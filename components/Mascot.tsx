import { useTheme } from '../providers/ThemeProvider';
import type { PaletteId } from '../lib/theme/colors';
import { ShibaMascot } from './ShibaMascot';
import { CalicoCatMascot } from './mascots/CalicoCatMascot';
import { PenguinMascot } from './mascots/PenguinMascot';
import { BlackCatMascot } from './mascots/BlackCatMascot';
import { SamoyedMascot } from './mascots/SamoyedMascot';

/**
 * Palette-aware mascot. Reads the active palette from `useTheme()` and
 * renders the matching animal SVG.
 *
 * Use `<Mascot size={N} />` everywhere on the dashboard / empty states.
 * If a screen needs to render a specific mascot (e.g. the palette
 * picker in settings), call the explicit variant directly via
 * `mascotFor(paletteId)`.
 */
export function Mascot({ size = 94 }: { size?: number }) {
  const { palette } = useTheme();
  const Component = mascotFor(palette);
  return <Component size={size} />;
}

export function mascotFor(palette: PaletteId) {
  switch (palette) {
    case 'calico':
      return CalicoCatMascot;
    case 'penguin':
      return PenguinMascot;
    case 'blackcat':
      return BlackCatMascot;
    case 'samoyed':
      return SamoyedMascot;
    case 'shiba':
    default:
      return ShibaMascot;
  }
}
