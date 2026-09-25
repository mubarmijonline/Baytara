import { Maximize, Minimize, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { auth } from '../lib/api.js';
import { startAudioWatermark } from '../lib/audioWatermark.js';
import { diagEnabled, diagLog } from '../lib/diag.js';
import { startActivityGuard } from '../lib/activityGuard.js';

/* ---- the control bar ------------------------------------------------------------------
   Our own, because the browser's could not be made to work here.

   The native bar's fullscreen button puts the <video> element full screen, and the
   identity watermark is a sibling of that element, so it is left behind on the page. The
   previous attempt caught that and redirected full screen onto the container, which failed
   in the two places it was most needed: on Android the re-request landed outside the user
   gesture and was refused, so the picture flashed and came back (the "lag then nothing"),
   and on an iPhone there is no element full screen at all, so the video simply opened in
   iOS's own player where no overlay can follow it.

   With `controls` off, the video has no way to escape on its own. The bar below looks and
   behaves like the standard one, and its full screen button acts on the shell.
*/
function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function ControlBar({ videoRef, shellRef, fullscreen, onToggleFullscreen }) {
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    const sync = () => {
      setPlaying(!video.paused && !video.ended);
      setCurrent(video.currentTime || 0);
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      setMuted(video.muted);
    };
    const events = ['play', 'pause', 'timeupdate', 'durationchange', 'volumechange', 'ended', 'loadedmetadata'];
    events.forEach((name) => video.addEventListener(name, sync));
    sync();
    return () => events.forEach((name) => video.removeEventListener(name, sync));
  }, [videoRef]);

  // Read at call time, never captured during render: on the first render the ref is still
  // null, so a captured `video` left the very first tap on play doing nothing at all.
  const percent = duration > 0 ? (current / duration) * 100 : 0;

  // flex: 'none' matters more than it looks. These sit at the end of a flex row, and the
  // fullscreen button is the very last item: let the row overflow and that button is the
  // one pushed out of the box, where the stage's `overflow: hidden` clips it. The bar then
  // shows play, timeline and volume and silently loses full screen, which is exactly what
  // a narrow player looks like.
  const btn = {
    background: 'transparent', border: 0, color: '#fff', cursor: 'pointer',
    padding: 6, display: 'grid', placeItems: 'center', lineHeight: 1, flex: 'none',
  };

  return (
    <div
      className="local-player-bar"
      // Stops a tap on the bar counting as a tap on the picture.
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute', insetInline: 0, bottom: 0, zIndex: 4,
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
        // Nothing here may push a control out of the box.
        flexWrap: 'nowrap', overflow: 'hidden', maxWidth: '100%', boxSizing: 'border-box',
        background: 'linear-gradient(transparent, rgba(0,0,0,.72))',
        direction: 'ltr',
      }}
    >
      <button type="button" style={btn} aria-label={playing ? 'إيقاف مؤقت' : 'تشغيل'}
        data-testid="local-video-play"
        onClick={() => {
          const video = videoRef.current;
          if (!video) return;
          if (playing) video.pause(); else video.play();
        }}>
        {playing ? <Pause size={20} /> : <Play size={20} />}
      </button>

      {/* Hidden below 360px of bar rather than allowed to squeeze the controls out. */}
      <span className="local-player-time"
        style={{ color: '#fff', fontSize: 12.5, fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap', flex: 'none' }}>
        {formatTime(current)} / {formatTime(duration)}
      </span>

      <input
        type="range" min="0" max="100" step="0.1" value={percent}
        aria-label="موضع التشغيل"
        onChange={(e) => {
          const video = videoRef.current;
          if (video && duration > 0) video.currentTime = (Number(e.target.value) / 100) * duration;
        }}
        style={{ flex: '1 1 40px', minWidth: 0, accentColor: '#3048A0', cursor: 'pointer' }}
      />

      <button type="button" style={btn} aria-label={muted ? 'تشغيل الصوت' : 'كتم الصوت'}
        onClick={() => {
          const video = videoRef.current;
          if (video) video.muted = !video.muted;
        }}>
        {muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
      </button>

      {/* The same icon as before, and the only one. It acts on the shell, so the
          watermark goes full screen with the picture. */}
      <button type="button" style={btn} data-testid="local-video-fullscreen"
        aria-label={fullscreen ? 'إنهاء ملء الشاشة' : 'ملء الشاشة'}
        onClick={onToggleFullscreen}>
        {fullscreen ? <Minimize size={19} /> : <Maximize size={19} />}
      </button>
    </div>
  );
}

// Player for self-hosted lessons (encrypted HLS from this server). Safari plays HLS
// natively; everywhere else hls.js does. The moving overlay carries the viewer's identity,
// which for local video is our job — there is no provider baking one in.
//
// Same honesty as the backend: this is not DRM. The picture is capturable in any browser.
// The two watermarks are what make a capture traceable.
export default function LocalHlsPlayer({ playback, title, onEnded, onSecurityError }) {
  const videoRef = useRef(null);
  const shellRef = useRef(null);
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

    // Only a video that actually enforces the capture rule is worth guarding. A free
    // lesson plays in any browser by design, so watching for screenshots on one produced
    // nothing but noise -- and every one of those reports counted toward the account's
    // fifteen-minute playback block.
    const stopGuard = !playback.capture_protected ? null : startActivityGuard({
      onCaptureAttempt: (reason, { pause = true } = {}) => {
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
        if (!pause) return;
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
      // Tab switched, window blurred, phone locked. Stop playing to nobody, but this is
      // not an offence: no report, no strike, and no notice to argue with on return.
      onInterrupted: () => { if (!video.paused) video.pause(); },
    });

    // the native shell tells us a recording started (iOS) — stop playing
    window.__baytaraCaptureChanged = (captured) => {
      video.muted = !!captured;
      if (captured) video.pause();
    };

    return () => {
      Object.entries(handlers).forEach(([name, fn]) => video.removeEventListener(name, fn));
      if (stopWatermark) stopWatermark();
      if (stopGuard) stopGuard();
      delete window.__baytaraCaptureChanged;
    };
  }, [playback, onEnded, onSecurityError]);

  // ---- resume cooldown ----
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // ---- fullscreen ----
  //
  // The shell goes full screen, never the <video>. The watermark is a sibling of the video
  // element, so a video that goes full screen on its own leaves the identity mark behind
  // on the page -- at the moment it matters most.
  //
  // Catching the browser's own request and redirecting it was tried and failed in the two
  // places it was needed most: on Android the re-request landed outside the user gesture
  // and was refused, so the picture flashed and came back, and an iPhone has no element
  // full screen at all, so the video opened in iOS's own player where no overlay follows.
  //
  // So the native controls are off entirely and the bar is ours. There is nothing left
  // that can put the bare video full screen.
  const [fullscreen, setFullscreen] = useState(false);

  // iOS on iPhone has no Element.requestFullscreen. The fallback is what every web player
  // does there: pin the shell over the viewport with CSS. It is not the OS full screen,
  // but it fills the screen and, unlike the native player, it carries the watermark.
  const canElementFullscreen = typeof document !== 'undefined'
    && (document.fullscreenEnabled || document.webkitFullscreenEnabled);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    const onChange = () => {
      const active = document.fullscreenElement || document.webkitFullscreenElement || null;
      setFullscreen(Boolean(active));
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  // The page must not scroll behind a pinned player, and the class has to come off if the
  // component unmounts while pinned.
  useEffect(() => {
    if (!pinned) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [pinned]);

  const toggleFullscreen = () => {
    const shell = shellRef.current;
    if (!shell) return;
    if (!canElementFullscreen) {
      setPinned((on) => !on);
      setFullscreen((on) => !on);
      return;
    }
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
      return;
    }
    // Called straight from the click, so the user gesture is intact -- which is exactly
    // what the old redirect lost.
    const request = shell.requestFullscreen || shell.webkitRequestFullscreen;
    try {
      const result = request?.call(shell);
      if (result?.catch) {
        result.catch(() => {
          // Refused: fall back to pinning rather than leaving the button doing nothing.
          diagLog('FULLSCREEN', 'element request refused; pinning instead');
          setPinned(true);
          setFullscreen(true);
        });
      }
    } catch {
      setPinned(true);
      setFullscreen(true);
    }
  };

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
    <div ref={shellRef}
         className={`secure-video-shell${pinned ? ' secure-video-shell-pinned' : ''}`}
         data-testid="local-video-shell"
         onContextMenu={(e) => e.preventDefault()} onDragStart={(e) => e.preventDefault()}>
      <video
        ref={videoRef}
        title={title}
        // No native controls: they are the only thing that could put the bare video full
        // screen, and on iOS that means handing it to a player no overlay can reach.
        // `playsInline` is what stops iOS doing that on play as well.
        playsInline
        controlsList="nodownload noplaybackrate"
        disablePictureInPicture
        onClick={() => {
          const video = videoRef.current;
          if (!video) return;
          if (video.paused) video.play(); else video.pause();
        }}
        style={{ background: '#000', cursor: 'pointer' }}
      />
      {!halted && (
        <ControlBar videoRef={videoRef} shellRef={shellRef} fullscreen={fullscreen}
          onToggleFullscreen={toggleFullscreen} />
      )}
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
