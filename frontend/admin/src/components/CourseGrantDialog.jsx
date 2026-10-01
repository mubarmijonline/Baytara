// Open a paid course to chosen people without payment (milestone 28).
//
// The client's use: influencers, reviewers and people they know get the course free, so
// they can watch and review it and the course stops showing zero learners. Any number of
// people per grant. The server decides who actually gets a seat and says why it skipped
// anyone (not verified for a vets-only course, already enrolled, account closed), and this
// dialog shows that answer rather than a blanket "done".
import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAdminLanguage } from '../i18n.jsx';
import { toast } from '../toast.jsx';
import { ErrText, Field, Modal, apiError } from '../ui.jsx';

const COPY = {
  ar: {
    title: (course) => `منح وصول مجاني: ${course}`,
    lead: 'اختر الأشخاص الذين ستُفتح لهم الدورة بدون دفع. يُحسبون ضمن المشتركين، ويقدرون يشاهدوا ويكتبوا تقييم.',
    search: 'ابحث بالاسم أو البريد',
    searchButton: 'بحث',
    noResults: 'لا نتائج.',
    add: 'إضافة',
    added: 'مضاف',
    selected: (n) => `المختارون (${n})`,
    none: 'لم تختر أحداً بعد.',
    remove: 'إزالة',
    access: 'مدة الوصول',
    accessCourse: (days) => (days ? `مدة الدورة (${days} يوم)` : 'مدة الدورة (مدى الحياة)'),
    accessLifetime: 'مدى الحياة',
    submit: (n) => `منح الوصول لـ ${n}`,
    working: 'جارٍ المنح…',
    cancel: 'إلغاء',
    done: (n) => `تم منح الوصول بنجاح لـ ${n} مستخدم.`,
    skippedTitle: 'لم يُمنح الوصول لهؤلاء:',
    close: 'إغلاق',
    vet: 'طبيب موثّق',
    reasons: {
      already_enrolled: 'مشترك بالفعل',
      needs_baytarian: 'غير موثّق كطبيب بيطري، والدورة للأطباء فقط. وثّقه أولاً من صفحة المستخدمين.',
      non_veterinarians_only: 'طبيب موثّق، والدورة لغير الأطباء فقط',
      user_unavailable: 'الحساب غير موجود أو موقوف',
    },
    errors: { course_is_free: 'الدورة مجانية أصلاً، لا تحتاج منح وصول.' },
  },
  en: {
    title: (course) => `Free access: ${course}`,
    lead: 'Choose who gets this course without paying. They count as learners and can watch and review it.',
    search: 'Search by name or email',
    searchButton: 'Search',
    noResults: 'No results.',
    add: 'Add',
    added: 'Added',
    selected: (n) => `Selected (${n})`,
    none: 'Nobody selected yet.',
    remove: 'Remove',
    access: 'Access period',
    accessCourse: (days) => (days ? `The course's own (${days} days)` : "The course's own (lifetime)"),
    accessLifetime: 'Lifetime',
    submit: (n) => `Grant access to ${n}`,
    working: 'Granting…',
    cancel: 'Cancel',
    done: (n) => `Access granted to ${n} user(s).`,
    skippedTitle: 'Not granted:',
    close: 'Close',
    vet: 'verified vet',
    reasons: {
      already_enrolled: 'already enrolled',
      needs_baytarian: 'not a verified vet, and this course is for vets only. Verify them first on the Users page.',
      non_veterinarians_only: 'a verified vet, and this course is for non-vets only',
      user_unavailable: 'account missing or disabled',
    },
    errors: { course_is_free: 'This course is free already; there is nothing to grant.' },
  },
};

