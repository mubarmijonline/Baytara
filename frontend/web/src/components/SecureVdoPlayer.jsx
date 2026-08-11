import { useEffect, useRef } from 'react';
import { auth } from '../lib/api.js';
import { startAudioWatermark } from '../lib/audioWatermark.js';
import { diagEnabled, diagLog } from '../lib/diag.js';

const PLAYER_API_URL = 'https://player.vdocipher.com/v2/api.js';
let playerApiPromise;

function loadPlayerApi() {
  if (window.VdoPlayer) return Promise.resolve(window.VdoPlayer);
  if (playerApiPromise) return playerApiPromise;
  playerApiPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${PLAYER_API_URL}"]`);
    const script = existing || document.createElement('script');
    const previousReady = window.onVdoPlayerV2APIReady;
    window.onVdoPlayerV2APIReady = () => {
      if (typeof previousReady === 'function') previousReady();
      if (window.VdoPlayer) resolve(window.VdoPlayer);
    };
    script.addEventListener('load', () => window.VdoPlayer && resolve(window.VdoPlayer), { once: true });
    script.addEventListener('error', () => reject(new Error('player_api_failed')), { once: true });
    if (!existing) {
      script.src = PLAYER_API_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  });
  return playerApiPromise;
}

function eventId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else bytes.forEach((_, index) => { bytes[index] = Math.floor(Math.random() * 256); });
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function playerUrl(playback) {
  return `https://player.vdocipher.com/v2/?otp=${encodeURIComponent(playback.otp)}&playbackInfo=${encodeURIComponent(playback.playbackInfo)}`;
}

