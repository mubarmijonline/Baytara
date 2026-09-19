// The library's second shelf: book summaries as PDFs.
//
// A summary, never the book itself -- the client is explicit that summarising a published
// work is fair use and uploading the original would not be. Publishing is refused server
// side until the PDF is there, so a reader can never open a book page with nothing in it.
import { Plus, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { confirmDialog } from '../dialog.jsx';
import { ErrText, Field } from '../ui.jsx';
import { useAdminLanguage } from '../i18n.jsx';

const COPY = {
  ar: {
    heading: 'الكتب', intro: 'ملخصات كتب بصيغة PDF. تتقرأ على الموقع ولا تُحمَّل.',
    add: 'كتاب جديد', title: 'عنوان الملخص', titleEn: 'العنوان بالإنجليزية',
    author: 'مؤلف الكتاب الأصلي', excerpt: 'نبذة مختصرة (تظهر في البحث ومعاينة الروابط)',
    cover: 'صورة الغلاف', pdf: 'ملف الـ PDF', pages: 'صفحة',
    save: 'حفظ', cancel: 'إلغاء', edit: 'تعديل', remove: 'حذف',
    removeConfirm: 'حذف الكتاب وملفه؟',
    publish: 'منشور', draft: 'مسودة',
    needPdf: 'ارفع ملف PDF الأول قبل النشر.',
    noneYet: 'لا توجد كتب بعد.',
    errors: {
      title_required: 'اكتب عنوان الملخص.',
      pdf_required: 'لازم ترفع ملف PDF قبل النشر.',
      unsupported_media_type: 'الملف لازم يكون PDF.',
      file_required: 'اختر ملف.',
    },
    error: 'تعذّر الحفظ.',
  },
  en: {
    heading: 'Books', intro: 'Book summaries as PDFs. Read on the site, not downloaded.',
    add: 'New book', title: 'Summary title', titleEn: 'English title',
    author: "Original book's author", excerpt: 'Short description (used in search and link previews)',
    cover: 'Cover image', pdf: 'PDF file', pages: 'pages',
    save: 'Save', cancel: 'Cancel', edit: 'Edit', remove: 'Delete',
    removeConfirm: 'Delete this book and its file?',
    publish: 'Published', draft: 'Draft',
    needPdf: 'Upload the PDF before publishing.',
    noneYet: 'No books yet.',
    errors: {
      title_required: 'The summary needs a title.',
      pdf_required: 'Upload the PDF before publishing.',
      unsupported_media_type: 'The file must be a PDF.',
      file_required: 'Choose a file.',
    },
    error: 'Unable to save.',
  },
};

const BLANK = { title: '', title_en: '', book_author: '', excerpt: '', excerpt_en: '', cover: '' };

export default function BooksManager() {
  const { language } = useAdminLanguage();
  const copy = COPY[language] || COPY.ar;
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const coverRef = useRef(null);

  const load = async () => {
    try { setRows((await api.books()).books || []); }
    catch { setError(copy.error); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const fail = (failure) => setError(copy.errors[failure?.data?.error] || copy.error);

  const save = async () => {
    setBusy(true); setError('');
    try {
      if (draft.id) await api.bookUpdate(draft.id, draft);
      else await api.bookCreate(draft);
      setDraft(null);
      await load();
    } catch (failure) { fail(failure); }
    finally { setBusy(false); }
  };

  const pickCover = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const { url } = await api.uploadImage(file);
      setDraft((d) => ({ ...d, cover: url }));
    } catch (failure) { fail(failure); }
    finally { if (coverRef.current) coverRef.current.value = ''; }
  };

  const pickPdf = async (book, event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true); setError('');
    try { await api.bookPdf(book.id, file); await load(); }
    catch (failure) { fail(failure); }
    finally { setBusy(false); event.target.value = ''; }
  };

  const togglePublish = async (book) => {
    setError('');
    if (!book.has_pdf && book.status !== 'published') { setError(copy.needPdf); return; }
    try { await api.bookUpdate(book.id, { status: book.status === 'published' ? 'draft' : 'published' }); await load(); }
    catch (failure) { fail(failure); }
  };

  return (
    <section className="catalog-panel">
      <h3>{copy.heading}</h3>
      <p style={{ marginTop: -6, fontSize: 12.5, color: 'var(--muted, #6b6b80)' }}>{copy.intro}</p>

      {draft ? (
        <div className="catalog-panel" style={{ marginBottom: 12 }}>
          <Field label={copy.title}><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
          <Field label={copy.titleEn}><input dir="ltr" value={draft.title_en} onChange={(e) => setDraft({ ...draft, title_en: e.target.value })} /></Field>
          <Field label={copy.author}><input value={draft.book_author} onChange={(e) => setDraft({ ...draft, book_author: e.target.value })} /></Field>
          <Field label={copy.excerpt}><textarea rows={2} value={draft.excerpt} onChange={(e) => setDraft({ ...draft, excerpt: e.target.value })} /></Field>
          <Field label={`${copy.excerpt} (EN)`}><textarea dir="ltr" rows={2} value={draft.excerpt_en} onChange={(e) => setDraft({ ...draft, excerpt_en: e.target.value })} /></Field>
          <Field label={copy.cover}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {draft.cover && <img src={draft.cover} alt="" style={{ width: 70, height: 92, objectFit: 'cover', borderRadius: 6 }} />}
              <input ref={coverRef} type="file" accept="image/*" onChange={pickCover} />
            </div>
          </Field>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-filled btn-sm" type="button" disabled={busy} onClick={save}>{copy.save}</button>
            <button className="btn btn-tonal btn-sm" type="button" onClick={() => setDraft(null)}>{copy.cancel}</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-filled" type="button" onClick={() => setDraft({ ...BLANK })}>
          <Plus size={16} /> {copy.add}
        </button>
      )}

      {!rows.length && !draft && <p style={{ fontSize: 13 }}>{copy.noneYet}</p>}

      {rows.map((book) => (
        <div key={book.id} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
          borderTop: '1px solid var(--line, #e6e8f0)', padding: '10px 0' }}>
          {book.cover
            ? <img src={book.cover} alt="" style={{ width: 44, height: 58, objectFit: 'cover', borderRadius: 5 }} />
            : <div style={{ width: 44, height: 58, borderRadius: 5, background: 'var(--surface-alt, #f3f4f8)' }} />}
          <div style={{ flex: 1, minWidth: 180 }}>
            <strong>{book.title}</strong>
            <div style={{ fontSize: 12.5, color: 'var(--muted, #6b6b80)' }}>
              {book.book_author || '—'}{book.pages ? ` · ${book.pages} ${copy.pages}` : ''}
            </div>
          </div>
          <span className={`chip chip-${book.status === 'published' ? 'published' : 'draft'}`}>
            {book.status === 'published' ? copy.publish : copy.draft}
          </span>
          <label className="btn btn-tonal btn-sm" style={{ cursor: 'pointer' }}>
            <Upload size={14} /> {book.has_pdf ? 'PDF ✓' : copy.pdf}
            <input type="file" accept="application/pdf" hidden onChange={(e) => pickPdf(book, e)} />
          </label>
          <button className="btn btn-tonal btn-sm" type="button" onClick={() => setDraft({ ...book })}>{copy.edit}</button>
          <button className="btn btn-tonal btn-sm" type="button" onClick={() => togglePublish(book)}>
            {book.status === 'published' ? copy.draft : copy.publish}
          </button>
          <button className="icon-button" type="button" aria-label={copy.remove}
            onClick={async () => {
              if (!await confirmDialog(copy.removeConfirm)) return;
              try { await api.bookDelete(book.id); await load(); } catch (failure) { fail(failure); }
            }}><Trash2 size={15} /></button>
        </div>
      ))}
      <ErrText>{error}</ErrText>
    </section>
  );
}
