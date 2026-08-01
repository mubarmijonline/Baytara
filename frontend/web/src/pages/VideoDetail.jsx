import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Container } from '../components/Primitives.jsx';
import { auth, isAuthed, useFetch, webapi } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { colors } from '../theme/tokens.js';
import SecureVdoPlayer from '../components/SecureVdoPlayer.jsx';
import { useAuth } from '../lib/auth.jsx';

export default function VideoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { user } = useAuth();
  const { data, loading, error } = useFetch(() => webapi.video(id), [id]);
  const [playback, setPlayback] = useState(null);
  const [playError, setPlayError] = useState('');
  const [starting, setStarting] = useState(false);
  const video = data?.video;

  const play = async () => {
    setStarting(true);
    setPlayError('');
    try { setPlayback(await auth.playback(Number(id))); }
    catch (failure) { setPlayError(failure.message || 'error'); }
    finally { setStarting(false); }
  };

  const openRequiredAccess = () => {
    if (!isAuthed() || video.requires_auth) navigate(`/auth?next=${encodeURIComponent(`/videos/${id}`)}`);
    else if (video.requires_phone || !user?.phone) navigate(`/dashboard/profile?next=${encodeURIComponent(`/videos/${id}`)}`);
    else navigate('/dashboard');
  };

  if (loading) return <Container style={{ padding: '64px 24px' }}>{t('common.loading')}</Container>;
  if (error || !video) return <Container style={{ padding: '64px 24px' }}><h1>{t('video.notFound')}</h1></Container>;

  return (
    <main style={{ background: colors.surfaceMuted, padding: '38px 0 72px' }}>
      <Container>
        <button type="button" onClick={() => navigate('/videos')} style={{ border: 0, background: 'transparent', color: colors.accent, cursor: 'pointer', padding: '8px 0', fontWeight: 800, marginBottom: 16 }}>{t('video.back')}</button>
        <div className="video-detail-grid">
          <section>
            <div style={{ aspectRatio: '16 / 9', background: '#10152c', overflow: 'hidden', borderRadius: 8, position: 'relative' }}>
              {playback ? <SecureVdoPlayer playback={playback} title={video.title} onSecurityError={() => setPlayError('security')} /> : <>
                {video.poster && <img src={video.poster} alt={video.title} style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }} />}
                {video.can_play ? (
                  <button type="button" onClick={play} disabled={starting} style={{ position: 'absolute', insetInlineStart: '50%', top: '50%', transform: 'translate(-50%, -50%)', border: 0, borderRadius: 6, background: colors.accent, color: '#fff', minHeight: 48, padding: '0 24px', fontWeight: 900, fontSize: 16, cursor: 'pointer' }}>{starting ? t('common.loading') : t('video.watch')}</button>
                ) : (
                  <button type="button" onClick={openRequiredAccess} style={{ position: 'absolute', insetInlineStart: '50%', top: '50%', transform: 'translate(-50%, -50%)', border: 0, borderRadius: 6, background: '#fff', color: colors.ink, minHeight: 48, padding: '0 24px', fontWeight: 900, fontSize: 16, cursor: 'pointer' }}>{video.requires_phone || (isAuthed() && !user?.phone) ? t('video.addPhone') : (!isAuthed() || video.requires_auth ? t('video.signIn') : t('video.accessRequired'))}</button>
                )}
              </>}
            </div>
            {playError && <p role="alert" style={{ color: '#9b2626' }}>{t('video.playError')}</p>}
          </section>
          <aside style={{ minWidth: 0 }}>
            <div style={{ color: colors.accent, fontSize: 14, fontWeight: 800, marginBottom: 8 }}>{video.category?.name}</div>
            <h1 style={{ margin: '0 0 14px', fontSize: 34, lineHeight: 1.3, fontWeight: 900 }}>{video.title}</h1>
            {video.access_type === 'free' && <span style={{ display: 'inline-block', color: '#176b45', background: '#e8f6ef', padding: '5px 10px', borderRadius: 4, fontWeight: 800, marginBottom: 18 }}>{t('video.freeForAll')}</span>}
            {video.description && <p style={{ margin: 0, color: colors.muted, lineHeight: 1.8, fontSize: 16 }}>{video.description}</p>}
          </aside>
        </div>
      </Container>
    </main>
  );
}
