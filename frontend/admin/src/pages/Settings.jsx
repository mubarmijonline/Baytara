import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { api } from '../api.js';
import { ErrText, Field } from '../ui.jsx';
import ListEditor from '../listeditor.jsx';
import { useAdminLanguage } from '../i18n.jsx';
import { siteSettingsCopy } from '../site-settings-copy.js';
import LocalizedField from '../components/LocalizedField.jsx';
import SitePreview from '../components/SitePreview.jsx';

const label = (ar, en) => ({ ar, en });
const STAT_FIELDS = [
  { key: 'num', label: label('الرقم', 'Number') },
  { key: 'label', label: label('الوصف', 'label'), localized: true },
];
const TESTIMONIAL_FIELDS = [
  { key: 'name', label: label('الاسم', 'name'), localized: true },
  { key: 'role', label: label('الصفة', 'role'), localized: true },
  { key: 'quote', label: label('الرأي', 'quote'), localized: true, type: 'textarea' },
];
const VALUE_FIELDS = [
  { key: 'title', label: label('العنوان', 'title'), localized: true },
  { key: 'description', label: label('الوصف', 'description'), localized: true, type: 'textarea' },
];
const FEATURE_FIELDS = [
  { key: 'icon', label: label('الأيقونة', 'Icon') },
  { key: 'title', label: label('العنوان', 'title'), localized: true },
  { key: 'description', label: label('الوصف', 'description'), localized: true, type: 'textarea' },
];
const LOGO_FIELDS = [
  { key: 'name', label: label('اسم الشعار', 'Name') },
  { key: 'url', label: label('رابط الشعار', 'URL') },
];

function Section({ title, children }) {
  return <section className="settings-section"><h3>{title}</h3>{children}</section>;
}

