import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { toast } from '../toast.jsx';

function CourseNode({ course }) {
  const [open, setOpen] = useState(false);
  const [tree, setTree] = useState(null);
  async function toggle() {
    setOpen((o) => !o);
    if (!tree) { try { setTree((await api.course(course.id)).course); } catch { toast.error('تعذّر تحميل الدورة'); } }
  }
  return (
    <div style={{ marginInlineStart: 16, borderInlineStart: '2px solid var(--border)', paddingInlineStart: 12, marginTop: 6 }}>
      <div onClick={toggle} style={{ cursor: 'pointer', padding: '5px 0', fontWeight: 700 }}>
        {open ? '📂' : '📁'} {course.title}{' '}
        <span className={`chip chip-${course.status}`}>{course.status}</span>{' '}
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>· {course.enrolled_count} مسجّل</span>
      </div>
      {open && tree && (tree.modules.length === 0
        ? <div style={{ marginInlineStart: 20, color: 'var(--muted)', fontSize: 12 }}>لا وحدات</div>
        : tree.modules.map((m) => (
          <div key={m.id} style={{ marginInlineStart: 20 }}>
            <div style={{ padding: '3px 0', fontWeight: 600 }}>📗 {m.title}</div>
            {m.lessons.length === 0 && <div style={{ marginInlineStart: 20, color: 'var(--muted)', fontSize: 12 }}>لا دروس</div>}
            {m.lessons.map((l) => (
              <div key={l.id} style={{ marginInlineStart: 20, padding: '2px 0', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
                🎬 {l.title}
                {l.has_video ? <span className="chip chip-ok">فيديو</span> : <span className="chip chip-draft">بدون فيديو</span>}
              </div>
            ))}
          </div>
        )))}
    </div>
  );
}

function InstructorNode({ ins }) {
  const [open, setOpen] = useState(false);
  const [courses, setCourses] = useState(null);
  async function toggle() {
    setOpen((o) => !o);
    if (courses === null) {
      try { setCourses((await api.courses({ instructor_id: ins.id, per_page: 100 })).courses); }
      catch { toast.error('تعذّر تحميل الدورات'); }
    }
  }
  return (
    <div className="card" style={{ padding: 14 }}>
      <div onClick={toggle} style={{ cursor: 'pointer', fontWeight: 800, fontSize: 15 }}>
        {open ? '▾' : '▸'} 👤 {ins.name}{' '}
        <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 400 }}>{ins.email}</span>
      </div>
      {open && (courses === null
        ? <div className="empty">…</div>
        : courses.length === 0
          ? <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>لا دورات لهذا المدرّب.</div>
          : courses.map((c) => <CourseNode key={c.id} course={c} />))}
    </div>
  );
}

export default function Hierarchy() {
  const [instructors, setInstructors] = useState(null);
  useEffect(() => {
    api.users({ role: 'instructor' }).then((r) => setInstructors(r.users)).catch(() => toast.error('تعذّر التحميل'));
  }, []);
  return (
    <>
      <h2>الهيكلة — المدرّبون ← الدورات ← الوحدات ← الدروس</h2>
      <p style={{ color: 'var(--muted)', marginTop: -8 }}>عرض شجري لكل مدرّب ومحتواه. للإدارة (إضافة/حذف/فيديو) استخدم صفحة «الدورات».</p>
      {!instructors ? <div className="empty">جارٍ التحميل…</div>
        : instructors.length === 0 ? <div className="empty">لا مدرّبين بعد — أضِف مدرّباً من «المستخدمون».</div>
          : instructors.map((i) => <InstructorNode key={i.id} ins={i} />)}
    </>
  );
}