export default function SecureVdoPlayer({ playback, title, onEnded, onSecurityError }) {
  const iframeRef = useRef(null);

  useEffect(() => {
    const blockShortcut = (event) => {
      const key = String(event.key || '').toLowerCase();
      if (
        key === 'printscreen'
        || ((event.ctrlKey || event.metaKey) && ['p', 's', 'u'].includes(key))
      ) {
        event.preventDefault();
      }
    };
    document.addEventListener('keydown', blockShortcut);
    return () => document.removeEventListener('keydown', blockShortcut);
  }, []);

  useEffect(() => {
    if (!playback?.session_id || !iframeRef.current) return undefined;
    let active = true;
    let player;
    let played = false;
    let playing = false;
    let lastHeartbeat = Date.now();
    let stopWatermark = null;
    const subscriptions = [];

    const send = async (payload) => {
      let failure;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          return await auth.playbackEvent(playback.session_id, payload);
        } catch (error) {
          failure = error;
          if (error.status && error.status < 500) break;
        }
      }
      if (active) onSecurityError?.(failure);
      return null;
    };

    const report = async (type, metadata) => {
      if (!player || !active) return null;
      const [position, duration, watched, covered] = await Promise.all([
        Promise.resolve(player.video.currentTime || 0),
        Promise.resolve(player.video.duration || 0),
        player.api.getTotalPlayed(),
        player.api.getTotalCovered(),
      ]);
      return send({
        event_id: eventId(),
        type,
        position_seconds: Math.max(0, Math.round(Number(position) || 0)),
        duration_seconds: Math.max(1, Math.round(Number(duration) || 0)),
        watched_seconds: Math.max(0, Math.round(Number(watched) || 0)),
        covered_seconds: Math.max(0, Math.round(Number(covered) || 0)),
        ...(metadata ? { metadata } : {}),
      });
    };

    loadPlayerApi().then((VdoPlayer) => {
      if (!active) return;
      player = VdoPlayer.getInstance(iframeRef.current);
      const resumeAt = Math.max(0, Math.round(Number(playback.resume_position_seconds) || 0));
      if (resumeAt > 0) {
        try {
          player.video.currentTime = resumeAt;
        } catch {
          // Some browser/player states reject early seeks; user can still continue manually.
        }
      }
      const handlers = {
        play: async () => {
          playing = true;
          lastHeartbeat = Date.now();
          // inaudible account watermark rides in the audio mix a recorder captures
          if (!stopWatermark) stopWatermark = startAudioWatermark(playback.audio_mark);
          const type = played ? 'resume' : 'play';
          played = true;
          return report(type);
        },
        pause: async () => {
          playing = false;
          if (stopWatermark) { stopWatermark(); stopWatermark = null; }
          return report('pause');
        },
        timeupdate: async () => {
          if (!playing || Date.now() - lastHeartbeat < 15000) return null;
          lastHeartbeat = Date.now();
          return report('heartbeat');
        },
        ended: async () => {
          playing = false;
          if (stopWatermark) { stopWatermark(); stopWatermark = null; }
          await report('ended');
          if (active) onEnded?.();
        },
        error: async () => {
          playing = false;
          return report('player_error', { error_code: 'player_error' });
        },
      };
      Object.entries(handlers).forEach(([name, handler]) => {
        player.video.addEventListener(name, handler);
        subscriptions.push([name, handler]);
      });

      // ?diag=1 — log what the player itself notices. If a blanked picture is observable
      // anywhere, it is here: the player owns the DRM key session.
      if (diagEnabled()) {
        const watched = ['play', 'pause', 'waiting', 'stalled', 'seeking', 'seeked', 'ratechange',
                         'error', 'ended', 'emptied', 'suspend', 'volumechange'];
        watched.forEach((name) => {
          const probe = () => diagLog('PLAYER ' + name,
            `t=${(player.video.currentTime || 0).toFixed(1)} paused=${player.video.paused} muted=${player.video.muted}`);
          player.video.addEventListener(name, probe);
          subscriptions.push([name, probe]);
        });
        try {
          ['statusChange', 'videoQualityChange', 'videoAdaptivenessChange', 'fullscreenChange'].forEach((name) => {
            player.addEventListener(name, (event) => diagLog('VDO ' + name, JSON.stringify(event || {}).slice(0, 160)));
          });
        } catch {
          diagLog('VDO listeners unavailable');
        }
        let lastTime = 0;
        const drift = setInterval(() => {
          const now = player.video.currentTime || 0;
          diagLog('PLAYER tick', `t=${now.toFixed(1)} advanced=${(now - lastTime).toFixed(2)}s paused=${player.video.paused}`);
          lastTime = now;
        }, 2000);
        subscriptions.push(['__interval', () => clearInterval(drift)]);
      }
    }).catch((error) => active && onSecurityError?.(error));

    // The native shell (Capacitor) calls this when iOS reports the screen is being
    // recorded or mirrored. iOS cannot strip audio from a recording, so the only real
    // defence is to stop playing: pause and mute until the recording ends.
    window.__baytaraCaptureChanged = (captured) => {
      if (!player) return;
      try {
        player.video.muted = !!captured;
        if (captured) player.video.pause();
      } catch {
        // player torn down mid-notification; the shell's cover still hides the page
      }
    };

    return () => {
      active = false;
      if (stopWatermark) stopWatermark();
      delete window.__baytaraCaptureChanged;
      if (player) {
        subscriptions.forEach(([name, handler]) => {
          if (name === '__interval') handler();
          else player.video.removeEventListener(name, handler);
        });
      }
    };
  }, [playback, onEnded, onSecurityError]);

  const preventBrowserCaptureAction = (event) => event.preventDefault();

  return (
    <div
      className="secure-video-shell"
      data-testid="secure-video-shell"
      onContextMenu={preventBrowserCaptureAction}
      onDragStart={preventBrowserCaptureAction}
    >
    <iframe
      ref={iframeRef}
      title={title}
      src={playerUrl(playback)}
      allow="encrypted-media; fullscreen"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
      style={{ width: '100%', height: '100%', border: 0 }}
    />
    </div>
  );
}
