// Upload one or many videos to the Baytara server. The backend packages each into
// encrypted HLS in the background; this page follows every item until it settles.
//
// The queue is kept in localStorage, so closing the tab does not lose the record of what
// was started. What it cannot do is keep transferring: a browser upload dies with its
// page. An item interrupted that way comes back as `interrupted` with its catalogue row
// already created, so the fix is picking the file again, not filling the form again.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { api } from '../api.js';
import { ACCESS_TYPES, CATEGORY_KEYS, localizedCatalogValue } from '../catalog.js';
import { Field, ErrText, catalogErrorText } from '../ui.jsx';
import { useAdminLanguage } from '../i18n.jsx';

const QUEUE_KEY = 'baytara_admin_upload_queue';
const SETTLED = new Set(['ready', 'failed', 'interrupted']);

const empty = {
  category_id: '', access_type: 'free', status: 'published', is_protected: false,
  price: '0', currency: 'EGP',
};

const megabytes = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

function loadQueue() {
  try {
    const raw = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    // Anything still mid-transfer when the page went away did not survive it.
    return raw.map((item) => (item.status === 'uploading' || item.status === 'queued'
      ? { ...item, status: 'interrupted' } : item));
  } catch {
    return [];
  }
}

function saveQueue(items) {
  try {
    // The File object cannot be serialised, and re-uploading needs the user to pick it
    // again anyway, so only the record is kept.
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items.map(({ file, ...rest }) => rest)));
  } catch { /* private mode, or the quota is full: the queue is a convenience */ }
}

