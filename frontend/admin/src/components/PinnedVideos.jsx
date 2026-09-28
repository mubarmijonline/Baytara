// The videos an admin puts first, on the home page strip and at the top of the public
// video library. Everything not pinned follows, newest first, as before.
//
// Kept apart from the provider browser below it on purpose: that page lists what is on
// VdoCipher and our server, this panel decides what a visitor meets first, and the two
// have nothing in common but the word "video".
import { ArrowDown, ArrowUp, Pin, Save, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { localizedCatalogValue } from '../catalog.js';
import { useAdminLanguage } from '../i18n.jsx';
import { toast } from '../toast.jsx';

const COPY = {
  ar: {
    title: 'المثبّت في المقدمة',
    subtitle: 'تظهر أولاً بهذا الترتيب في مكتبة الفيديوهات، وباقي الفيديوهات تأتي بعدها من الأحدث للأقدم. الفيديو غير المصنّف في قسم يظهر أولاً أيضاً في «تعرّف على المنصة» بالصفحة الرئيسية.',
    search: 'ابحث عن فيديو منشور لتثبيته', pin: 'تثبيت', remove: 'إزالة', moveUp: 'لأعلى', moveDown: 'لأسفل',
    save: 'حفظ الترتيب', saved: 'تم حفظ الترتيب.', empty: 'لا توجد فيديوهات مثبّتة. الترتيب الحالي من الأحدث للأقدم.',
    noResults: 'لا فيديوهات منشورة بهذا الاسم.', full: 'وصلت للحد الأقصى ({max}). أزل فيديو لتثبيت غيره.',
    saveError: 'تعذّر حفظ الترتيب.', loadError: 'تعذّر تحميل الفيديوهات المثبّتة.', unsaved: 'تغييرات غير محفوظة',
    notPublished: 'غير منشور، لن يظهر للزوار',
  },
  en: {
    title: 'Pinned to the front',
    subtitle: 'Shown first, in this order, in the video library. Every other video follows, newest first. A pinned video with no section also leads the home page "Get to know the platform" strip.',
    search: 'Search a published video to pin', pin: 'Pin', remove: 'Remove', moveUp: 'Move up', moveDown: 'Move down',
    save: 'Save order', saved: 'Order saved.', empty: 'Nothing is pinned. The order is newest first.',
    noResults: 'No published video by that name.', full: 'The limit is {max}. Remove one to pin another.',
    saveError: 'Unable to save the order.', loadError: 'Unable to load pinned videos.', unsaved: 'Unsaved changes',
    notPublished: 'Not published, visitors will not see it',
  },
};

const SEARCH_DEBOUNCE_MS = 300;

export default function PinnedVideos() {
  const { language } = useAdminLanguage();
  const c = COPY[language] || COPY.ar;
  const [pinned, setPinned] = useState(null);
  const [saved, setSaved] = useState([]);
  const [max, setMax] = useState(12);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.pinnedVideos()
      .then((body) => { setPinned(body.videos || []); setSaved((body.videos || []).map((v) => v.id)); setMax(body.max || 12); })
      .catch(() => { setPinned([]); setError(c.loadError); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const term = query.trim();
    if (!term) { setResults([]); return undefined; }
    const timer = setTimeout(() => {
      api.videos({ q: term, status: 'published', per_page: 10 })
        .then((body) => setResults(body.items || []))
        .catch(() => setResults([]));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  if (pinned === null) return null;
  const ids = pinned.map((v) => v.id);
  const dirty = ids.join(',') !== saved.join(',');
  const full = pinned.length >= max;
  const offered = results.filter((v) => !ids.includes(v.id));

  const move = (index, step) => setPinned((rows) => {
    const next = [...rows];
    [next[index], next[index + step]] = [next[index + step], next[index]];
    return next;
  });
  const add = (video) => { if (!full) setPinned((rows) => [...rows, video]); setQuery(''); };
  const remove = (id) => setPinned((rows) => rows.filter((v) => v.id !== id));

  async function save() {
    setSaving(true);
    try {
      const body = await api.pinnedVideosSet(ids);
      setPinned(body.videos || []);
      setSaved((body.videos || []).map((v) => v.id));
      toast.success(c.saved);
    } catch { toast.error(c.saveError); }
    finally { setSaving(false); }
  }

  return <section className="catalog-panel pinned-videos" aria-labelledby="pinned-videos-title">
    <h3 id="pinned-videos-title"><Pin size={16} /> {c.title}</h3>
    <p className="pinned-videos-subtitle">{c.subtitle}</p>
    {error && <div className="error-text">{error}</div>}
    <ol className="catalog-selector pinned-videos-list">
      {pinned.map((video, index) => <li key={video.id}>
        <span><strong>{index + 1}. {localizedCatalogValue(video, 'title', language)}</strong>
          {video.status !== 'published' && <small className="catalog-warning">{c.notPublished}</small>}</span>
        <button className="btn btn-tonal btn-sm" type="button" aria-label={`${c.moveUp}: ${video.title}`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></button>
        <button className="btn btn-tonal btn-sm" type="button" aria-label={`${c.moveDown}: ${video.title}`} disabled={index === pinned.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></button>
        <button className="btn btn-text btn-sm" type="button" aria-label={`${c.remove}: ${video.title}`} onClick={() => remove(video.id)}><X size={14} /></button>
      </li>)}
      {!pinned.length && <li className="empty">{c.empty}</li>}
    </ol>
    {full
      ? <p className="catalog-warning">{c.full.replace('{max}', max)}</p>
      : <div className="pinned-videos-search">
        <input className="catalog-search" type="search" placeholder={c.search} aria-label={c.search} value={query} onChange={(event) => setQuery(event.target.value)} />
        {query.trim() && <ul className="catalog-selector">
          {offered.map((video) => <li key={video.id}>
            <span><strong>{localizedCatalogValue(video, 'title', language)}</strong></span>
            <button className="btn btn-tonal btn-sm" type="button" onClick={() => add(video)}><Pin size={14} /> {c.pin}</button>
          </li>)}
          {!offered.length && <li className="empty">{c.noResults}</li>}
        </ul>}
      </div>}
    <div className="pinned-videos-actions">
      <button className="btn btn-filled btn-sm" type="button" disabled={!dirty || saving} onClick={save}><Save size={14} /> {c.save}</button>
      {dirty && <small>{c.unsaved}</small>}
    </div>
  </section>;
}
