import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import CurriculumAccordion from '../components/CurriculumAccordion.jsx';
import LibraryBrowser from '../components/LibraryBrowser.jsx';
import SecureVdoPlayer from '../components/SecureVdoPlayer.jsx';
import LocalHlsPlayer from '../components/LocalHlsPlayer.jsx';
import NotFound from './NotFound.jsx';
import { colors, gradients } from '../theme/tokens.js';
import { auth, isAuthed, useFetch, webapi } from '../lib/api.js';
import { primeAudioWatermark } from '../lib/audioWatermark.js';
import { captureProtected, useBrowserSupport } from '../lib/browserSupport.js';
import BrowserGuidance from '../components/BrowserGuidance.jsx';
import { useI18n } from '../lib/i18n.jsx';

const DARK = colors.utilityBar;
const PLAYER_BG = '#0d1430';

// Backend refusal codes that carry their own explanation. Anything else falls back to
// the generic message; a 403 means "not enrolled".
const PLAYBACK_ERRORS = [
  'no_api_key', 'mac_needs_safari', 'mac_needs_chrome', 'unsupported_browser', 'browser_not_supported',
  'app_required', 'suspicious_activity', 'already_playing', 'too_many_requests', 'access_expired',
  // Audience and account refusals. Without these a vet-only video refused to an unverified
  // account fell through to the 403 default -- "subscribe to the course" -- which sent people
  // to pay for something they needed to verify for instead.
  'needs_baytarian', 'non_veterinarians_only', 'phone_required', 'not_entitled',
];

function playbackMessage(error, t) {
  const code = error?.data?.error;
  if (PLAYBACK_ERRORS.includes(code)) return t(`video.err.${code}`);
  if (error?.status === 403) return t('video.err.forbidden');
  return t('video.err.generic');
}