export default function Settings() {
  const { language } = useAdminLanguage();
  const copy = siteSettingsCopy(language);
  const [draft, setDraft] = useState(null);
  const [tab, setTab] = useState('home');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.settingsGet()
      .then((response) => setDraft(response.settings || {}))
      .catch(() => setError(copy.loadError));
  }, []);

  const setKey = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const setGroup = (group, key, value) => setDraft((current) => ({
    ...current,
    [group]: { ...(current[group] || {}), [key]: value },
  }));

  async function save() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api.settingsPut(draft);
      setMessage(copy.saved);
    } catch {
      setError(copy.saveError);
    } finally {
      setBusy(false);
    }
  }

  async function runVdo(action, success, failure) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api.settingsPut(draft);
      await action();
      setMessage(success);
    } catch (requestError) {
      setError(requestError.message || failure);
    } finally {
      setBusy(false);
    }
  }

  if (!draft) return <div className="empty">{error || copy.loading}</div>;
  const group = (name) => draft[name] || {};
  const field = (groupName, key, fieldLabel, multiline = false) => (
    <LocalizedField label={fieldLabel} value={group(groupName)[key]} multiline={multiline}
      onChange={(value) => setGroup(groupName, key, value)} />
  );
  const tabs = Object.entries(copy.tabs);

  return (
    <div className="site-settings-page">
      <header className="site-settings-header">
        <div><h2>{copy.heading}</h2><p>{copy.subtitle}</p></div>
        <button className="btn btn-filled" onClick={save} disabled={busy}><Save size={17} />{copy.save}</button>
      </header>

      <div className="site-settings-tabs">
        {tabs.map(([key, title]) => (
          <button key={key} type="button" aria-pressed={tab === key}
            className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{title}</button>
        ))}
      </div>

      <div className="site-settings-layout">
        <main className="site-settings-editor">
          {tab === 'home' && <>
            <Section title={copy.sections.header}>
              {field('header', 'welcome', label('رسالة الترحيب', copy.fields.welcome))}
              {field('header', 'app_label', label('التطبيق', copy.fields.app))}
              {field('header', 'help_label', label('المساعدة', copy.fields.help))}
            </Section>
            <Section title={copy.sections.hero}>
              {field('hero', 'eyebrow', label('النص العلوي', copy.fields.eyebrow))}
              {field('hero', 'title', label('العنوان', copy.fields.title))}
              {field('hero', 'subtitle', label('العنوان الفرعي', copy.fields.subtitle), true)}
              {field('hero', 'primary_cta', label('زر الإجراء الرئيسي', copy.fields.primaryCta))}
              {field('hero', 'secondary_cta', label('زر الإجراء الثانوي', copy.fields.secondaryCta))}
              {field('hero', 'featured_label', label('وسم الدورة المميزة', copy.fields.featuredLabel))}
              {field('hero', 'featured_title', label('عنوان الدورة المميزة', copy.fields.featuredTitle))}
            </Section>
            <Section title={copy.sections.home}>
              {field('home', 'testimonials_title', label('عنوان الآراء', copy.fields.testimonialsTitle))}
            </Section>
            <ListEditor title={copy.sections.stats} items={draft.stats} fields={STAT_FIELDS} onChange={(value) => setKey('stats', value)} />
            <ListEditor title={copy.sections.testimonials} items={draft.testimonials} fields={TESTIMONIAL_FIELDS} onChange={(value) => setKey('testimonials', value)} />
          </>}

          {tab === 'about' && <>
            <Section title={copy.tabs.about}>
              {field('about', 'title', label('العنوان', copy.fields.title))}
              {field('about', 'body', label('النص', copy.fields.body), true)}
            </Section>
            <ListEditor title={copy.sections.values} items={group('about').values} fields={VALUE_FIELDS}
              onChange={(value) => setGroup('about', 'values', value)} />
          </>}

          {tab === 'business' && <>
            <Section title={copy.sections.business}>
              {field('business', 'eyebrow', label('النص العلوي', copy.fields.eyebrow))}
              {field('business', 'title', label('العنوان', copy.fields.title))}
              {field('business', 'body', label('النص', copy.fields.body), true)}
              {field('business', 'primary_cta', label('زر الإجراء الرئيسي', copy.fields.primaryCta))}
              {field('business', 'secondary_cta', label('زر الإجراء الثانوي', copy.fields.secondaryCta))}
              {field('business', 'trust', label('نص الثقة', copy.fields.trust))}
            </Section>
            <ListEditor title={copy.sections.stats} items={group('business').stats} fields={STAT_FIELDS} onChange={(value) => setGroup('business', 'stats', value)} />
            <ListEditor title={copy.sections.features} items={group('business').features} fields={FEATURE_FIELDS} onChange={(value) => setGroup('business', 'features', value)} />
            <ListEditor title={language === 'ar' ? 'شعارات العملاء' : 'Customer logos'} items={group('business').logos} fields={LOGO_FIELDS} onChange={(value) => setGroup('business', 'logos', value)} />
          </>}

          {tab === 'contact' && <>
            <Section title={copy.sections.contact}>
              {field('contact', 'title', label('العنوان', copy.fields.title))}
              {field('contact', 'subtitle', label('العنوان الفرعي', copy.fields.subtitle), true)}
              <Field label={copy.fields.email}><input dir="ltr" value={group('contact').email || ''} onChange={(event) => setGroup('contact', 'email', event.target.value)} /></Field>
              <Field label={copy.fields.phone}><input dir="ltr" value={group('contact').phone || ''} onChange={(event) => setGroup('contact', 'phone', event.target.value)} /></Field>
              {field('contact', 'address', label('العنوان', copy.fields.address), true)}
              {field('contact', 'hours', label('ساعات العمل', copy.fields.hours), true)}
            </Section>
            <Section title={copy.sections.socials}>
              {['facebook', 'instagram', 'youtube', 'whatsapp'].map((network) => (
                <Field key={network} label={network[0].toUpperCase() + network.slice(1)}>
                  <input dir="ltr" value={group('socials')[network] || ''} onChange={(event) => setGroup('socials', network, event.target.value)} />
                </Field>
              ))}
            </Section>
          </>}

          {tab === 'footer' && <Section title={copy.sections.footer}>
            {field('footer', 'tagline', label('الوصف المختصر', copy.fields.tagline), true)}
            {field('footer', 'copyright', label('حقوق النشر', copy.fields.copyright))}
          </Section>}

          {tab === 'integrations' && <>
            <Section title={copy.sections.fawaterak}>
              <Field label={copy.integrations.clientId}><input type="password" dir="ltr" value={draft.secret_fawaterk_client_id || ''} onChange={(event) => setKey('secret_fawaterk_client_id', event.target.value)} /></Field>
              <Field label={copy.integrations.clientSecret}><input type="password" dir="ltr" value={draft.secret_fawaterk_client_secret || ''} onChange={(event) => setKey('secret_fawaterk_client_secret', event.target.value)} /></Field>
              <Field label={copy.integrations.hash}><input type="password" dir="ltr" value={draft.secret_fawaterk_vendor || ''} onChange={(event) => setKey('secret_fawaterk_vendor', event.target.value)} /></Field>
              <Field label={copy.integrations.mode}><select value={draft.fawaterk_mode || 'staging'} onChange={(event) => setKey('fawaterk_mode', event.target.value)}><option value="staging">{copy.integrations.staging}</option><option value="production">{copy.integrations.production}</option></select></Field>
            </Section>
            <Section title={copy.sections.vdocipher}>
              <Field label={copy.integrations.vdoSecret}><input type="password" dir="ltr" value={draft.secret_vdocipher || ''} onChange={(event) => setKey('secret_vdocipher', event.target.value)} /></Field>
              <div className="row">
                <button className="btn btn-tonal" disabled={busy} onClick={() => runVdo(() => api.vdocipherTest(), copy.integrations.connected, copy.integrations.connectionError)}>{copy.integrations.testVdo}</button>
                <button className="btn btn-tonal" disabled={busy} onClick={() => runVdo(() => api.vdocipherSyncFolders({ all_courses: true }), copy.integrations.synced, copy.integrations.syncError)}>{copy.integrations.syncVdo}</button>
              </div>
            </Section>
          </>}

          <ErrText>{error}</ErrText>
          {message && <div className="settings-success">{message}</div>}
        </main>
        <SitePreview draft={draft} copy={copy.preview} />
      </div>
    </div>
  );
}
