import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { auth } from '../lib/api.js';
import { startAudioWatermark } from '../lib/audioWatermark.js';
import { diagEnabled, diagLog } from '../lib/diag.js';
import { startActivityGuard } from '../lib/activityGuard.js';

// Player for self-hosted lessons (encrypted HLS from this server). Safari plays HLS
// natively; everywhere else hls.js does. The moving overlay carries the viewer's identity,
// which for local video is our job — there is no provider baking one in.
//
// Same honesty as the backend: this is not DRM. The picture is capturable in any browser.
// The two watermarks are what make a capture traceable.
export default function LocalHlsPlayer({ playback, title, onEnded, onSecurityError }) {
  const videoRef = useRef(null);
  const [offset, setOffset] = useState({ top: '12%', left: '8%' });
  const [halted, setHalted] = useState('');
  const [strikes, setStrikes] = useState(0);      // suspicious events in this session
  const [cooldown, setCooldown] = useState(0);    // seconds before resume is allowed
  const [terminated, setTerminated] = useState(false);

  // ---- stream ----
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playback?.url) return undefined;
    let hls;
    // hls.js first: Chromium answers "maybe" to the HLS MIME type but cannot actually
    // play it, which leaves the element with MEDIA_ERR_SRC_NOT_SUPPORTED. Native HLS is
    // the fallback for Safari/iOS, where hls.js is unsupported.
    if (!Hls.isSupported() && video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = playback.url;                       // Safari / iOS
    } else if (Hls.isSupported()) {
      hls = new Hls({ maxBufferLength: 30 });
      hls.loadSource(playback.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_, data) => {
        diagLog('HLS error', `${data.type}/${data.details} fatal=${data.fatal}`);
        if (data.fatal) onSecurityError?.(new Error(data.details));
      });
    } else {
      onSecurityError?.(new Error('hls_unsupported'));
      return undefined;
    }
    const resume = Math.max(0, Math.round(Number(playback.resume_position_seconds) || 0));
    if (resume > 0) {
      const seek = () => { try { video.currentTime = resume; } catch { /* ignore */ } };
      video.addEventListener('loadedmetadata', seek, { once: true });
    }
    return () => { if (hls) hls.destroy(); };
  }, [playback, onSecurityError]);

  // ---- session reporting + audio watermark ----
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playback?.session_id) return undefined;
    let stopWatermark = null;
    let played = false;
    let lastBeat = 0;

    const send = (type) => auth.playbackEvent(playback.session_id, {
      event_id: (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())),
      type,
      position_seconds: Math.max(0, Math.round(video.currentTime || 0)),
      duration_seconds: Math.max(1, Math.round(video.duration || 1)),
      watched_seconds: Math.max(0, Math.round(video.currentTime || 0)),
      covered_seconds: Math.max(0, Math.round(video.currentTime || 0)),
    }).catch((e) => onSecurityError?.(e));

    const handlers = {
      play: () => {
        if (!stopWatermark) stopWatermark = startAudioWatermark(playback.audio_mark);
        if (diagEnabled()) diagLog('LOCAL play', `t=${video.currentTime.toFixed(1)}`);
        send(played ? 'resume' : 'play');
        played = true;
      },
      pause: () => {
        if (stopWatermark) { stopWatermark(); stopWatermark = null; }
        send('pause');
      },
      timeupdate: () => {
        if (video.paused || Date.now() - lastBeat < 15000) return;
        lastBeat = Date.now();
        send('heartbeat');
      },
      ended: () => {
        if (stopWatermark) { stopWatermark(); stopWatermark = null; }
        send('ended');
        onEnded?.();
      },
    };
    Object.entries(handlers).forEach(([name, fn]) => video.addEventListener(name, fn));

    // watch for the behaviour that surrounds a capture attempt: pause, and record it
    const stopGuard = startActivityGuard({
      onSuspicious: (reason) => {
        diagLog('SUSPICIOUS', reason);
        auth.playbackEvent(playback.session_id, {
          event_id: (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())),
          type: 'suspicious',
          position_seconds: Math.max(0, Math.round(video.currentTime || 0)),
          duration_seconds: Math.max(1, Math.round(video.duration || 1)),
          watched_seconds: Math.max(0, Math.round(video.currentTime || 0)),
          covered_seconds: Math.max(0, Math.round(video.currentTime || 0)),
          metadata: { reason },   // whitelisted server-side
        }).catch(() => { /* the pause already happened; never break playback on a report */ });
      },
      onPause: (reason) => {
        if (!video.paused) video.pause();
        setHalted(reason);
        setStrikes((count) => {
          const next = count + 1;
          if (next >= 2) {
            // second offence: the stream ends. Resuming needs a fresh page and a fresh
            // token, so leaving to start a recorder is no longer a two-second detour.
            setTerminated(true);
            try { video.pause(); video.removeAttribute('src'); video.load(); } catch { /* gone */ }
          } else {
            setCooldown(20);
          }
          return next;
        });
      },
    });

    // the native shell tells us a recording started (iOS) — stop playing
    window.__baytaraCaptureChanged = (captured) => {
      video.muted = !!captured;
      if (captured) video.pause();
    };

    return () => {
      Object.entries(handlers).forEach(([name, fn]) => video.removeEventListener(name, fn));
      if (stopWatermark) stopWatermark();
      stopGuard();
      delete window.__baytaraCaptureChanged;
    };
  }, [playback, onEnded, onSecurityError]);

  // ---- resume cooldown ----
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // ---- moving identity watermark ----
  useEffect(() => {
    if (!playback?.watermark) return undefined;
    const move = () => setOffset({
      top: `${8 + Math.random() * 76}%`,
      left: `${4 + Math.random() * 55}%`,
    });
    const timer = setInterval(move, strikes > 0 ? 1500 : 5000);
    return () => clearInterval(timer);
  }, [playback, strikes]);

  return (
    <div className="secure-video-shell" data-testid="local-video-shell"
         onContextMenu={(e) => e.preventDefault()} onDragStart={(e) => e.preventDefault()}>
      <video
        ref={videoRef}
        title={title}
        controls
        playsInline
        controlsList="nodownload noplaybackrate"
        disablePictureInPicture
        style={{ width: '100%', height: '100%', display: 'block', background: '#000' }}
      />
      {halted && (
        <div data-testid="local-video-halted"
             style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 20,
               background: 'rgba(16,21,44,.92)', color: '#fff', textAlign: 'center' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 17, marginBottom: 8 }}>
              {terminated ? 'انتهت جلسة المشاهدة' : 'تم إيقاف التشغيل مؤقتاً'}
            </div>
            <div style={{ fontSize: 13, color: '#c9c9dc', marginBottom: 14, lineHeight: 1.7 }}>
              {terminated
                ? 'تكرر النشاط غير المسموح، فأُنهيت الجلسة وسُجّلت على حسابك. أعد تحميل الصفحة للمتابعة.'
                : 'رصدنا نشاطاً غير مسموح أثناء المشاهدة، وسُجّل على حسابك.'}
            </div>
            {terminated ? (
              <button type="button" onClick={() => window.location.reload()}
                style={{ border: 0, borderRadius: 8, background: '#3048A0', color: '#fff', fontWeight: 800,
                  minHeight: 42, padding: '0 20px', cursor: 'pointer' }}>
                إعادة تحميل الصفحة
              </button>
            ) : (
              <button type="button" disabled={cooldown > 0}
                onClick={() => { setHalted(''); videoRef.current?.play(); }}
                style={{ border: 0, borderRadius: 8, background: cooldown > 0 ? '#5a6180' : '#3048A0',
                  color: '#fff', fontWeight: 800, minHeight: 42, padding: '0 20px',
                  cursor: cooldown > 0 ? 'not-allowed' : 'pointer' }}>
                {cooldown > 0 ? `متابعة المشاهدة بعد ${cooldown} ثانية` : 'متابعة المشاهدة'}
              </button>
            )}
          </div>
        </div>
      )}
      {playback?.watermark && (
        <span
          data-testid="local-video-watermark"
          style={{ position: 'absolute', top: offset.top, left: offset.left, pointerEvents: 'none',
            color: strikes > 0 ? 'rgba(255,255,255,.92)' : 'rgba(255,255,255,.55)',
            fontSize: strikes > 0 ? 20 : 13, fontWeight: 900, textShadow: '0 2px 6px rgba(0,0,0,.95)',
            transition: 'top .8s linear, left .8s linear', direction: 'ltr', whiteSpace: 'nowrap' }}
        >
          {playback.watermark}
        </span>
      )}
    </div>
  );
}
