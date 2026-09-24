// Discount codes, issued by hand to marketing partners and influencers.
//
// The discount itself is never computed here or in any browser: this page creates codes,
// and services/promo.py turns a code into money off at checkout. A page that could set a
// price would be a page that could be tampered with.
import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { confirmDialog } from '../dialog.jsx';
import { useAdminLanguage } from '../i18n.jsx';
import { toast } from '../toast.jsx';
import { ErrText, Field, apiError } from '../ui.jsx';
import { pageCopy } from '../page-copy.js';

const BLANK = {
  code: '', kind: 'percent', value: '', partner: '', note: '',
  expires_at: '', max_uses: '', per_user_limit: '1',
};

export default function Promos() {
  const { language } = useAdminLanguage();
  const copy = pageCopy('promos', language);
  const common = pageCopy('common', language);
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(null);   // null = closed
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setErr('');
    try { setRows((await api.promos()).codes); }
    catch { setErr(common.loadError); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.promoCreate({
        ...form,
        value: Number(form.value),
        // Empty means no ceiling, which is not the same as zero.
        max_uses: form.max_uses === '' ? null : Number(form.max_uses),
        per_user_limit: Number(form.per_user_limit || 1),
        expires_at: form.expires_at || null,
      });
      setForm(null);
      load();
      toast.success(common.saved || 'تم الحفظ');
    } catch (e) { toast.error(apiError(e, copy.saveError)); }
    finally { setSaving(false); }
  }

  async function toggle(row) {
    try { await api.promoUpdate(row.id, { is_active: !row.is_active }); load(); }
    catch (e) { toast.error(apiError(e, common.loadError)); }
  }

  async function remove(row) {
    if (!await confirmDialog(copy.deleteConfirm(row.code))) return;
    try {
      const result = await api.promoDelete(row.id);
      // A used code is kept and switched off instead: it is part of the payment record.
      if (result.deactivated) toast.success(copy.deactivated);
      load();
    } catch (e) { toast.error(apiError(e, common.loadError)); }
  }

  return (
    <>
      <h2>{copy.heading}</h2>
      <p className="muted" style={{ marginTop: -6 }}>{copy.intro}</p>
      <div className="toolbar">
        <button className="btn btn-filled btn-sm" onClick={() => setForm({ ...BLANK })}>
          <Plus size={15} /> {copy.new}
        </button>
      </div>
      <ErrText>{err}</ErrText>

      {form && (
        <form className="catalog-form" onSubmit={save}>
          <Field label={copy.code}>
            <input dir="ltr" value={form.code} onChange={set('code')} required
                   placeholder="BAYTARA10" style={{ textTransform: 'uppercase' }} />
          </Field>
          <Field label={copy.kind}>
            <select value={form.kind} onChange={set('kind')}>
              <option value="percent">{copy.percent}</option>
              <option value="fixed">{copy.fixed}</option>
            </select>
          </Field>
          <Field label={form.kind === 'percent' ? copy.valuePercent : copy.valueFixed}>
            <input type="number" min="1" step="0.01" value={form.value} onChange={set('value')} required />
          </Field>
          <Field label={copy.partner}><input value={form.partner} onChange={set('partner')} /></Field>
          <Field label={copy.expires}><input type="date" value={form.expires_at} onChange={set('expires_at')} /></Field>
          <Field label={copy.maxUses}>
            <input type="number" min="1" value={form.max_uses} onChange={set('max_uses')}
                   placeholder={copy.unlimited} />
          </Field>
          <Field label={copy.perUser}>
            <input type="number" min="1" value={form.per_user_limit} onChange={set('per_user_limit')} />
          </Field>
          <Field label={copy.note}><input value={form.note} onChange={set('note')} /></Field>
          <div className="catalog-form-actions">
            <button className="btn btn-filled" type="submit" disabled={saving}>{common.save || 'حفظ'}</button>
            <button className="btn btn-text" type="button" onClick={() => setForm(null)}>{common.cancel || 'إلغاء'}</button>
          </div>
        </form>
      )}

      {!rows ? <div className="empty">{common.loading}</div> : (
        <div className="table-scroll"><table className="table">
          <thead><tr>{copy.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td><strong dir="ltr">{row.code}</strong></td>
                <td>{row.kind === 'percent' ? `${row.value}%` : `${row.value} EGP`}</td>
                <td>{row.partner || '—'}</td>
                <td>{row.expires_at ? row.expires_at.slice(0, 10) : copy.noExpiry}</td>
                {/* Uses counts payments that were actually paid, so it is revenue, not clicks. */}
                <td>{row.uses}{row.max_uses ? ` / ${row.max_uses}` : ''}</td>
                <td><span className={`chip ${row.is_active ? 'chip-on' : 'chip-off'}`}>
                  {row.is_active ? copy.active : copy.inactive}</span></td>
                <td className="actions">
                  <button className="btn btn-tonal btn-sm" type="button" onClick={() => toggle(row)}>
                    {row.is_active ? copy.disable : copy.enable}
                  </button>
                  <button className="btn btn-error btn-sm" type="button" onClick={() => remove(row)}>
                    <Trash2 size={14} /> {copy.delete}
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="7" className="empty">{copy.empty}</td></tr>}
          </tbody>
        </table></div>
      )}
    </>
  );
}
