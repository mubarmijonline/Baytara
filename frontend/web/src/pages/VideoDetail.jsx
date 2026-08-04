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
  const anonymous = video && (!isAuthed() || video.requires_auth);

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
                  <button
                    type="button"
                    data-testid="video-touch-target"
                    onClick={play}
                    disabled={starting}
                    aria-label={t('video.watch')}
                    className="video-touch-target"
                    style={{ position: 'absolute', inset: 0, border: 0, background: 'linear-gradient(180deg, rgba(16,21,44,.08), rgba(16,21,44,.34))', color: '#fff', display: 'grid', placeItems: 'center', cursor: starting ? 'progress' : 'pointer' }}
                  >
                    <span style={{ borderRadius: 6, background: colors.accent, color: '#fff', minHeight: 48, padding: '0 24px', fontWeight: 900, fontSize: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 32px rgba(0,0,0,.28)' }}>{starting ? t('common.loading') : t('video.watch')}</span>
                  </button>
                ) : (
                  <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 22, background: 'linear-gradient(180deg, rgba(16,21,44,.24), rgba(16,21,44,.78))' }}>
                    <div style={{ width: 'min(440px, 100%)', border: '1px solid rgba(255,255,255,.26)', borderRadius: 8, background: 'rgba(255,255,255,.95)', padding: 22, textAlign: 'center', color: colors.ink, boxShadow: '0 18px 42px rgba(0,0,0,.22)' }}>
                      <div style={{ width: 48, height: 48, borderRadius: '50%', background: colors.accentSoft, color: colors.accent, display: 'grid', placeItems: 'center', margin: '0 auto 12px' }}>
                        <span className="video-status-icon video-status-icon-unlock" role="img" aria-label={`${t('video.unlockToWatch')} ${video.title}`} />
                      </div>
                      <h2 style={{ margin: '0 0 8px', fontSize: 22, lineHeight: 1.25, fontWeight: 900 }}>{anonymous ? t('video.lockedTitle') : t('video.accessRequired')}</h2>
                      <p style={{ margin: '0 0 16px', color: colors.muted, lineHeight: 1.6, fontSize: 14 }}>{anonymous ? t('video.lockedDescription') : t('video.watchRequiresAccount')}</p>
                      <button type="button" onClick={openRequiredAccess} style={{ border: 0, borderRadius: 6, background: colors.accent, color: '#fff', minHeight: 44, padding: '0 22px', fontWeight: 900, fontSize: 15, cursor: 'pointer' }}>{video.requires_phone || (isAuthed() && !user?.phone) ? t('video.addPhone') : (anonymous ? t('video.registerToWatch') : t('video.accessRequired'))}</button>
                    </div>
                  </div>
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
