// Copy the link, or hand it straight to WhatsApp.
//
// The client's reason for this is reach: someone who reads a summary sends the link to a
// colleague rather than the file, and that visit lands on the site rather than in a chat
// thread. WhatsApp first because that is where this audience actually shares.
import { useState } from 'react';
import { Link2, Send } from 'lucide-react';
import { useI18n } from '../lib/i18n.jsx';
import { colors } from '../theme/tokens.js';

export default function ShareRow({ title }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const url = typeof window === 'undefined' ? '' : window.location.href;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* no clipboard permission; the address bar still works */ }
  };

  const pill = {
    display: 'inline-flex', alignItems: 'center', gap: 7, border: `1px solid ${colors.line2}`,
    background: 'transparent', borderRadius: 10, padding: '9px 15px', fontSize: 13.5,
    fontWeight: 700, color: colors.ink, cursor: 'pointer', textDecoration: 'none',
  };

  return (
    <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center' }}>
      <button type="button" onClick={copy} style={pill}>
        <Link2 size={15} aria-hidden="true" /> {copied ? t('share.copied') : t('share.copyLink')}
      </button>
      <a style={pill} target="_blank" rel="noreferrer"
        href={`https://wa.me/?text=${encodeURIComponent(`${title} — ${url}`)}`}>
        <Send size={15} aria-hidden="true" /> {t('share.whatsapp')}
      </a>
    </div>
  );
}