export default function CourseGrantDialog({ course, onClose, onDone }) {
  const { language } = useAdminLanguage();
  const c = COPY[language];
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [picked, setPicked] = useState([]);
  const [access, setAccess] = useState('course');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [skipped, setSkipped] = useState(null);

  async function search(event) {
    event?.preventDefault();
    setError('');
    try {
      const found = await api.users({ q: query.trim(), role: 'student', active: 1, per_page: 20 });
      setResults(found.users || []);
    } catch (e) {
      setError(apiError(e, ''));
    }
  }
  // An empty search lists the newest students, so the dialog is useful before typing.
  useEffect(() => { search(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const isPicked = (user) => picked.some((p) => p.id === user.id);
  const add = (user) => !isPicked(user) && setPicked((current) => [...current, user]);
  const remove = (user) => setPicked((current) => current.filter((p) => p.id !== user.id));

  async function submit() {
    if (!picked.length || busy) return;
    setBusy(true); setError('');
    try {
      const result = await api.courseGrants(course.id, { user_ids: picked.map((p) => p.id), access });
      if (result.granted.length) toast.success(c.done(result.granted.length));
      onDone(result);
      if (result.skipped.length) {
        setSkipped(result.skipped);
        setPicked([]);
      } else {
        onClose();
      }
    } catch (e) {
      const code = apiError(e, '');
      setError(c.errors[code] || code);
    } finally {
      setBusy(false);
    }
  }

  const nameOf = (row) => row.name || picked.find((p) => p.id === row.user_id)?.name || `#${row.user_id}`;

  return (
    <Modal title={c.title(course.title)} onClose={onClose}>
      {skipped ? (
        <div>
          <p><strong>{c.skippedTitle}</strong></p>
          <ul className="grant-skipped">
            {skipped.map((row) => (
              <li key={row.user_id}>{nameOf(row)}{row.email ? ` (${row.email})` : ''}: {c.reasons[row.reason] || row.reason}</li>
            ))}
          </ul>
          <div className="catalog-form-actions">
            <button className="btn btn-filled" type="button" onClick={onClose}>{c.close}</button>
          </div>
        </div>
      ) : (
        <>
          <p className="field-hint">{c.lead}</p>
          <form className="toolbar" onSubmit={search}>
            <input type="search" aria-label={c.search} placeholder={c.search} value={query}
              onChange={(event) => setQuery(event.target.value)} />
            <button className="btn btn-tonal btn-sm" type="submit"><Search size={15} /> {c.searchButton}</button>
          </form>
          {results && (
            <div className="table-scroll">
              <table className="table">
                <tbody>
                  {results.map((user) => (
                    <tr key={user.id}>
                      <td><strong>{user.name}</strong>{user.is_baytarian ? <span className="chip chip-published"> {c.vet}</span> : null}<br /><span dir="ltr">{user.email}</span></td>
                      <td className="actions">
                        <button className="btn btn-tonal btn-sm" type="button" disabled={isPicked(user)}
                          onClick={() => add(user)}>{isPicked(user) ? c.added : c.add}</button>
                      </td>
                    </tr>
                  ))}
                  {!results.length && <tr><td className="empty">{c.noResults}</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          <h4>{c.selected(picked.length)}</h4>
          {picked.length ? (
            <div className="grant-chips">
              {picked.map((user) => (
                <span key={user.id} className="chip chip-draft">
                  {user.name}
                  <button type="button" className="btn btn-text btn-sm" aria-label={`${c.remove} ${user.name}`}
                    onClick={() => remove(user)}><X size={12} /></button>
                </span>
              ))}
            </div>
          ) : <p className="field-hint">{c.none}</p>}

          <Field label={c.access}>
            <select value={access} onChange={(event) => setAccess(event.target.value)}>
              <option value="course">{c.accessCourse(course.access_days)}</option>
              <option value="lifetime">{c.accessLifetime}</option>
            </select>
          </Field>
          <ErrText>{error}</ErrText>
          <div className="catalog-form-actions">
            <button className="btn btn-filled" type="button" disabled={!picked.length || busy} onClick={submit}>
              {busy ? c.working : c.submit(picked.length)}
            </button>
            <button className="btn btn-text" type="button" onClick={onClose}>{c.cancel}</button>
          </div>
        </>
      )}
    </Modal>
  );
}
