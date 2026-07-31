import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Modal, Field, ErrText, apiError } from '../ui.jsx';
import { confirmDialog } from '../dialog.jsx';
import { toast } from '../toast.jsx';
import { uploadForm } from '../vdocipher-upload.js';

function VideoForm({ video, courses, onClose, onSaved }) {
  const editing = !!video;
  const [f, setF] = useState({
    title: video?.title || '', title_en: video?.title_en || '',
    vdocipher_video_id: video?.vdocipher_video_id || '', duration_minutes: video?.duration_minutes ?? '',
    course_id: video?.course_id || '', is_protected: video?.is_protected ?? true,
  });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setErr('');
    if (!f.title.trim()) { setErr('العنوان مطلوب.'); return; }
    const body = { ...f, duration_minutes: f.duration_minutes === '' ? null : Number(f.duration_minutes),
      course_id: f.course_id ? Number(f.course_id) : null };
    try {
      if (editing) await api.videoUpdate(video.id, body); else await api.videoCreate(body);
      onSaved();
    } catch (e) { setErr(apiError(e)); }
  }

  return (
    <Modal title={editing ? 'تعديل فيديو' : 'فيديو جديد'} onClose={onClose}>
      <Field label="العنوان (عربي)"><input value={f.title} onChange={set('title')} /></Field>
      <Field label="Title (English)"><input dir="ltr" value={f.title_en} onChange={set('title_en')} /></Field>
      <Field label="VdoCipher Video ID"><input dir="ltr" value={f.vdocipher_video_id} onChange={set('vdocipher_video_id')} /></Field>
      <div className="row">
        <Field label="المدة (دقائق)"><input type="number" min="0" value={f.duration_minutes} onChange={set('duration_minutes')} style={{ width: 120 }} /></Field>
        <Field label="محمي (DRM)">
          <select value={f.is_protected ? '1' : '0'} onChange={(e) => setF({ ...f, is_protected: e.target.value === '1' })}>
            <option value="1">نعم</option><option value="0">لا</option>
          </select>
        </Field>
      </div>
      <Field label="الدورة (اترك فارغاً = فيديو مستقل)">
        <select value={f.course_id} onChange={set('course_id')}>
          <option value="">— مستقل (بدون دورة) —</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </Field>
      <ErrText>{err}</ErrText>
      <div className="row"><button className="btn btn-filled" onClick={save}>حفظ</button><button className="btn btn-text" onClick={onClose}>إلغاء</button></div>
    </Modal>
  );
}

function VdoCipherImport({ courses, onClose, onImported }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [courseId, setCourseId] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function search() {
    setLoading(true); setErr('');
    try { setRows((await api.vdocipherVideos({ q, limit: 20 })).videos || []); }
    catch (e) { setErr(apiError(e)); }
    finally { setLoading(false); }
  }

  async function imp(v) {
    setErr('');
    try {
      await api.vdocipherImport({
        video_id: v.id,
        title: v.title || v.id,
        duration_minutes: v.length ? Math.round(v.length / 60) : null,
        course_id: courseId ? Number(courseId) : null,
      });
      onImported();
    } catch (e) { setErr(apiError(e)); }
  }

  return (
    <Modal title="جلب من VdoCipher" onClose={onClose}>
      <div className="row">
        <input dir="ltr" placeholder="بحث بالعنوان أو Video ID" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
        <button className="btn btn-tonal btn-sm" onClick={search}>{loading ? '...' : 'بحث'}</button>
      </div>
      <Field label="استيراد إلى">
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          <option value="">مستقل</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </Field>
      <ErrText>{err}</ErrText>
      <table className="table">
        <thead><tr><th>العنوان</th><th>Video ID</th><th>الحالة</th><th>إجراء</th></tr></thead>
        <tbody>
          {rows.map((v) => (
            <tr key={v.id}>
              <td>{v.title || '—'}</td>
              <td style={{ direction: 'ltr', fontSize: 12 }}>{v.id}</td>
              <td>{v.status || '—'}</td>
              <td><button className="btn btn-filled btn-sm" onClick={() => imp(v)}>استيراد</button></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan="4" className="empty">ابحث في مكتبة VdoCipher.</td></tr>}
        </tbody>
      </table>
    </Modal>
  );
}

function VdoCipherUpload({ courses, onClose, onUploaded }) {
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [courseId, setCourseId] = useState('');
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function upload() {
    if (!title.trim()) { setErr('العنوان مطلوب.'); return; }
    if (!file) { setErr('اختر ملف فيديو.'); return; }
    setBusy(true); setErr(''); setProgress(0);
    let uploadedVideoId = '';
    try {
      const destination = courseId ? Number(courseId) : null;
      const credentials = await api.vdocipherUploadCredentials({ title: title.trim(), course_id: destination });
      const body = new FormData();
      Object.entries(credentials.fields).forEach(([key, value]) => body.append(key, value));
      body.append('success_action_status', '201');
      body.append('success_action_redirect', '');
      body.append('file', file);
      await uploadForm(credentials.upload_link, body, setProgress);
      uploadedVideoId = credentials.video_id;
      await api.vdocipherImport({ video_id: uploadedVideoId, title: title.trim(), course_id: destination });
      toast.success('تم رفع الفيديو وإضافته.');
      onUploaded();
    } catch (e) {
      if (uploadedVideoId) {
        setErr(`تم رفع الملف إلى VdoCipher بالمعرّف ${uploadedVideoId}، لكن تعذّرت إضافته إلى بيطرة.`);
      } else {
        setErr(e.message === 'upload_failed' ? 'تعذّر رفع الملف إلى VdoCipher.' : apiError(e));
      }
    } finally { setBusy(false); }
  }

  return (
    <Modal title="رفع فيديو إلى VdoCipher" onClose={busy ? () => {} : onClose}>
      <Field label="عنوان الفيديو"><input value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} /></Field>
      <Field label="ملف الفيديو"><input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] || null)} disabled={busy} /></Field>
      <Field label="إضافة إلى">
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)} disabled={busy}>
          <option value="">مستقل</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </Field>
      {busy && (
        <div className="field">
          <label>جاري الرفع: {progress}%</label>
          <progress max="100" value={progress} style={{ width: '100%' }} />
        </div>
      )}
      <ErrText>{err}</ErrText>
      <div className="row">
        <button className="btn btn-filled" disabled={busy} onClick={upload}>{busy ? 'جاري الرفع…' : 'رفع الفيديو'}</button>
        <button className="btn btn-text" disabled={busy} onClick={onClose}>إلغاء</button>
      </div>
    </Modal>
  );
}

