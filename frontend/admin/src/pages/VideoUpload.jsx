// One screen: describe a video, pick a file, upload it to the Baytara server.
// The backend packages it into encrypted HLS in the background; this page polls until the
// status settles, then links straight to the public page so it can be tested.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { api } from '../api.js';
import { ACCESS_TYPES, CATEGORY_KEYS, localizedCatalogValue } from '../catalog.js';
import { Field, ErrText } from '../ui.jsx';
import { useAdminLanguage } from '../i18n.jsx';

const empty = {
  title: '', title_en: '', description: '', description_en: '',
  category_id: '', access_type: 'free', status: 'published', is_protected: false,
  price: '0', currency: 'EGP',
};

export default function VideoUpload() {
  const { language, t } = useAdminLanguage();
  const [form, setForm] = useState(empty);
  const [file, setFile] = useState(null);
  const [categories, setCategories] = useState([]);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null); // { id, local_status, local_error }
  const pollRef = useRef(null);

  useEffect(() => {
    api.categories().then((r) => setCategories(r.categories || [])).catch(() => {});
    return () => clearInterval(pollRef.current);
  }, []);

  const set = (key) => (event) => setForm({
    ...form,
    [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value,
  });

  const watch = (id) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const fresh = await api.video(id);
        const video = fresh.video || fresh;
        setCreated({ id, local_status: video.local_status, local_error: video.local_error,
                     duration_minutes: video.duration_minutes });
        if (video.local_status === 'ready' || video.local_status === 'failed') clearInterval(pollRef.current);
      } catch { clearInterval(pollRef.current); }
    }, 4000);
  };

  const submit = async () => {
    setError('');
    if (!form.title.trim()) return setError(t('video.validation.title'));
    if (!form.category_id) return setError(t('video.validation.category'));
    if (!file) return setError(t('videoUpload.pickFile'));
    setBusy(true);
    try {
      // 1. catalogue row, 2. the file — so a failed upload leaves an editable video behind
      const res = await api.videoCreate({
        ...form,
        category_id: Number(form.category_id),
        price: Number(form.price || 0),
      });
      const id = (res.video || res).id;
      setCreated({ id, local_status: 'uploading' });
      await api.videoUpload(id, file, setProgress);
      setCreated({ id, local_status: 'packaging' });
      watch(id);
    } catch (failure) {
      setError(failure.data?.error || failure.message);
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  const status = created?.local_status;

  return (
    <>
      <h2>{t('videoUpload.heading')}</h2>
      <p style={{ color: 'var(--muted, #6b6b80)', maxWidth: 720, marginTop: -6 }}>{t('videoUpload.intro')}</p>

      <section className="video-editor-panel" style={{ maxWidth: 820 }}>
        <div className="video-form-columns">
          <Field label={t('video.titleArabic')}><input value={form.title} onChange={set('title')} /></Field>
          <Field label={t('video.titleEnglish')}><input dir="ltr" value={form.title_en} onChange={set('title_en')} /></Field>
        </div>
        <div className="video-form-columns">
          <Field label={t('video.descriptionArabic')}><textarea value={form.description} onChange={set('description')} /></Field>
          <Field label={t('video.descriptionEnglish')}><textarea dir="ltr" value={form.description_en} onChange={set('description_en')} /></Field>
        </div>
        <div className="video-form-columns">
          <Field label={t('catalog.category')}>
            <select value={form.category_id} onChange={set('category_id')}>
              <option value="">{t('video.chooseCategory')}</option>
              {categories.filter((c) => CATEGORY_KEYS.includes(c.slug)).map((c) => (
                <option key={c.id} value={c.id}>{localizedCatalogValue(c, 'name', language)}</option>
              ))}
            </select>
          </Field>
          <Field label={t('catalog.accessType')}>
            <select value={form.access_type} onChange={set('access_type')}>
              {ACCESS_TYPES.map((a) => <option key={a} value={a}>{t(`catalog.access.${a}`)}</option>)}
            </select>
          </Field>
          <Field label={t('catalog.status')}>
            <select value={form.status} onChange={set('status')}>
              {['draft', 'published', 'unpublished'].map((s) => <option key={s} value={s}>{t(`catalog.status.${s}`)}</option>)}
            </select>
          </Field>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '4px 0 14px' }}>
          <input type="checkbox" checked={form.is_protected} onChange={set('is_protected')} />
          <span>{t('video.captureProtectionHint')}</span>
        </label>

        <Field label={t('videoUpload.file')}>
          <input type="file" accept="video/mp4,video/quicktime,video/x-matroska,video/webm"
                 onChange={(e) => setFile(e.target.files?.[0] || null)} />
          {file && <div style={{ fontSize: 12, color: 'var(--muted, #6b6b80)' }}>
            {file.name} — {(file.size / (1024 * 1024)).toFixed(1)} MB
          </div>}
        </Field>

        <ErrText>{error}</ErrText>
        <div className="row">
          <button className="btn btn-filled" type="button" disabled={busy} onClick={submit}>
            <Upload size={16} /> {busy ? `${t('video.uploading')} ${progress}%` : t('videoUpload.submit')}
          </button>
        </div>
      </section>

      {created && (
        <section className="video-editor-panel" style={{ maxWidth: 820, marginTop: 16 }}>
          <h3>{t('videoUpload.result')}</h3>
          <p>
            {t('video.selfHostedStatus')}: <b>{status}</b>
            {status === 'packaging' && ` — ${t('videoUpload.packaging')}`}
            {status === 'ready' && ' ✅'}
            {created.local_error && <span style={{ color: '#b3261e' }}> — {created.local_error}</span>}
          </p>
          {status === 'ready' && (
            <p>
              <a href={`https://baytara.app/videos/${created.id}`} target="_blank" rel="noreferrer">
                {t('videoUpload.openPublic')} →
              </a>
              {' · '}
              <Link to={`/videos/${created.id}`}>{t('videoUpload.openEditor')}</Link>
            </p>
          )}
        </section>
      )}
    </>
  );
}
