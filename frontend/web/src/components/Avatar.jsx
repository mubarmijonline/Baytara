import { User } from 'lucide-react';
import { colors, gradients } from '../theme/tokens.js';

/**
 * A person's photo, or a branded stand-in when there isn't one.
 *
 * The fallback used to be a flat blue disc, which read as a broken image next to
 * real photographs. It is now the brand gradient with a gold figure and the
 * person's initial, so an instructor without a photo still looks intentional.
 */
export default function Avatar({ src, name = '', round = false, ratio = '1 / 1', iconSize = 64 }) {
  const initial = (name || '').trim().charAt(0);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: round ? '1 / 1' : ratio,
        borderRadius: round ? '50%' : 0,
        overflow: 'hidden',
        background: gradients.darkPanel,
      }}
    >
      {src ? (
        <img
          src={src}
          alt={name}
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }}
        />
      ) : (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
            // A faint gold wash keeps the stand-in from reading as an error state.
            background: 'radial-gradient(circle at 50% 35%, rgba(233,190,67,.16), transparent 62%)',
            color: colors.gold,
          }}
        >
          <User size={iconSize} strokeWidth={1.2} />
          {initial && (
            <span
              style={{
                position: 'absolute', bottom: '14%', fontSize: Math.round(iconSize * 0.3),
                fontWeight: 700, color: 'rgba(255,255,255,.55)', letterSpacing: 1,
              }}
            >
              {initial}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
