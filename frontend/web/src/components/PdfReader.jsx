// A book summary, rendered page by page onto canvases.
//
// The browser's own PDF viewer has a download button and a print button, and there is no
// way to remove them, so the file is drawn here instead. Be honest about what that is: a
// deterrent, not protection. Anyone reading a page can photograph it, and the bytes are
// in the tab. It is proportionate because the content is our own summary of a published
// work -- the point is that people come back to the site to read it, not that it is secret.
import { useEffect, useRef, useState } from 'react';
import { API_BASE, authHeaders } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { colors } from '../theme/tokens.js';

const PAGE_KEY = 'baytara_book_page';

export default function PdfReader({ slug }) {
  const { t } = useI18n();
  const holder = useRef(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const docRef = useRef(null);

  // Where this reader left off. Per browser, not per account: it is a convenience, and a
  // page number is not worth a round trip on every scroll.
  useEffect(() => {
    try {
      const saved = Number(JSON.parse(localStorage.getItem(PAGE_KEY) || '{}')[slug]);
      if (saved > 0) setPage(saved);
    } catch { /* private mode */ }
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url,
        ).toString();
        // Fetched with the auth header: the file endpoint refuses anonymous callers, so
        // the URL alone is not something that can be passed around.
        const res = await fetch(`${API_BASE}/books/${encodeURIComponent(slug)}/file.pdf`, {
          headers: authHeaders(),
        });
        if (!res.ok) throw new Error(res.status === 401 ? 'signin' : 'load');
        const data = await res.arrayBuffer();
        if (cancelled) return;
        const doc = await pdfjs.getDocument({ data }).promise;
        if (cancelled) return;
        docRef.current = doc;
        setTotal(doc.numPages);
        setLoading(false);
      } catch (failure) {
        if (!cancelled) { setError(failure.message === 'signin' ? 'signin' : 'load'); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    const doc = docRef.current;
    if (!doc || !holder.current) return undefined;
    let cancelled = false;
    (async () => {
      const target = Math.min(Math.max(page, 1), doc.numPages);
      const pdfPage = await doc.getPage(target);
      if (cancelled) return;
      const canvas = holder.current;
      const context = canvas.getContext('2d');
      // Fit the column, and render at device resolution so text stays sharp.
      const width = canvas.parentElement.clientWidth;
      const base = pdfPage.getViewport({ scale: 1 });
      const scale = Math.min(width / base.width, 2.4);
      const ratio = window.devicePixelRatio || 1;
      const viewport = pdfPage.getViewport({ scale });
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      await pdfPage.render({ canvasContext: context, viewport }).promise;
      try {
        const all = JSON.parse(localStorage.getItem(PAGE_KEY) || '{}');
        all[slug] = target;
        localStorage.setItem(PAGE_KEY, JSON.stringify(all));
      } catch { /* private mode */ }
    })();
    return () => { cancelled = true; };
  }, [page, total, slug]);

  if (error === 'signin') {
    return (
      <div style={{ padding: 28, textAlign: 'center', background: '#fff', borderRadius: 14 }}>
        <p style={{ margin: '0 0 14px', color: colors.muted, lineHeight: 1.9 }}>{t('library.signInToRead')}</p>
        <a href={`/auth?next=${encodeURIComponent(window.location.pathname)}`}
          style={{ background: colors.accent, color: '#fff', padding: '12px 22px', borderRadius: 11,
            fontWeight: 700, textDecoration: 'none' }}>{t('library.signIn')}</a>
      </div>
    );
  }
  if (error) return <p style={{ color: '#9b2626' }}>{t('library.readError')}</p>;
  if (loading) return <p style={{ color: colors.muted }}>{t('common.loading')}</p>;

  return (
    <div
      // Blocked as a deterrent, in the same spirit as the player: it stops the accidental
      // save, not a determined one.
      onContextMenu={(event) => event.preventDefault()}
      style={{ background: '#fff', borderRadius: 14, padding: 14 }}
    >
      <div style={{ display: 'flex', justifyContent: 'center', overflowX: 'auto' }}>
        <canvas ref={holder} style={{ maxWidth: '100%', display: 'block' }} />
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', marginTop: 12 }}>
        <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
          style={{ border: `1px solid ${colors.line2}`, background: 'transparent', borderRadius: 9,
            padding: '8px 16px', cursor: page <= 1 ? 'default' : 'pointer' }}>‹</button>
        <span style={{ fontSize: 13.5, color: colors.muted }}>{page} / {total}</span>
        <button type="button" onClick={() => setPage((p) => Math.min(total, p + 1))} disabled={page >= total}
          style={{ border: `1px solid ${colors.line2}`, background: 'transparent', borderRadius: 9,
            padding: '8px 16px', cursor: page >= total ? 'default' : 'pointer' }}>›</button>
      </div>
    </div>
  );
}
