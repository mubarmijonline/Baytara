import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { auth } from '../lib/api.js';
import { startAudioWatermark } from '../lib/audioWatermark.js';
import { diagEnabled, diagLog } from '../lib/diag.js';

// Player for self-hosted lessons (encrypted HLS from this server). Safari plays HLS
// natively; everywhere else hls.js does. The moving overlay carries the viewer's identity,
// which for local video is our job — there is no provider baking one in.
//
// Same honesty as the backend: this is not DRM. The picture is capturable in any browser.
// The two watermarks are what make a capture traceable.
export default function LocalHlsPlayer({ playback, title, onEnded, onSecurityError }) {
  const videoRef = useRef(null);
  const [offset, setOffset] = useState({ top: '12%', left: '8%' });

  // ---- stream ----
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playback?.url) return undefined;
    let hls;
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
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

    // the native shell tells us a recording started (iOS) — stop playing
    window.__baytaraCaptureChanged = (captured) => {
      video.muted = !!captured;
      if (captured) video.pause();
    };

    return () => {
      Object.entries(handlers).forEach(([name, fn]) => video.removeEventListener(name, fn));
      if (stopWatermark) stopWatermark();
      delete window.__baytaraCaptureChanged;
    };
  }, [playback, onEnded, onSecurityError]);

  // ---- moving identity watermark ----
  useEffect(() => {
    if (!playback?.watermark) return undefined;
    const move = () => setOffset({
      top: `${8 + Math.random() * 76}%`,
      left: `${4 + Math.random() * 55}%`,
    });
    const timer = setInterval(move, 5000);
    return () => clearInterval(timer);
  }, [playback]);

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
      {playback?.watermark && (
        <span
          data-testid="local-video-watermark"
          style={{ position: 'absolute', top: offset.top, left: offset.left, pointerEvents: 'none',
            color: 'rgba(255,255,255,.55)', fontSize: 13, fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,.8)',
            transition: 'top .8s linear, left .8s linear', direction: 'ltr', whiteSpace: 'nowrap' }}
        >
          {playback.watermark}
        </span>
      )}
    </div>
  );
}
