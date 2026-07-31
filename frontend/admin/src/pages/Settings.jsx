import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Field, ErrText } from '../ui.jsx';
import ListEditor from '../listeditor.jsx';

// plain text fields grouped by settings key -> [subkey, label]
const GROUPS = [
  ['hero', 'الواجهة الرئيسية', [['title', 'العنوان'], ['subtitle', 'العنوان الفرعي'], ['cta', 'زر الدعوة']]],
  ['about', 'من نحن', [['title', 'العنوان'], ['body', 'النص']]],
  ['contact', 'بيانات التواصل', [['email', 'البريد'], ['phone', 'الهاتف'], ['address', 'العنوان'], ['hours', 'ساعات العمل']]],
  ['socials', 'التواصل الاجتماعي', [['facebook', 'فيسبوك'], ['instagram', 'إنستغرام'], ['youtube', 'يوتيوب'], ['whatsapp', 'واتساب']]],
  ['footer', 'التذييل', [['tagline', 'الوصف المختصر']]],
];

const STAT_FIELDS = [['num', 'الرقم'], ['label', 'الوصف']].map(([key, label]) => ({ key, label }));
const TESTI_FIELDS = [{ key: 'name', label: 'الاسم' }, { key: 'role', label: 'الصفة' }, { key: 'quote', label: 'الرأي', type: 'textarea' }];
const FEATURE_FIELDS = [{ key: 'icon', label: 'أيقونة (إيموجي)' }, { key: 'title', label: 'العنوان' }, { key: 'desc', label: 'الوصف', type: 'textarea' }];
const LOGO_FIELDS = [{ key: 'name', label: 'اسم / نص الشعار' }];

export default function Settings() {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    api.settingsGet().then((r) => setS(r.settings || {})).catch(() => setErr('تعذّر التحميل.'));
  }, []);

  const setField = (grp, sub) => (e) => setS({ ...s, [grp]: { ...(s[grp] || {}), [sub]: e.target.value } });
  const setKey = (key, val) => setS({ ...s, [key]: val });
  const setBiz = (sub, val) => setS({ ...s, business: { ...(s.business || {}), [sub]: val } });

  async function save() {
    setErr(''); setMsg('');
    try { await api.settingsPut(s); setMsg('تم الحفظ ✓'); setTimeout(() => setMsg(''), 2500); }
    catch { setErr('تعذّر الحفظ.'); }
  }
  async function testVdoCipher() {
    setErr(''); setMsg('');
    try {
      await api.settingsPut(s);
      await api.vdocipherTest();
      setMsg('تم الاتصال بـ VdoCipher ✓');
    } catch (e) { setErr(e.message || 'تعذّر الاتصال بـ VdoCipher.'); }
  }
  async function syncVdoCipher() {
    setErr(''); setMsg('');
    try {
      await api.settingsPut(s);
      await api.vdocipherSyncFolders({ all_courses: true });
      setMsg('تم تجهيز مجلدات VdoCipher ✓');
    } catch (e) { setErr(e.message || 'تعذّر تجهيز المجلدات.'); }
  }

  if (!s) return <div className="empty">جارٍ التحميل…</div>;
  const biz = s.business || {};
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

      {/* Home page content — no JSON, just tables */}
      <ListEditor title="أرقام وإحصائيات (الرئيسية)" items={s.stats} fields={STAT_FIELDS}
        onChange={(v) => setKey('stats', v)} />
      <ListEditor title="آراء العملاء" items={s.testimonials} fields={TESTI_FIELDS}
        onChange={(v) => setKey('testimonials', v)} />

      {/* Business page content */}
      <h2 style={{ marginTop: 26 }}>صفحة الأعمال</h2>
      <ListEditor title="إحصائيات الأعمال" items={biz.stats} fields={STAT_FIELDS}
        onChange={(v) => setBiz('stats', v)} />
      <ListEditor title="المميزات" items={biz.features} fields={FEATURE_FIELDS}
        onChange={(v) => setBiz('features', v)} />
      <ListEditor title="شعارات العملاء" items={biz.logos} fields={LOGO_FIELDS}
        onChange={(v) => setBiz('logos', v)} addLabel="+ شعار" />
      <div className="card">
        <h3>نص الثقة (Business)</h3>
        <Field label="نص أسفل الشعارات">
          <input value={biz.trust || ''} onChange={(e) => setBiz('trust', e.target.value)} />
        </Field>
      </div>

      {/* Fawaterak gateway */}
      <div className="card">
        <h3>بوابة الدفع — فواتيرك (Fawaterak)</h3>
        <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: -2 }}>
          من لوحة فواتيرك: Integrations Transactions → OAuth client credentials → Create client.
        </p>
        <Field label="OAuth Client ID">
          <input type="password" dir="ltr" value={s.secret_fawaterk_client_id || ''}
            onChange={(e) => setKey('secret_fawaterk_client_id', e.target.value)} placeholder="Client ID من فواتيرك" />
        </Field>
        <Field label="OAuth Client Secret">
          <input type="password" dir="ltr" value={s.secret_fawaterk_client_secret || ''}
            onChange={(e) => setKey('secret_fawaterk_client_secret', e.target.value)} placeholder="Client Secret (يظهر مرة واحدة)" />
        </Field>
        <Field label="HASH API Key (توقيع الويب هوك)">
          <input type="password" dir="ltr" value={s.secret_fawaterk_vendor || ''}
            onChange={(e) => setKey('secret_fawaterk_vendor', e.target.value)} placeholder="HASH API key" />
        </Field>
        <Field label="الوضع">
          <select value={s.fawaterk_mode || 'staging'} onChange={(e) => setKey('fawaterk_mode', e.target.value)}>
            <option value="staging">اختبار (staging)</option>
            <option value="production">إنتاج (production)</option>
          </select>
        </Field>
        <div style={{ fontSize: 12, color: (s.secret_fawaterk_client_id && s.secret_fawaterk_client_secret && s.secret_fawaterk_vendor) ? 'var(--success)' : 'var(--muted)' }}>
          {(s.secret_fawaterk_client_id && s.secret_fawaterk_client_secret && s.secret_fawaterk_vendor) ? '✓ مضبوط — الدفع مُفعّل' : 'غير مضبوط — الدفع معطّل'}
        </div>
      </div>

      <div className="card">
        <h3>مفتاح VdoCipher (سرّي)</h3>
        <Field label="VdoCipher API Secret">
          <input type="password" dir="ltr" value={s.secret_vdocipher || ''}
            onChange={(e) => setKey('secret_vdocipher', e.target.value)} placeholder="مفتاح VdoCipher السرّي" />
        </Field>
        <div style={{ fontSize: 12, color: s.secret_vdocipher ? 'var(--success)' : 'var(--muted)' }}>
          {s.secret_vdocipher ? '✓ مضبوط — تشغيل الفيديو مُفعّل' : 'غير مضبوط — تشغيل الفيديو معطّل'}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn btn-tonal btn-sm" onClick={testVdoCipher}>اختبار VdoCipher</button>
          <button className="btn btn-tonal btn-sm" onClick={syncVdoCipher}>تجهيز المجلدات</button>
        </div>
      </div>

      <ErrText>{err}</ErrText>
      <div className="row" style={{ marginTop: 8, position: 'sticky', bottom: 0, background: 'var(--bg)', padding: '10px 0' }}>
        <button className="btn btn-filled" onClick={save}>حفظ الإعدادات</button>
        {msg && <span style={{ color: 'var(--success)', fontWeight: 700 }}>{msg}</span>}
      </div>
    </>
  );
}
