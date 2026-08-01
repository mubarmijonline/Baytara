import { useState } from 'react';
import { Modal, Field } from './ui.jsx';
import { useAdminLanguage } from './i18n.jsx';
import { pageCopy } from './page-copy.js';

// Non-technical editor for an array of objects: table + add/edit modal + delete + reorder.
// fields: [{ key, label, type? ('text'|'textarea'|'number') }]
export default function ListEditor({ title, items, fields, onChange, addLabel }) {
  const { language } = useAdminLanguage();
  const copy = pageCopy('list', language);
  const list = Array.isArray(items) ? items : [];
  const [form, setForm] = useState(undefined); // undefined=closed, {index, data}

  const openNew = () => setForm({ index: -1, data: Object.fromEntries(fields.map((f) => [f.key, ''])) });
  const openEdit = (i) => setForm({ index: i, data: { ...list[i] } });

  function save() {
    const next = list.slice();
    if (form.index === -1) next.push(form.data);
    else next[form.index] = form.data;
    onChange(next);
    setForm(undefined);
  }
  function del(i) { const next = list.slice(); next.splice(i, 1); onChange(next); }
  function move(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = list.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  const cols = fields.slice(0, 3); // show first few in the table
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <button className="btn btn-filled btn-sm" onClick={openNew}>{addLabel || copy.add}</button>
      </div>
      {list.length === 0 ? <div className="empty" style={{ padding: 14 }}>{copy.empty}</div> : (
        <table className="table" style={{ marginTop: 10 }}>
          <thead><tr>{cols.map((f) => <th key={f.key}>{f.label}</th>)}<th>{copy.order}</th><th>{copy.actions}</th></tr></thead>
          <tbody>
            {list.map((row, i) => (
              <tr key={i}>
                {cols.map((f) => <td key={f.key} style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(row[f.key] ?? '')}</td>)}
                <td className="actions">
                  <button className="btn btn-tonal btn-sm" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button className="btn btn-tonal btn-sm" disabled={i === list.length - 1} onClick={() => move(i, 1)}>↓</button>
                </td>
                <td className="actions">
                  <button className="btn btn-tonal btn-sm" onClick={() => openEdit(i)}>{copy.edit}</button>
                  <button className="btn btn-error btn-sm" onClick={() => del(i)}>{copy.delete}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {form !== undefined && (
        <Modal title={form.index === -1 ? copy.addTitle : copy.editTitle} onClose={() => setForm(undefined)}>
          {fields.map((f) => (
            <Field key={f.key} label={f.label}>
              {f.type === 'textarea'
                ? <textarea rows={4} value={form.data[f.key] ?? ''}
                    onChange={(e) => setForm({ ...form, data: { ...form.data, [f.key]: e.target.value } })}
                    style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, font: 'inherit', resize: 'vertical' }} />
                : <input type={f.type === 'number' ? 'number' : 'text'} value={form.data[f.key] ?? ''}
                    onChange={(e) => setForm({ ...form, data: { ...form.data, [f.key]: e.target.value } })} />}
            </Field>
          ))}
          <div className="row"><button className="btn btn-filled" onClick={save}>{copy.save}</button><button className="btn btn-text" onClick={() => setForm(undefined)}>{copy.cancel}</button></div>
        </Modal>
      )}
    </div>
  );
}