export default function Learn() {
  const { courseId, lessonId } = useParams();   // courseId carries the course slug
  const navigate = useNavigate();
  const { t } = useI18n();

  const { data, error, loading } = useFetch(() => webapi.course(courseId), [courseId]);
  const course = data?.course;

  const [progress, setProgress] = useState(null);
  const [doneIds, setDoneIds] = useState({});
  const [video, setVideo] = useState(null);      // { otp, playbackInfo, session_id, … }
  const [videoErr, setVideoErr] = useState('');
  const [tab, setTab] = useState('course');

  useEffect(() => {
    if (!isAuthed()) return undefined;
    let alive = true;
    auth.progressGet(courseId)
      .then((r) => {
        if (!alive) return;
        setProgress(r);
        const done = {};
        Object.entries(r.lessons || {}).forEach(([id, entry]) => { if (entry.completed) done[id] = true; });
        setDoneIds(done);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [courseId]);

  const videos = useMemo(() => course?.videos || [], [course]);
  const activeLesson = useMemo(
    () => videos.find((v) => String(v.id) === String(lessonId)) || videos[0] || null,
    [videos, lessonId],
  );
  const index = activeLesson ? videos.findIndex((v) => v.id === activeLesson.id) : -1;

  // Asked once per page load. A protected lesson on a browser the server would refuse
  // gets the guidance screen instead of a mint that fails; a free one plays anyway.
  const caps = useBrowserSupport();
  const blockedHere = Boolean(caps?.blocked && captureProtected(activeLesson));

  // Fresh DRM OTP whenever the active lesson changes. The guard is what keeps a locked
  // or anonymous viewer from ever hitting /video/playback.
  useEffect(() => {
    setVideo(null);
    setVideoErr('');
    if (!course || !isAuthed() || !activeLesson?.id || !activeLesson.has_video) return undefined;
    if (!caps || blockedHere) return undefined;
    let alive = true;
    auth.playback(activeLesson.id, course.id)
      .then((r) => alive && setVideo(r))
      .catch((e) => alive && setVideoErr(playbackMessage(e, t)));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLesson?.id, course?.id, caps, blockedHere]);

  const completeCurrent = useCallback(async () => {
    if (!activeLesson?.id || !isAuthed()) return;
    try {
      await auth.progress({ lesson_id: activeLesson.id, course_id: course?.id, completed: true });
      setDoneIds((current) => ({ ...current, [activeLesson.id]: true }));
      const refreshed = await auth.progressGet(courseId);
      setProgress(refreshed);
    } catch { /* a failed mark must not break playback */ }
  }, [activeLesson?.id, course?.id, courseId]);

  const openLesson = useCallback((next) => {
    primeAudioWatermark();               // iOS unlocks audio only inside a user gesture
    navigate(`/learn/${courseId}/${next.id}`);
  }, [courseId, navigate]);

  async function completeAndNext() {
    await completeCurrent();
    const next = videos[index + 1];
    if (next) openLesson(next);
  }

  if (loading) return <div style={{ padding: '40px 24px', color: colors.muted }}>{t('common.loading')}</div>;
  if (error || !course) return <NotFound />;

  const percent = progress?.percent ?? 0;
  // The exam is the last step of a course that sets one, so it belongs here rather than
  // only on the course page: this is the screen someone is on when they finish.
  const examReady = Boolean(course?.has_exam) && percent >= 100;
  const watched = activeLesson ? (progress?.lessons?.[activeLesson.id]?.watched_seconds || 0) : 0;
  const done = activeLesson ? !!doneIds[activeLesson.id] : false;
  const status = done ? t('learn.completed') : watched > 0 ? t('learn.inProgress') : null;

  return (
    <div style={{ background: PLAYER_BG, minHeight: '100vh' }}>
      {/* ---- lesson bar ---- */}
      <div style={{ background: DARK, color: '#fff', padding: '0 24px', minHeight: 64, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.13)', borderRadius: 11, padding: '8px 14px' }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>{course.title}</div>
          {index >= 0 && (
            <div style={{ fontSize: 11.5, color: '#a7aec9', marginTop: 2 }}>
              {t('learn.lessonOf', { n: index + 1, total: videos.length })}
            </div>
          )}
        </div>
        {isAuthed() && (
          <div style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.13)', borderRadius: 10, padding: '9px 14px' }}>
            <span className="hide-sm" style={{ width: 120, height: 6, borderRadius: 100, background: 'rgba(255,255,255,.16)', overflow: 'hidden' }}>
              <span style={{ display: 'block', width: `${percent}%`, height: '100%', background: colors.gold }} />
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>{percent}%</span>
          </div>
        )}
        {examReady && (
          <Link to={`/courses/${courseId}/exam`}
            style={{ marginInlineStart: 10, background: colors.gold, color: '#1a1a1a',
              padding: '10px 18px', borderRadius: 10, fontWeight: 800, fontSize: 13,
              textDecoration: 'none', whiteSpace: 'nowrap' }}>
            {t('course.takeExam')}
          </Link>
        )}
      </div>

      <div className="grid-collapse-2" style={{ display: 'grid', gridTemplateColumns: '1fr 350px', alignItems: 'start' }}>
        {/* ---- player column ---- */}
        <div style={{ background: PLAYER_BG, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div className="player-stage" style={{ background: gradients.darkPanel }}>
            {video ? (
              // Two delivery paths, one player contract: VdoCipher when the lesson has
              // a provider id, our own encrypted HLS when the file lives on this server.
              (() => {
                const Player = video.kind === 'local' ? LocalHlsPlayer : SecureVdoPlayer;
                return (
                  <Player
                    playback={video}
                    title={activeLesson?.title || course.title}
                    onEnded={completeCurrent}
                    onSecurityError={() => setVideoErr(t('video.err.generic'))}
                  />
                );
              })()
            ) : blockedHere ? (
              <BrowserGuidance caps={caps} mode="block" />
            ) : (
              <>
                <span aria-hidden="true" style={{ width: 74, height: 74, borderRadius: '50%', background: 'rgba(48,72,160,.92)', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 22 }}>▶</span>
                <span style={{ position: 'absolute', insetInline: 0, bottom: 0, padding: '12px 18px', background: 'linear-gradient(transparent, rgba(0,0,0,.7))', color: '#cfcfe0', fontSize: 12 }}>
                  {videoErr || (activeLesson?.has_video ? t('learn.loadingVideo') : t('learn.previewOnly'))}
                </span>
              </>
            )}
            <span style={{ position: 'absolute', top: 14, insetInlineEnd: 14, background: 'rgba(20,30,66,.7)', border: '1px solid rgba(255,255,255,.15)', color: '#cfcfe0', fontSize: 11, padding: '5px 10px', borderRadius: 7 }}>
              {t('video.protectedPlayback')}
            </span>
          </div>
          {!captureProtected(activeLesson) && <BrowserGuidance caps={caps} mode="nudge" />}

          <div style={{ flex: 1, background: colors.surface, padding: '24px 26px 30px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18, marginBottom: 18, flexWrap: 'wrap' }}>
              <div>
                <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700, color: DARK }}>
                  {activeLesson?.title || course.title}
                </h1>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {index >= 0 && (
                    <span style={{ background: colors.surfaceAlt, borderRadius: 8, padding: '6px 11px', fontSize: 12.5, color: colors.muted, fontWeight: 600 }}>
                      {t('learn.lessonOf', { n: index + 1, total: videos.length })}
                    </span>
                  )}
                  {activeLesson?.duration_minutes > 0 && (
                    <span style={{ background: colors.surfaceAlt, borderRadius: 8, padding: '6px 11px', fontSize: 12.5, color: colors.muted, fontWeight: 600 }}>
                      {activeLesson.duration_minutes} {t('common.minutesShort')}
                    </span>
                  )}
                  {status && (
                    <span style={{ background: '#e8f4ee', borderRadius: 8, padding: '6px 11px', fontSize: 12.5, color: '#1a7f4b', fontWeight: 700 }}>{status}</span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
                <Link to={`/courses/${course.slug}`} style={{ border: `1.5px solid #d6d9e4`, color: colors.ink, fontSize: 14, fontWeight: 600, padding: '11px 18px', borderRadius: 10 }}>
                  ← {t('learn.backToCourse')}
                </Link>
                <button type="button" onClick={completeAndNext}
                  style={{ background: colors.accent, color: '#fff', fontSize: 14, fontWeight: 700, padding: '11px 20px', borderRadius: 10, border: 'none', cursor: 'pointer' }}>
                  {t('learn.completeNext')}
                </button>
              </div>
            </div>

            <div style={{ border: `1px solid ${colors.line}`, borderRadius: 12, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {course.category && (
                <span style={{ background: colors.surfaceAlt, borderRadius: 8, padding: '7px 12px', fontSize: 12.5, color: colors.muted, fontWeight: 600 }}>{course.category.name}</span>
              )}
              {course.instructor && (
                <span style={{ background: colors.surfaceAlt, borderRadius: 8, padding: '7px 12px', fontSize: 12.5, color: colors.muted, fontWeight: 600 }}>{course.instructor.name}</span>
              )}
              <span style={{ marginInlineStart: 'auto', background: colors.accentSoft, color: colors.accent, borderRadius: 8, padding: '7px 12px', fontSize: 12.5, fontWeight: 700 }}>
                {t('learn.protected')}
              </span>
            </div>

            {activeLesson?.description && (
              <p style={{ margin: '18px 0 0', fontSize: 14.5, lineHeight: 1.85, color: colors.ink2, whiteSpace: 'pre-line' }}>
                {activeLesson.description}
              </p>
            )}
          </div>
        </div>

        {/* ---- sidebar ---- */}
        <aside style={{ background: colors.surface, borderInlineStart: `1px solid ${colors.line}`, minHeight: '100%' }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${colors.line}`, display: 'flex', gap: 18, fontSize: 13.5, fontWeight: 700, color: colors.muted2 }}>
            {[['course', t('learn.thisCourse')], ['all', t('learn.allContent')]].map(([key, label]) => (
              <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 10px',
                  color: tab === key ? DARK : colors.muted2, fontWeight: 700, fontSize: 13.5,
                  borderBottom: tab === key ? `3px solid ${colors.accent}` : '3px solid transparent',
                }}>
                {label}
              </button>
            ))}
          </div>

          <div style={{ padding: '12px 16px 24px' }}>
            {tab === 'course' ? (
              <CurriculumAccordion
                dense
                modules={course.modules || []}
                activeId={activeLesson?.id ?? null}
                doneIds={doneIds}
                onSelect={openLesson}
              />
            ) : (
              <LibraryBrowser defaultCategory={course.category?.slug || ''} />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
