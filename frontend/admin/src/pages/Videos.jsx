import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Modal, Field, ErrText, apiError } from '../ui.jsx';
import { confirmDialog } from '../dialog.jsx';
import { toast } from '../toast.jsx';

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

export default function Videos() {
  const [rows, setRows] = useState(null);
  const [courses, setCourses] = useState([]);
  const [scope, setScope] = useState('standalone'); // standalone | all
  const [form, setForm] = useState(undefined);
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
    </>
  );
}
