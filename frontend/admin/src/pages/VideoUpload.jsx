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
  category_id: '', instructor_id: '', access_type: 'free', status: 'published',
  is_protected: false, price: '0', currency: 'EGP',
};

const megabytes = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

function loadQueue() {
  try {
    const raw = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    return raw
      // The File itself cannot be stored, so a row that never created a video has
      // nothing left to resume and nothing on the server to point at: it goes.
      .filter((item) => item.id)
      // Anything still mid-transfer when the page went away did not survive it. The
      // catalogue row did, so this one can be finished by re-attaching the file.
      .map((item) => (item.status === 'uploading' || item.status === 'queued'
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
  const [instructors, setInstructors] = useState([]);
  const [items, setItems] = useState(loadQueue);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const filesRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => { saveQueue(items); }, [items]);

  const patch = useCallback((key, changes) => {
    setItems((rows) => {
      let touched = false;
      const next = rows.map((row) => {
        if (row.key !== key) return row;
        if (Object.entries(changes).every(([field, value]) => row[field] === value)) return row;
        touched = true;
        return { ...row, ...changes };
      });
      // Same array when nothing actually changed, so effects watching `items` rest.
      return touched ? next : rows;
    });
  }, []);

  useEffect(() => {
    api.categories().then((r) => setCategories(r.categories || [])).catch(() => {});
    api.users({ role: 'instructor' }).then((r) => setInstructors(r.users || [])).catch(() => {});
  }, []);

  // Packaging happens on the server, so its progress is the one thing that does survive a
  // refresh: on load, ask what really became of every item that has a video id.
  const pendingKey = items
    .filter((row) => row.id && !SETTLED.has(row.status))
    .map((row) => `${row.id}:${row.status}`)
    .join(',');

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey, patch]);

  const set = (key) => (event) => {
    setError('');   // the old complaint is about the field being changed
    setForm({
      ...form,
      [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value,
    });
  };

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
          instructor_id: Number(form.instructor_id),
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

  const missing = () => {
    if (!form.category_id) return t('video.validation.category');
    if (!form.instructor_id) return t('video.validation.instructor');
    return '';
  };

  const start = async () => {
    const invalid = missing();
    setError(invalid);
    if (invalid) return;
    const pending = items.filter((row) => row.file && (row.status === 'queued' || row.status === 'interrupted'));
    if (!pending.length) return;

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

  const waitingRef = useRef(false);
  useEffect(() => {
    if (running || waitingRef.current) return;
    if (!items.some((row) => row.file && (row.status === 'queued' || row.status === 'interrupted'))) return;
    // Files are waiting: either say what is stopping them, or get on with it. Returning
    // quietly is what made the page look like it had ignored the file.
    const invalid = missing();
    if (invalid) { setError(invalid); return; }
    waitingRef.current = true;
    // Deferred so the row renders as queued before the first byte moves.
    Promise.resolve().then(async () => {
      await start();
      waitingRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, form.category_id, form.instructor_id, running]);

  const remove = (key) => setItems((rows) => rows.filter((row) => row.key !== key));
  const clearSettled = () => setItems((rows) => rows.filter((row) => !SETTLED.has(row.status)));

  const waiting = items.filter((row) => row.file && (row.status === 'queued' || row.status === 'interrupted')).length;

  return (
    <>
      <h2>{t('videoUpload.heading')}</h2>
      <p style={{ color: 'var(--muted, #6b6b80)', maxWidth: 720, marginTop: -6 }}>{t('videoUpload.intro')}</p>

      <section className="video-editor-panel upload-panel">
        {/* One set of catalogue fields for the whole batch; the title is per file. */}
        <div className="upload-form-row">
          <Field label={`${t('catalog.category')} *`} hint={t('videoUpload.categoryHint')}>
            <select value={form.category_id} onChange={set('category_id')}
                    className={form.category_id ? '' : 'field-required'} required>
              <option value="">{t('video.chooseCategory')}</option>
              {categories.filter((c) => CATEGORY_KEYS.includes(c.slug)).map((c) => (
                <option key={c.id} value={c.id}>{localizedCatalogValue(c, 'name', language)}</option>
              ))}
            </select>
          </Field>
          <Field label={`${t('video.instructor')} *`} hint={t('videoUpload.instructorHint')}>
            <select value={form.instructor_id} onChange={set('instructor_id')}
                    className={form.instructor_id ? '' : 'field-required'} required>
              <option value="">{t('video.chooseInstructor')}</option>
              {instructors.map((person) => (
                <option key={person.id} value={person.id}>{person.name}</option>
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
          <div className="upload-form-row">
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

        <Field label={t('videoUpload.file')} hint={`${t('videoUpload.multipleHint')} ${t('videoUpload.autoStart')}`}>
          <input ref={filesRef} type="file" multiple
                 accept="video/mp4,video/quicktime,video/x-matroska,video/webm"
                 onChange={(e) => addFiles(e.target.files)} />
        </Field>

        <ErrText>{error}</ErrText>
        <div className="row">
          {waiting > 0 && (
            <button className="btn btn-filled" type="button" disabled={running} onClick={start}>
              <Upload size={16} /> {running ? t('videoUpload.running') : `${t('videoUpload.retry')} (${waiting})`}
            </button>
          )}
          {items.some((row) => SETTLED.has(row.status)) && (
            <button className="btn btn-text" type="button" onClick={clearSettled}>{t('videoUpload.clearDone')}</button>
          )}
        </div>
      </section>

      {items.length > 0 && (
        <section className="video-editor-panel upload-panel" style={{ marginTop: 16 }}>
          <h3>{t('videoUpload.queue')}</h3>
          <p className="video-field-hint">{t('videoUpload.queueHint')}</p>
          <table className="table upload-queue">
            <tbody>
              {items.map((row) => (
                <tr key={row.key}>
                  <td>
                    <div className="upload-name">{row.title || row.name}</div>
                    <div className="video-field-hint" dir="ltr">{row.name} — {megabytes(row.size)}</div>
                    {row.status === 'packaging'
                      ? <progress className="upload-progress" />
                      : <progress className="upload-progress" max="100"
                                  value={row.status === 'ready' ? 100 : row.progress || 0} />}
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
                    {row.status === 'interrupted' && row.id && (
                      <label className="btn btn-tonal btn-sm upload-reattach">
                        {t('videoUpload.reattach')}
                        <input type="file" accept="video/mp4,video/quicktime,video/x-matroska,video/webm"
                               onChange={(event) => {
                                 const picked = event.target.files?.[0];
                                 if (picked) patch(row.key, { file: picked, status: 'queued', progress: 0, error: '' });
                               }} />
                      </label>
                    )}
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
