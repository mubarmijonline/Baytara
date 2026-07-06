import { Container } from './Primitives.jsx';
import { gradients } from '../theme/tokens.js';

// Reusable dark page header used by the interior (non-design) pages.
export default function PageHero({ breadcrumb, title, subtitle }) {
  return (
    <div style={{ background: gradients.darkPanel, color: '#fff', padding: '46px 0' }}>
      <Container>
        {breadcrumb && <div style={{ fontSize: 13, color: '#b6b6cc', marginBottom: 10 }}>{breadcrumb}</div>}
        <h1 style={{ fontSize: 38, fontWeight: 900, margin: '0 0 8px' }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 17, color: '#c9c9dc', margin: 0, maxWidth: 640 }}>{subtitle}</p>}
      </Container>
    </div>
  );
}
