import { useEffect, useMemo, useRef, useState } from 'react';
import { Field } from '../ui.jsx';

const MESSAGE_TYPE = 'baytara:site-settings-preview';
const PAGES = ['/', '/about', '/business', '/contact'];

function localize(value, language) {
  if (Array.isArray(value)) return value.map((item) => localize(item, language));
  if (!value || typeof value !== 'object') return value;
  const keys = Object.keys(value);
  if (keys.length && keys.every((key) => key === 'ar' || key === 'en')) {
    return value[language] || value.ar || value.en || '';
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !key.startsWith('secret_'))
      .map(([key, item]) => [key, localize(item, language)]),
  );
}

export default function SitePreview({ draft, copy }) {
  const frame = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [language, setLanguage] = useState('en');
  const [path, setPath] = useState('/');
  const payload = useMemo(() => localize(draft || {}, language), [draft, language]);
  const src = `${path}?preview=1&lang=${language}`;

  useEffect(() => {
    setLoaded(false);
  }, [src]);

  useEffect(() => {
    if (!loaded || !frame.current?.contentWindow) return;
    frame.current.contentWindow.postMessage(
      { type: MESSAGE_TYPE, settings: payload },
      window.location.origin,
    );
  }, [loaded, payload]);

  return (
    <section className="site-preview-panel">
      <div className="site-preview-toolbar">
        <Field label={copy.language}>
          <select value={language} onChange={(event) => setLanguage(event.target.value)}>
            <option value="ar">{copy.ar}</option>
            <option value="en">{copy.en}</option>
          </select>
        </Field>
        <Field label={copy.page}>
          <select value={path} onChange={(event) => setPath(event.target.value)}>
            {PAGES.map((page) => <option key={page} value={page}>{page}</option>)}
          </select>
        </Field>
      </div>
      <iframe ref={frame} title={copy.title} src={src} onLoad={() => setLoaded(true)} />
    </section>
  );
}