export default function VideoUpload() {
  const { language, t } = useAdminLanguage();
  const [form, setForm] = useState(empty);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState(loadQueue);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const filesRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => { saveQueue(items); }, [items]);

  const patch = useCallback((key, changes) => {
    setItems((rows) => rows.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  }, []);

  useEffect(() => {
    api.categories().then((r) => setCategories(r.categories || [])).catch(() => {});
  }, []);

  // Packaging happens on the server, so its progress is the one thing that does survive a
  // refresh: on load, ask what really became of every item that has a video id.
  useEffect(() => {
    const pending = items.filter((row) => row.id && !SETTLED.has(row.status));
    if (!pending.length) { clearInterval(pollRef.current); return undefined; }
    const tick = async () => {
      await Promise.all(pending.map(async (row) => {
        try {
          const fresh = await api.video(row.id);
          const video = fresh.video || fresh;
          if (video.local_status) {
            patch(row.key, { status: video.local_status, error: video.local_error || '' });
          }
        } catch { /* transient: the next tick tries again */ }
      }));
    };
    tick();
    pollRef.current = setInterval(tick, 4000);
    return () => clearInterval(pollRef.current);
  }, [items, patch]);

  const set = (key) => (event) => setForm({
    ...form,
    [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value,
  });

  const addFiles = (fileList) => {
    const chosen = Array.from(fileList || []);
    if (!chosen.length) return;
    setError('');
    setItems((rows) => [
      ...rows,
      ...chosen.map((file, index) => ({
        key: `${Date.now()}-${index}-${file.name}`,
        // The filename is the working title; it is editable before the upload starts.
        title: file.name.replace(/\.[^.]+$/, ''),
        name: file.name,
        size: file.size,
        status: 'queued',
        progress: 0,
        file,
      })),
    ]);
  };

  async function uploadOne(item) {
    patch(item.key, { status: 'uploading', progress: 0, error: '' });
    let id = item.id;
    try {
      if (!id) {
        // Catalogue row first, file second: a failed transfer leaves something editable
        // behind rather than nothing at all.
        const res = await api.videoCreate({
          ...form,
          title: item.title,
          category_id: Number(form.category_id),
          price: Number(form.price || 0),
        });
        id = (res.video || res).id;
        patch(item.key, { id });
      }
      await api.videoUpload(id, item.file, (progress) => patch(item.key, { progress }));
      patch(item.key, { status: 'packaging', progress: 100 });
    } catch (failure) {
      patch(item.key, { status: 'failed', error: catalogErrorText(failure, t) });
    }
  }

  const start = async () => {
    setError('');
    if (!form.category_id) return setError(t('video.validation.category'));
    const pending = items.filter((row) => row.file && (row.status === 'queued' || row.status === 'interrupted'));
    if (!pending.length) return setError(t('videoUpload.pickFile'));

    setRunning(true);
    // One at a time: ffmpeg is already busy packaging the last one, and parallel uploads
    // on a phone tether just make every bar crawl.
    for (const item of pending) {
      // eslint-disable-next-line no-await-in-loop
      await uploadOne(item);
    }
    setRunning(false);
    if (filesRef.current) filesRef.current.value = '';
  };

  const remove = (key) => setItems((rows) => rows.filter((row) => row.key !== key));
  const clearSettled = () => setItems((rows) => rows.filter((row) => !SETTLED.has(row.status)));

  const waiting = items.filter((row) => row.file && (row.status === 'queued' || row.status === 'interrupted')).length;

  return (
    <>
      <h2>{t('videoUpload.heading')}</h2>
      <p style={{ color: 'var(--muted, #6b6b80)', maxWidth: 720, marginTop: -6 }}>{t('videoUpload.intro')}</p>

      <section className="video-editor-panel" style={{ maxWidth: 820 }}>
        {/* One set of catalogue fields for the whole batch; the title is per file. */}
        <div className="video-form-columns">
          <Field label={`${t('catalog.category')} *`} hint={t('videoUpload.categoryHint')}>
            <select value={form.category_id} onChange={set('category_id')}
                    className={form.category_id ? '' : 'field-required'} required>
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
        {(form.access_type === 'baytarian' || form.access_type === 'general') && (
          <div className="video-form-columns">
            <Field label={`${t('catalog.price')} *`} hint={t('videoUpload.priceHint')}>
              <input type="number" min="1" value={form.price} onChange={set('price')} />
            </Field>
            <Field label={t('catalog.currency')}>
              <input dir="ltr" maxLength="3" value={form.currency} onChange={set('currency')} />
            </Field>
          </div>
        )}
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '4px 0 14px' }}>
          <input type="checkbox" checked={form.is_protected} onChange={set('is_protected')} />
          <span>{t('video.captureProtectionHint')}</span>
        </label>

        <Field label={t('videoUpload.file')} hint={t('videoUpload.multipleHint')}>
          <input ref={filesRef} type="file" multiple
                 accept="video/mp4,video/quicktime,video/x-matroska,video/webm"
                 onChange={(e) => addFiles(e.target.files)} />
        </Field>

        <ErrText>{error}</ErrText>
        <div className="row">
          <button className="btn btn-filled" type="button" disabled={running || !waiting} onClick={start}>
            <Upload size={16} /> {running ? t('videoUpload.running') : `${t('videoUpload.submit')}${waiting ? ` (${waiting})` : ''}`}
          </button>
          {items.some((row) => SETTLED.has(row.status)) && (
            <button className="btn btn-text" type="button" onClick={clearSettled}>{t('videoUpload.clearDone')}</button>
          )}
        </div>
      </section>

      {items.length > 0 && (
        <section className="video-editor-panel" style={{ maxWidth: 820, marginTop: 16 }}>
          <h3>{t('videoUpload.queue')}</h3>
          <p className="video-field-hint">{t('videoUpload.queueHint')}</p>
          <table className="table upload-queue">
            <tbody>
              {items.map((row) => (
                <tr key={row.key}>
                  <td>
                    <div className="upload-name">{row.title || row.name}</div>
                    <div className="video-field-hint" dir="ltr">{row.name} — {megabytes(row.size)}</div>
                    {row.status === 'uploading' && (
                      <progress className="upload-progress" max="100" value={row.progress} />
                    )}
                    {row.error && <div style={{ color: '#b3261e', fontSize: 12 }}>{row.error}</div>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span className={`chip chip-${{
                      ready: 'published', failed: 'unpublished', interrupted: 'unpublished',
                      packaging: 'draft', uploading: 'draft', queued: 'role',
                    }[row.status] || 'role'}`}>
                      {t(`videoUpload.status.${row.status}`)}
                      {row.status === 'uploading' ? ` ${row.progress}%` : ''}
                    </span>
                  </td>
                  <td className="actions">
                    {row.id && <Link className="btn btn-tonal btn-sm" to={`/videos/${row.id}`}>{t('videoUpload.openEditor')}</Link>}
                    {row.status === 'ready' && (
                      <a className="btn btn-text btn-sm" href={`https://baytara.app/videos/${row.id}`}
                         target="_blank" rel="noreferrer">{t('videoUpload.openPublic')}</a>
                    )}
                    {SETTLED.has(row.status) && (
                      <button className="btn btn-text btn-sm" type="button" onClick={() => remove(row.key)}>
                        {t('videoUpload.removeRow')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
