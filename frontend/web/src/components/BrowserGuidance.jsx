// The two things the client asked for on an unsupported browser.
//
//   block  -- a paid video does not play here. The player slot becomes a screen that says
//             why and which browser (or the app) to open instead. The server refuses the
//             OTP anyway; this is the same answer shown kindly and early.
//   nudge  -- a free video plays here regardless, with a line suggesting a supported
//             browser. Never a refusal: an open video being recorded is publicity.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../lib/i18n.jsx';

// Which browser to name. The server decides it: on a Mac the right answer is Safari with
// a FairPlay certificate and Chrome without one, and the page has no way to know which.
function openHint(caps, t) {
  const named = ['safari', 'chrome', 'edge', 'app'].includes(caps.recommend) ? caps.recommend : null;
  // No name means the policy admits nothing here. Say that, rather than sending the
  // viewer somewhere that would refuse them too.
  return t(named ? `browser.open.${named}` : 'browser.open.other');
}

function CopyLink({ t }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch { /* no clipboard permission: the address bar still works */ }
  };
  return (
    <button type="button" onClick={copy} style={{ border: '1px solid rgba(255,255,255,.35)', background: 'transparent', color: '#fff', padding: '9px 16px', borderRadius: 9, cursor: 'pointer', fontWeight: 700 }}>
      {copied ? t('browser.copied') : t('browser.copyLink')}
    </button>
  );
}

export default function BrowserGuidance({ caps, mode }) {
  const { t } = useI18n();
  if (!caps) return null;

  if (mode === 'nudge') {
    if (caps.protected) return null;
    // Nothing to suggest, so say nothing. The block screen's "not available here" line is
    // the opposite of what a nudge means: this video is playing perfectly well.
    if (!caps.recommend) return null;
    return (
      <p role="note" data-testid="browser-nudge" style={{ margin: 0, padding: '10px 18px', background: '#fff7e0', color: '#5a4300', fontSize: 13.5, lineHeight: 1.7 }}>
        {t('browser.nudge')} {openHint(caps, t)}
      </p>
    );
  }

  if (!caps.blocked) return null;
  return (
    <div role="alert" data-testid="browser-block" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24, color: '#fff', textAlign: 'center', background: 'rgba(13,20,48,.96)' }}>
      <div style={{ maxWidth: 460 }}>
        <div style={{ fontSize: 30, marginBottom: 10 }} aria-hidden="true">&#128274;</div>
        <h2 style={{ margin: '0 0 10px', fontSize: 20 }}>{t('browser.blockedTitle')}</h2>
        <p style={{ margin: '0 0 8px', color: '#cfcfe0', lineHeight: 1.8, fontSize: 14.5 }}>{t(`video.err.${caps.blocked}`)}</p>
        <p style={{ margin: '0 0 18px', fontWeight: 700, lineHeight: 1.8 }}>{openHint(caps, t)}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <CopyLink t={t} />
          <Link to="/contact" style={{ background: '#c9a227', color: '#1a1a1a', padding: '9px 16px', borderRadius: 9, fontWeight: 800, textDecoration: 'none' }}>{t('common.getApp')}</Link>
        </div>
      </div>
    </div>
  );
}
