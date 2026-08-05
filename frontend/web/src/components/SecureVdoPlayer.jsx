import { useEffect, useRef } from 'react';
import { auth } from '../lib/api.js';

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
          const type = played ? 'resume' : 'play';
          played = true;
          return report(type);
        },
        pause: async () => {
          playing = false;
          return report('pause');
        },
        timeupdate: async () => {
          if (!playing || Date.now() - lastHeartbeat < 15000) return null;
          lastHeartbeat = Date.now();
          return report('heartbeat');
        },
        ended: async () => {
          playing = false;
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
    }).catch((error) => active && onSecurityError?.(error));

    return () => {
      active = false;
      if (player) {
        subscriptions.forEach(([name, handler]) => player.video.removeEventListener(name, handler));
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