export default function Videos() {
  const [rows, setRows] = useState(null);
  const [courses, setCourses] = useState([]);
  const [scope, setScope] = useState('standalone'); // standalone | all
  const [form, setForm] = useState(undefined);
  const [vdoOpen, setVdoOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [err, setErr] = useState('');

  const courseName = (id) => courses.find((c) => c.id === id)?.title || (id ? `#${id}` : '—');

  async function load() {
    setErr('');
    try { setRows((await api.videos(scope === 'standalone' ? { standalone: 1 } : {})).videos); }
    catch { setErr('تعذّر التحميل.'); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [scope]);
  useEffect(() => { api.courses({ per_page: 100 }).then((r) => setCourses(r.courses)).catch(() => {}); }, []);

  async function del(v) { if (await confirmDialog('حذف الفيديو؟')) { try { await api.videoDelete(v.id); load(); } catch (e) { toast.error(apiError(e)); } } }

  return (
    <>
      <h2>الفيديوهات</h2>
      <div className="toolbar">
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="standalone">المستقلة فقط</option>
          <option value="all">الكل</option>
        </select>
        <button className="btn btn-filled btn-sm" onClick={() => setForm(null)}>+ فيديو</button>
        <button className="btn btn-filled btn-sm" onClick={() => setUploadOpen(true)}>رفع إلى VdoCipher</button>
        <button className="btn btn-tonal btn-sm" onClick={() => setVdoOpen(true)}>جلب من VdoCipher</button>
      </div>
      <ErrText>{err}</ErrText>
      {!rows ? <div className="empty">جارٍ التحميل…</div> : (
        <table className="table">
          <thead><tr><th>العنوان</th><th>الدورة</th><th>VdoCipher</th><th>المدة</th><th>إجراءات</th></tr></thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id}>
                <td>{v.title}</td>
                <td style={{ fontSize: 12, color: 'var(--muted)' }}>{v.course_id ? courseName(v.course_id) : 'مستقل'}</td>
                <td style={{ fontSize: 12, direction: 'ltr' }}>{v.vdocipher_video_id || '— بدون —'}</td>
                <td>{v.duration_minutes ? `${v.duration_minutes}د` : '—'}</td>
                <td className="actions">
                  <button className="btn btn-tonal btn-sm" onClick={() => setForm(v)}>تعديل</button>
                  <button className="btn btn-error btn-sm" onClick={() => del(v)}>حذف</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="5" className="empty">لا فيديوهات.</td></tr>}
          </tbody>
        </table>
      )}
      {form !== undefined && (
        <VideoForm video={form} courses={courses} onClose={() => setForm(undefined)} onSaved={() => { setForm(undefined); load(); }} />
      )}
      {vdoOpen && (
        <VdoCipherImport courses={courses} onClose={() => setVdoOpen(false)} onImported={() => { setVdoOpen(false); load(); }} />
      )}
      {uploadOpen && (
        <VdoCipherUpload courses={courses} onClose={() => setUploadOpen(false)} onUploaded={() => { setUploadOpen(false); load(); }} />
      )}
    </>
  );
}
