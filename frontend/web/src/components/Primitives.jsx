import { layout } from '../theme/tokens.js';

// Centered max-width container matching the design's 1240px wrapper.
export function Container({ children, style, className }) {
  return (
    <div
      className={className}
      style={{ maxWidth: layout.maxWidth, margin: '0 auto', padding: '0 24px', ...style }}
    >
      {children}
    </div>
  );
}

// Section heading pair (title + optional subtitle).
export function SectionHeading({ title, subtitle, action }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        marginBottom: 26,
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      <div>
        <h2 style={{ fontSize: 30, fontWeight: 900, margin: '0 0 6px', letterSpacing: '-.5px' }}>{title}</h2>
        {subtitle && <p style={{ margin: 0, color: '#6b6b7b', fontSize: 16 }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
