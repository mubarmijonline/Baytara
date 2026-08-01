import { Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { isFixedCategory, localizedCatalogValue, orderedCategories } from '../catalog.js';
import { confirmDialog } from '../dialog.jsx';
import { useAdminLanguage } from '../i18n.jsx';
import { toast } from '../toast.jsx';
import { ErrText, Field, Modal, apiError } from '../ui.jsx';

const COPY = {
  ar: {
    heading: 'الفئات', arabic: 'الاسم العربي', english: 'الاسم الإنجليزي', slug: 'المعرّف الثابت',
    actions: 'الإجراءات', add: 'إضافة فئة', edit: 'تعديل الفئة', save: 'حفظ الفئة', cancel: 'إلغاء',
    delete: 'حذف الفئة', fixed: 'فئة أساسية', loading: 'جارٍ التحميل…', empty: 'لا توجد فئات.',
    deleteConfirm: 'حذف هذه الفئة؟', inUse: 'لا يمكن حذف الفئة لأنها مستخدمة في دورة أو فيديو.',
    fixedError: 'لا يمكن حذف فئة أساسية.', loadError: 'تعذّر تحميل الفئات.',
  },
  en: {
    heading: 'Categories', arabic: 'Arabic label', english: 'English label', slug: 'Stable slug', actions: 'Actions',
    add: 'Add category', edit: 'Edit category', save: 'Save category', cancel: 'Cancel', delete: 'Delete category',
    fixed: 'Fixed category', loading: 'Loading…', empty: 'No categories found.', deleteConfirm: 'Delete this category?',
    inUse: 'This category is referenced by a course or video and cannot be deleted.', fixedError: 'Fixed categories cannot be deleted.',
    loadError: 'Unable to load categories.',
  },
};

function CategoryEditor({ category, onClose, onSaved }) {
  const { language } = useAdminLanguage();
  const c = COPY[language];
  const [name, setName] = useState(category.name || '');
  const [nameEn, setNameEn] = useState(category.name_en || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!name.trim()) return;
    setSaving(true); setError('');
    try { await api.categoryUpdate(category.id, { name: name.trim(), name_en: nameEn.trim() || null }); onSaved(); }
    catch (requestError) { setError(apiError(requestError, c.loadError)); }
    finally { setSaving(false); }
  }
  return <Modal title={c.edit} onClose={onClose}>
    <div className="catalog-form-grid two-columns"><Field label={c.arabic}><input value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label={c.english}><input dir="ltr" value={nameEn} onChange={(event) => setNameEn(event.target.value)} /></Field></div>
    <Field label={c.slug}><input dir="ltr" value={category.slug} disabled /></Field>
    <ErrText>{error}</ErrText>
    <div className="catalog-form-actions"><button className="btn btn-filled" type="button" disabled={saving || !name.trim()} onClick={save}><Save size={16} /> {c.save}</button><button className="btn btn-text" type="button" onClick={onClose}>{c.cancel}</button></div>
  </Modal>;
}

export default function Categories() {
  const { language } = useAdminLanguage();
  const c = COPY[language];
  const [rows, setRows] = useState(null);
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try { setRows(orderedCategories((await api.categories()).categories || [])); }
    catch { setError(c.loadError); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function create() {
    if (!name.trim()) return;
    try {
      await api.categoryCreate({ name: name.trim(), name_en: nameEn.trim() || null });
      setName(''); setNameEn(''); await load();
    } catch (requestError) { toast.error(apiError(requestError, c.loadError)); }
  }
  async function remove(category) {
    if (!await confirmDialog(c.deleteConfirm)) return;
    try { await api.categoryDelete(category.id); await load(); }
    catch (requestError) {
      const code = apiError(requestError, c.loadError);
      toast.error(code === 'category_in_use' ? c.inUse : code === 'fixed_category' ? c.fixedError : code);
    }
  }

  return <section>
    <div className="catalog-page-header"><h2>{c.heading}</h2></div>
    <section className="taxonomy-create"><Field label={c.arabic}><input value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label={c.english}><input dir="ltr" value={nameEn} onChange={(event) => setNameEn(event.target.value)} /></Field><button className="btn btn-filled" type="button" disabled={!name.trim()} onClick={create}><Plus size={16} /> {c.add}</button></section>
    <ErrText>{error}</ErrText>
    {!rows ? <div className="empty">{c.loading}</div> : <div className="table-scroll"><table className="table"><thead><tr><th>{c.arabic}</th><th>{c.slug}</th><th>{c.english}</th><th>{c.actions}</th></tr></thead><tbody>
      {rows.map((category) => {
        const fixed = isFixedCategory(category);
        return <tr key={category.id}><td><strong>{category.name}</strong>{fixed && <span className="chip chip-role taxonomy-fixed">{c.fixed}</span>}</td><td dir="ltr">{category.slug}</td><td dir="ltr">{category.name_en || localizedCatalogValue(category, 'name', language)}</td><td className="actions"><button className="btn btn-tonal btn-sm" type="button" aria-label={c.edit} onClick={() => setEditing(category)}><Pencil size={14} /> {c.edit}</button>{!fixed && <button className="btn btn-error btn-sm" type="button" aria-label={c.delete} onClick={() => remove(category)}><Trash2 size={14} /> {c.delete}</button>}</td></tr>;
      })}
      {!rows.length && <tr><td colSpan="4" className="empty">{c.empty}</td></tr>}
    </tbody></table></div>}
    {editing && <CategoryEditor category={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }} />}
  </section>;
}
