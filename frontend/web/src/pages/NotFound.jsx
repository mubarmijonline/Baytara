import { useNavigate } from 'react-router-dom';
import { colors } from '../theme/tokens.js';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: 480, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24 }}>
      <div>
        <div style={{ fontSize: 72, fontWeight: 900, color: colors.accent, letterSpacing: '-2px' }}>404</div>
        <h1 style={{ fontSize: 26, fontWeight: 900, margin: '8px 0 10px' }}>الصفحة غير موجودة</h1>
        <p style={{ color: colors.muted, fontSize: 16, margin: '0 0 24px' }}>
          عذراً، الصفحة التي تبحث عنها غير متوفّرة أو تم نقلها.
        </p>
        <button
          onClick={() => navigate('/')}
          style={{
            background: colors.accent,
            border: 'none',
            borderRadius: 12,
            color: '#fff',
            fontSize: 16,
            fontWeight: 800,
            padding: '14px 30px',
            cursor: 'pointer',
          }}
        >
          العودة للرئيسية
        </button>
      </div>
    </div>
  );
}
