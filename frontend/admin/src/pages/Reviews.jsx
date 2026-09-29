import { Eye, EyeOff, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { confirmDialog } from '../dialog.jsx';
import { useAdminLanguage } from '../i18n.jsx';
import { toast } from '../toast.jsx';
import { ErrText, apiError } from '../ui.jsx';

const COPY = {
  ar: {
    reviews: 'آراء المتعلّمين', loading: 'جارٍ التحميل…', loadError: 'تعذّر تحميل الآراء.',
    course: 'الدورة', author: 'صاحب الرأي', rating: 'التقييم', body: 'النص', status: 'الحالة',
    actions: 'الإجراءات', none: 'لا توجد آراء.', hide: 'إخفاء', publish: 'إظهار', delete: 'حذف',
    all: 'الكل', published: 'ظاهر', hidden: 'مخفي', deleteConfirm: 'حذف هذا الرأي نهائياً؟',
    note: 'الرأي يظهر فور نشره؛ الإخفاء يزيله من الصفحة ومن متوسط التقييم.',
  },
  en: {
    reviews: 'Learner reviews', loading: 'Loading…', loadError: 'Unable to load reviews.',
    course: 'Course', author: 'Author', rating: 'Rating', body: 'Review', status: 'Status',
    actions: 'Actions', none: 'No reviews yet.', hide: 'Hide', publish: 'Publish', delete: 'Delete',
    all: 'All', published: 'Published', hidden: 'Hidden', deleteConfirm: 'Delete this review permanently?',
    note: 'A review is visible as soon as it is posted; hiding removes it from the page and from the average.',
  },
};

const FILTERS = ['', 'published', 'hidden'];

export default function Reviews() {
  const { language } = useAdminLanguage();
  const c = COPY[language];
  const [rows, setRows] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function load(next = status) {
    setError('');
    try { setRows((await api.reviews(next ? { status: next } : {})).reviews || []); }
    catch { setError(c.loadError); }
  }
  useEffect(() => { load(status); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status]);

  async function toggle(review) {
    try {
      await api.reviewUpdate(review.id, { status: review.status === 'published' ? 'hidden' : 'published' });
      await load();
    } catch (e) { toast.error(apiError(e, c.loadError)); }
  }

  async function remove(review) {
    if (!await confirmDialog(c.deleteConfirm)) return;
    try { await api.reviewDelete(review.id); await load(); }
    catch (e) { toast.error(apiError(e, c.loadError)); }
  }

  return <section>
    <div className="catalog-page-header">
      <div><h2>{c.reviews}</h2><p>{c.note}</p></div>
      <div className="catalog-form-actions">
        {FILTERS.map((value) => (
          <button key={value || 'all'} type="button"
            className={`btn btn-sm ${status === value ? 'btn-filled' : 'btn-tonal'}`}
            onClick={() => setStatus(value)}>
            {value ? c[value] : c.all}
          </button>
        ))}
      </div>
    </div>
    <ErrText>{error}</ErrText>
    {!rows ? <div className="empty">{c.loading}</div> : <div className="table-scroll"><table className="table">
      <thead><tr><th>{c.course}</th><th>{c.author}</th><th>{c.rating}</th><th>{c.body}</th><th>{c.status}</th><th>{c.actions}</th></tr></thead>
      <tbody>
        {rows.map((review) => <tr key={review.id}>
          <td>{review.course?.title || '—'}</td>
          <td>{review.author?.name || '—'}</td>
          <td>{'★'.repeat(review.rating)}<span className="muted">{'☆'.repeat(5 - review.rating)}</span></td>
          <td>{review.body || '—'}</td>
          <td><span className={`chip chip-${review.status === 'published' ? 'published' : 'draft'}`}>{c[review.status]}</span></td>
          <td className="actions">
            <button className="btn btn-tonal btn-sm" type="button" onClick={() => toggle(review)}>
              {review.status === 'published' ? <EyeOff size={14} /> : <Eye size={14} />} {review.status === 'published' ? c.hide : c.publish}
            </button>
            <button className="btn btn-error btn-sm" type="button" onClick={() => remove(review)}><Trash2 size={14} /> {c.delete}</button>
          </td>
        </tr>)}
        {!rows.length && <tr><td className="empty" colSpan="6">{c.none}</td></tr>}
      </tbody>
    </table></div>}
  </section>;
}
