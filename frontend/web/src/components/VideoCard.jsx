import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '../theme/tokens.js';
import { useI18n } from '../lib/i18n.jsx';

export default function VideoCard({ video }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [posterFailed, setPosterFailed] = useState(false);

  return (
    <article style={{ border: `1px solid ${colors.line}`, borderRadius: 8, overflow: 'hidden', background: '#fff', minWidth: 0 }}>
      <button
        type="button"
        onClick={() => navigate(`/videos/${video.id}`)}
        aria-label={`${t('video.open')}: ${video.title}`}
        style={{ display: 'block', width: '100%', padding: 0, border: 0, background: colors.ink, cursor: 'pointer', position: 'relative', aspectRatio: '16 / 9', overflow: 'hidden' }}
      >
        {video.poster && !posterFailed ? (
          <img src={video.poster} alt={video.title} onError={() => setPosterFailed(true)} style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }} />
        ) : (
          <span aria-hidden="true" style={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%', color: colors.gold, fontSize: 24, fontWeight: 900 }}>BAYTARA</span>
        )}
        <span aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
          <span style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,.94)', display: 'grid', placeItems: 'center', boxShadow: '0 5px 18px rgba(0,0,0,.22)' }}>
            <span style={{ width: 0, height: 0, borderTop: '8px solid transparent', borderBottom: '8px solid transparent', borderInlineStart: `13px solid ${colors.accent}`, marginInlineStart: 3 }} />
          </span>
        </span>
      </button>
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 9 }}>
          <span style={{ color: colors.accent, fontSize: 13, fontWeight: 800 }}>{video.category?.name}</span>
          {video.access_type === 'free' && <span style={{ color: '#176b45', background: '#e8f6ef', padding: '3px 8px', borderRadius: 4, fontSize: 12, fontWeight: 800 }}>{t('common.free')}</span>}
        </div>
        <h3 style={{ margin: 0, fontSize: 19, lineHeight: 1.4, fontWeight: 900 }}>{video.title}</h3>
        {video.description && <p style={{ margin: '8px 0 0', color: colors.muted, fontSize: 14, lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{video.description}</p>}
      </div>
    </article>
  );
}
