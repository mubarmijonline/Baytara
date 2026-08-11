import { useEffect, useState } from 'react';
import { diagEnabled, diagLog, diagLines, diagSubscribe } from '../lib/diag.js';

// Floating probe panel shown only with ?diag=1. Samples every signal a page could
// plausibly notice while the screen is being recorded, alongside the player events
// logged from SecureVdoPlayer. Read the timeline after a recorded run.
export default function CaptureProbe() {
  const [lines, setLines] = useState([]);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!diagEnabled()) return undefined;

    diagLog('PROBE START', navigator.userAgent);
    diagLog('baseline', `dpr=${devicePixelRatio} screen=${screen.width}x${screen.height} viewport=${innerWidth}x${innerHeight}`);

    const lifecycle = ['visibilitychange', 'blur', 'focus', 'pagehide', 'pageshow', 'freeze', 'resume'];
    const offs = lifecycle.map((name) => {
      const target = name === 'visibilitychange' ? document : window;
      const handler = () => diagLog('EVENT ' + name, `visible=${document.visibilityState} focus=${document.hasFocus()}`);
      target.addEventListener(name, handler);
      return () => target.removeEventListener(name, handler);
    });
    const onResize = () => diagLog('EVENT resize', `${innerWidth}x${innerHeight} dpr=${devicePixelRatio}`);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    // frame timing: an encoder running over every frame can show up as jitter
    let raf, last = performance.now(), worst = 0, sum = 0, samples = 0;
    const frame = (now) => {
      const delta = now - last; last = now;
      worst = Math.max(worst, delta); sum += delta; samples += 1;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    let previous = {};
    const tick = setInterval(() => {
      const fps = samples ? 1000 / (sum / samples) : 0;
      const state = {
        dpr: String(devicePixelRatio),
        viewport: `${innerWidth}x${innerHeight}`,
        screen: `${screen.width}x${screen.height}`,
        colorDepth: String(screen.colorDepth),
        dynamicRange: matchMedia('(dynamic-range: high)').matches ? 'high' : 'standard',
        visible: document.visibilityState,
      };
      Object.entries(state).forEach(([key, value]) => {
        if (previous[key] !== undefined && previous[key] !== value) diagLog('CHANGED ' + key, `${previous[key]} -> ${value}`);
      });
      previous = state;
      diagLog('sample', `fps=${fps.toFixed(1)} worstFrame=${worst.toFixed(1)}ms vis=${state.visible} focus=${document.hasFocus()}`);
      worst = 0; sum = 0; samples = 0;
    }, 2000);

    const unsubscribe = diagSubscribe((current) => setLines([...current]));
    return () => {
      offs.forEach((off) => off());
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      cancelAnimationFrame(raf);
      clearInterval(tick);
      unsubscribe();
    };
  }, []);

  if (!diagEnabled()) return null;

  const copy = async () => {
    const text = diagLines().join('\n');
    try { await navigator.clipboard.writeText(text); alert('تم نسخ السجل'); }
    catch { alert('انسخ النص يدوياً من الصندوق'); }
  };

  return (
    <div style={{ position: 'fixed', insetInlineStart: 8, insetInlineEnd: 8, bottom: 8, zIndex: 9999,
      background: 'rgba(16,21,44,.96)', color: '#d8e0ff', borderRadius: 10, padding: 10,
      font: '11px/1.45 ui-monospace, monospace', boxShadow: '0 12px 32px rgba(0,0,0,.4)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
        <strong style={{ font: '700 12px system-ui' }}>فحص التسجيل</strong>
        <button onClick={copy} style={{ font: '700 11px system-ui', border: 0, borderRadius: 6, padding: '5px 10px', background: '#3048A0', color: '#fff' }}>نسخ</button>
        <button onClick={() => setOpen((v) => !v)} style={{ font: '700 11px system-ui', border: '1px solid #45508a', borderRadius: 6, padding: '5px 10px', background: 'transparent', color: '#d8e0ff' }}>
          {open ? 'إخفاء' : 'إظهار'}
        </button>
        <span style={{ marginInlineStart: 'auto' }}>{lines.length}</span>
      </div>
      {open && (
        <div dir="ltr" style={{ maxHeight: '30vh', overflow: 'auto', whiteSpace: 'pre-wrap', textAlign: 'left' }}>
          {lines.slice(-120).join('\n')}
        </div>
      )}
    </div>
  );
}
