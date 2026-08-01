import { Field } from '../ui.jsx';
import { useAdminLanguage } from '../i18n.jsx';

function normalized(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ar: value.ar || '', en: value.en || '' };
  }
  return { ar: typeof value === 'string' ? value : '', en: '' };
}

export default function LocalizedField({ label, value, onChange, multiline = false }) {
  const { language } = useAdminLanguage();
  const current = normalized(value);
  const labels = language === 'en'
    ? [`Arabic ${label.en}`, `English ${label.en}`]
    : [`${label.ar} - العربية`, `${label.ar} - الإنجليزية`];
  const control = (locale) => multiline
    ? <textarea dir={locale === 'ar' ? 'rtl' : 'ltr'} rows={4} value={current[locale]} onChange={(event) => onChange({ ...current, [locale]: event.target.value })} />
    : <input dir={locale === 'ar' ? 'rtl' : 'ltr'} value={current[locale]} onChange={(event) => onChange({ ...current, [locale]: event.target.value })} />;

  return (
    <div className="localized-field-grid">
      <Field label={labels[0]}>{control('ar')}</Field>
      <Field label={labels[1]}>{control('en')}</Field>
    </div>
  );
}
