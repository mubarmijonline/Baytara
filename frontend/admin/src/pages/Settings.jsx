import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Field, ErrText } from '../ui.jsx';

// text fields grouped by settings key -> [subkey, label]
const GROUPS = [
  ['hero', 'الواجهة الرئيسية', [['title', 'العنوان'], ['subtitle', 'العنوان الفرعي'], ['cta', 'زر الدعوة']]],
  ['about', 'من نحن', [['title', 'العنوان'], ['body', 'النص']]],
  ['contact', 'بيانات التواصل', [['email', 'البريد'], ['phone', 'الهاتف'], ['address', 'العنوان'], ['hours', 'ساعات العمل']]],
  ['socials', 'التواصل الاجتماعي', [['facebook', 'فيسبوك'], ['instagram', 'إنستغرام'], ['youtube', 'يوتيوب'], ['whatsapp', 'واتساب']]],
  ['footer', 'التذييل', [['tagline', 'الوصف المختصر']]],
];
const JSON_KEYS = [
  ['plans', 'خطط الاشتراك (JSON)'],
  ['faqs', 'الأسئلة الشائعة (JSON)'],
  ['testimonials', 'آراء العملاء (JSON)'],
];

export default function Settings() {
  const [s, setS] = useState(null);
  const [jsonText, setJsonText] = useState({});
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    api.settingsGet().then((r) => {
      const v = r.settings || {};
      setS(v);
      const jt = {};
      JSON_KEYS.forEach(([k]) => { jt[k] = JSON.stringify(v[k] ?? [], null, 2); });
      setJsonText(jt);
    }).catch(() => setErr('تعذّر التحميل.'));
  }, []);

  const setField = (grp, sub) => (e) => setS({ ...s, [grp]: { ...(s[grp] || {}), [sub]: e.target.value } });

  async function save() {
    setErr(''); setMsg('');
    const body = { ...s };
    for (const [k] of JSON_KEYS) {
      try { body[k] = JSON.parse(jsonText[k] || '[]'); }
      catch { setErr(`JSON غير صالح في: ${k}`); return; }
    }
    try { await api.settingsPut(body); setMsg('تم الحفظ ✓'); setTimeout(() => setMsg(''), 2500); }
    catch { setErr('تعذّر الحفظ.'); }
  }

  if (!s) return <div className="empty">جارٍ التحميل…</div>;
  return (
    <>
      <h2>إعدادات الموقع</h2>
      <p style={{ color: 'var(--muted)', marginTop: -8 }}>محتوى الموقع الرئيسي — يظهر مباشرةً على الصفحة العامة بعد الحفظ.</p>

      {GROUPS.map(([grp, label, fields]) => (
        <div key={grp} className="card">
          <h3>{label}</h3>
          {fields.map(([sub, lbl]) => (
            <Field key={sub} label={lbl}>
              <input value={(s[grp] || {})[sub] || ''} onChange={setField(grp, sub)}
                dir={grp === 'socials' || grp === 'contact' ? 'ltr' : 'rtl'} />
            </Field>
          ))}
        </div>
      ))}

      {JSON_KEYS.map(([k, lbl]) => (
        <div key={k} className="card">
          <h3>{lbl}</h3>
          <textarea value={jsonText[k] || ''} onChange={(e) => setJsonText({ ...jsonText, [k]: e.target.value })}
            rows={8} dir="ltr"
            style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: 12, font: '13px monospace', resize: 'vertical' }} />
        </div>
      ))}

      <div className="card">
        <h3>مفاتيح API (سرّية)</h3>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: -6 }}>
          لا تظهر هذه المفاتيح في الموقع العام. تُطبّق فور الحفظ (بدون إعادة تشغيل).
        </p>
        <Field label="مفتاح VdoCipher السرّي (API Secret)">
          <input type="password" dir="ltr" value={s.secret_vdocipher || ''}
            onChange={(e) => setS({ ...s, secret_vdocipher: e.target.value })}
            placeholder="الصق مفتاح VdoCipher السرّي هنا" />
        </Field>
        <div style={{ fontSize: 12, color: s.secret_vdocipher ? 'var(--success)' : 'var(--muted)' }}>
          {s.secret_vdocipher ? '✓ مضبوط — تشغيل الفيديو مُفعّل' : 'غير مضبوط — تشغيل الفيديو معطّل'}
        </div>
      </div>

      <ErrText>{err}</ErrText>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn btn-filled" onClick={save}>حفظ الإعدادات</button>
        {msg && <span style={{ color: 'var(--success)', fontWeight: 700 }}>{msg}</span>}
      </div>
    </>
  );
}
