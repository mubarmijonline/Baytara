import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { toast } from '../toast.jsx';
import { useAdminLanguage } from '../i18n.jsx';
import { pageCopy } from '../page-copy.js';

function CourseNode({ course, copy }) {
  const [open, setOpen] = useState(false);
  const [tree, setTree] = useState(null);
  async function toggle() {
    setOpen((o) => !o);
    if (!tree) { try { setTree((await api.course(course.id)).course); } catch { toast.error(copy.courseError); } }
  }
  return (
    <div style={{ marginInlineStart: 16, borderInlineStart: '2px solid var(--border)', paddingInlineStart: 12, marginTop: 6 }}>
      <div onClick={toggle} style={{ cursor: 'pointer', padding: '5px 0', fontWeight: 700 }}>
        {open ? '📂' : '📁'} {course.title}{' '}
        <span className={`chip chip-${course.status}`}>{course.status}</span>{' '}
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>· {course.enrolled_count} {copy.enrolled}</span>
      </div>
      {open && tree && (tree.modules.length === 0
        ? <div style={{ marginInlineStart: 20, color: 'var(--muted)', fontSize: 12 }}>{copy.noModules}</div>
        : tree.modules.map((m) => (
          <div key={m.id} style={{ marginInlineStart: 20 }}>
            <div style={{ padding: '3px 0', fontWeight: 600 }}>📗 {m.title}</div>
            {m.lessons.length === 0 && <div style={{ marginInlineStart: 20, color: 'var(--muted)', fontSize: 12 }}>{copy.noLessons}</div>}
            {m.lessons.map((l) => (
              <div key={l.id} style={{ marginInlineStart: 20, padding: '2px 0', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
                🎬 {l.title}
                {l.has_video ? <span className="chip chip-ok">{copy.video}</span> : <span className="chip chip-draft">{copy.noVideo}</span>}
              </div>
            ))}
          </div>
        )))}
    </div>
  );
}

function InstructorNode({ ins, copy, common }) {
  const [open, setOpen] = useState(false);
  const [courses, setCourses] = useState(null);
  async function toggle() {
    setOpen((o) => !o);
    if (courses === null) {
      try { setCourses((await api.courses({ instructor_id: ins.id, per_page: 100 })).courses); }
      catch { toast.error(copy.coursesError); }
    }
  }
  return (
    <div className="card" style={{ padding: 14 }}>
      <div onClick={toggle} style={{ cursor: 'pointer', fontWeight: 800, fontSize: 15 }}>
        {open ? '▾' : '▸'} 👤 {ins.name}{' '}
        <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 400 }}>{ins.email}</span>
      </div>
      {open && (courses === null
        ? <div className="empty">{common.loading}</div>
        : courses.length === 0
          ? <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>{copy.noCourses}</div>
          : courses.map((c) => <CourseNode key={c.id} course={c} copy={copy} />))}
    </div>
  );
}

export default function Hierarchy() {
  const { language } = useAdminLanguage();
  const copy = pageCopy('hierarchy', language);
  const common = pageCopy('common', language);
  const [instructors, setInstructors] = useState(null);
  useEffect(() => {
    api.users({ role: 'instructor' }).then((r) => setInstructors(r.users)).catch(() => toast.error(common.loadError));
  }, []);
  return (
    <>
      <h2>{copy.heading}</h2>
      <p style={{ color: 'var(--muted)', marginTop: -8 }}>{copy.subtitle}</p>
      <p style={{ color: 'var(--muted)' }}>{copy.description}</p>
      {!instructors ? <div className="empty">{common.loading}</div>
        : instructors.length === 0 ? <div className="empty">{copy.empty}</div>
          : instructors.map((i) => <InstructorNode key={i.id} ins={i} copy={copy} common={common} />)}
    </>
  );
}
