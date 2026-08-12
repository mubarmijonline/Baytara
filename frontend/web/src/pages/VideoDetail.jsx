import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Container } from '../components/Primitives.jsx';
import { auth, isAuthed, useFetch, webapi } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { colors } from '../theme/tokens.js';
import SecureVdoPlayer from '../components/SecureVdoPlayer.jsx';
import LocalHlsPlayer from '../components/LocalHlsPlayer.jsx';
import { primeAudioWatermark } from '../lib/audioWatermark.js';
import CaptureProbe from '../components/CaptureProbe.jsx';
import { useAuth } from '../lib/auth.jsx';

// Playback denials the viewer can act on; anything else falls back to the generic message.
const PLAY_ERROR_KEYS = {
  mac_needs_safari: 'video.macNeedsSafari',
  unsupported_browser: 'video.unsupportedBrowser',
  already_playing: 'video.alreadyPlaying',
  app_required: 'video.appRequired',
  browser_not_supported: 'video.browserNotSupported',
  too_many_requests: 'video.tooManyRequests',
};

export default function VideoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { user } = useAuth();
  const { data, loading, error } = useFetch(() => webapi.video(id), [id]);
  const [playback, setPlayback] = useState(null);
  const [playError, setPlayError] = useState('');
  const [starting, setStarting] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const video = data?.video;
  const anonymous = video && (!isAuthed() || video.requires_auth);

  const play = async () => {
    // must run inside the tap: iOS refuses to start an AudioContext later
    primeAudioWatermark();
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
    <main className="video-detail-page" style={{ background: colors.surfaceMuted, padding: '38px 0 72px' }}>
      <Container>
        <button type="button" onClick={() => navigate('/videos')} style={{ border: 0, background: 'transparent', color: colors.accent, cursor: 'pointer', padding: '8px 0', fontWeight: 800, marginBottom: 16 }}>{t('video.back')}</button>
        <div className="video-detail-grid">
          <section>
            <div className={`video-detail-player${!playback && !video.can_play ? ' video-detail-player-locked' : ''}`}>
              {playback ? (playback.kind === 'local'
                ? <LocalHlsPlayer playback={playback} title={video.title} onSecurityError={() => setPlayError('security')} />
                : <SecureVdoPlayer playback={playback} title={video.title} onSecurityError={() => setPlayError('security')} />) : <>
                {video.poster && !posterFailed && (
                  // a dead poster URL must not leave a broken-image glyph over the player
                  <img className="video-detail-poster" src={video.poster} alt="" draggable={false}
                       onError={() => setPosterFailed(true)} />
                )}
                {video.can_play ? (
                  <button
                    type="button"
                    data-testid="video-touch-target"
                    onClick={play}
                    disabled={starting}
                    aria-label={t('video.watch')}
                    className="video-touch-target video-play-overlay"
                    style={{ cursor: starting ? 'progress' : 'pointer' }}
                  >
                    <span className="video-play-cta">{starting ? t('common.loading') : t('video.watch')}</span>
                  </button>
                ) : (
                  <div className="video-access-veil">
                    <div className="video-access-card">
                      <div className="video-access-icon">
                        <span className="video-status-icon video-status-icon-unlock" role="img" aria-label={`${t('video.unlockToWatch')} ${video.title}`} />
                      </div>
                      <h2>{anonymous ? t('video.lockedTitle') : t('video.accessRequired')}</h2>
                      <p>{anonymous ? t('video.lockedDescription') : t('video.watchRequiresAccount')}</p>
                      <button type="button" className="video-access-button" onClick={openRequiredAccess}>{video.requires_phone || (isAuthed() && !user?.phone) ? t('video.addPhone') : (anonymous ? t('video.registerToWatch') : t('video.accessRequired'))}</button>
                    </div>
                  </div>
                )}
              </>}
            </div>
            {playError && (
              <p role="alert" style={{ color: '#9b2626' }}>
                {t(PLAY_ERROR_KEYS[playError] || 'video.playError')}
              </p>
            )}
          </section>
          <aside style={{ minWidth: 0 }}>
            <div style={{ color: colors.accent, fontSize: 14, fontWeight: 800, marginBottom: 8 }}>{video.category?.name}</div>
            <h1 className="video-detail-title" style={{ margin: '0 0 14px', fontSize: 34, lineHeight: 1.3, fontWeight: 900 }}>{video.title}</h1>
            {video.access_type === 'free' && <span style={{ display: 'inline-block', color: '#176b45', background: '#e8f6ef', padding: '5px 10px', borderRadius: 4, fontWeight: 800, marginBottom: 18 }}>{t('video.freeForAll')}</span>}
            {video.description && <p style={{ margin: 0, color: colors.muted, lineHeight: 1.8, fontSize: 16 }}>{video.description}</p>}
          </aside>
        </div>
      </Container>
      <CaptureProbe />
    </main>
  );
}
