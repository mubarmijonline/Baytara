// Learners asking to change a device beyond their one self-service swap.
//
// It lives on the accounts screen rather than behind its own nav entry: the queue is
// usually empty, and the decision is about a person, which is what that screen is for.
// Approving buys the learner exactly one more swap -- it does not sign anyone out, so an
// approval can never cost someone the device they are using.
import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { api } from '../api.js';
import { useAdminLanguage } from '../i18n.jsx';

const COPY = {
  ar: {
    heading: 'طلبات تغيير الأجهزة',
    empty: 'لا توجد طلبات معلّقة.',
    approve: 'موافقة', reject: 'رفض',
    approved: 'تمت الموافقة', rejected: 'مرفوض',
    noReason: 'بدون سبب مذكور',
    hint: 'الموافقة بتدي الطالب فرصة تغيير جهاز واحدة إضافية. مش بتشيل أجهزته.',
    error: 'تعذّر تنفيذ الطلب.',
  },
  en: {
    heading: 'Device change requests',
    empty: 'No pending requests.',
    approve: 'Approve', reject: 'Reject',
    approved: 'Approved', rejected: 'Rejected',
    noReason: 'No reason given',
    hint: 'Approving gives the learner one more device change. It does not remove their devices.',
    error: 'Unable to complete that.',
  },
};

export default function DeviceSwapRequests() {
  const { language } = useAdminLanguage();
  const copy = COPY[language] || COPY.ar;
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(0);

  const load = async () => {
    try { setRows((await api.deviceSwapRequests('pending')).requests || []); }
    catch { setError(copy.error); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const decide = async (id, decision) => {
    setBusy(id); setError('');
    try { await api.deviceSwapDecide(id, decision); await load(); }
    catch { setError(copy.error); }
    finally { setBusy(0); }
  };

  // Shown even when empty. Hiding it meant nobody could find where these are reviewed
  // until a request happened to be waiting, which is the wrong moment to go looking.
  return (
    <section className="catalog-panel" style={{ marginBottom: 18 }}>
      <h3>{copy.heading}{rows.length ? ` (${rows.length})` : ''}</h3>
      <p style={{ marginTop: -6, fontSize: 12.5, color: 'var(--muted, #6b6b80)' }}>{copy.hint}</p>
      {!rows.length && <p style={{ margin: 0, fontSize: 13 }}>{copy.empty}</p>}
      {rows.map((row) => (
        <div key={row.id} style={{ display: 'flex', gap: 12, alignItems: 'center',
          flexWrap: 'wrap', borderTop: '1px solid var(--line, #e6e8f0)', padding: '10px 0' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <strong>{row.user?.name}</strong>
            <div style={{ fontSize: 12.5, color: 'var(--muted, #6b6b80)' }} dir="ltr">
              {row.user?.email}{row.user?.phone ? ` · ${row.user.phone}` : ''}
            </div>
            <div style={{ fontSize: 13, marginTop: 4 }}>{row.reason || copy.noReason}</div>
          </div>
          <button className="btn btn-filled btn-sm" type="button" disabled={busy === row.id}
            onClick={() => decide(row.id, 'approve')}><Check size={14} /> {copy.approve}</button>
          <button className="btn btn-tonal btn-sm" type="button" disabled={busy === row.id}
            onClick={() => decide(row.id, 'reject')}><X size={14} /> {copy.reject}</button>
        </div>
      ))}
      {error && <p className="error-text">{error}</p>}
    </section>
  );
}
