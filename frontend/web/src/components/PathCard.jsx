import { Link } from 'react-router-dom';
import { colors, font } from '../theme/tokens.js';
import { useI18n } from '../lib/i18n.jsx';

// Level pills: gold family for the mid tier, brand blue for the rest.
const LEVEL_STYLE = {
  intermediate: { background: '#fdf5e0', color: '#8a6d1f' },
};
const DEFAULT_LEVEL_STYLE = { background: colors.accentSoft, color: colors.accent };

// «المسار ٠١» / «Path 01» — Intl gives the Arabic-Indic digits, so no numeral table.
function ordinal(index, lang) {
  return new Intl.NumberFormat(lang === 'en' ? 'en' : 'ar-EG', {
    minimumIntegerDigits: 2, useGrouping: false,
  }).format(index + 1);
}

function stepNumber(index, lang) {
  return new Intl.NumberFormat(lang === 'en' ? 'en' : 'ar-EG').format(index + 1);
}

export default function PathCard({ path, index = 0, maxSteps = 3 }) {
  const { t, lang } = useI18n();
  const steps = (path.steps || []).slice(0, maxSteps);
  const hours = Math.round((path.total_minutes || 0) / 60);
  const pill = LEVEL_STYLE[path.level] || DEFAULT_LEVEL_STYLE;

  return (
    <article
      className="hover-card"
      style={{
        border: `1px solid ${colors.line}`, borderRadius: 16, padding: 24,
        background: colors.surface, display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontFamily: font, fontSize: 12, color: colors.accent, fontWeight: 600 }}>
          {t('paths.itemLabel')} {ordinal(index, lang)}
        </span>
        <span style={{ ...pill, fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 100 }}>
          {t(`level.${path.level}`)}
        </span>
      </div>

      <h3 style={{ fontSize: 18, fontWeight: 700, color: colors.ink, margin: '0 0 10px' }}>{path.title}</h3>
      {path.description && (
        <p style={{ margin: '0 0 18px', fontSize: 13.5, lineHeight: 1.8, color: colors.muted }}>
          {path.description}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 18 }}>
        {steps.map((step, i) => (
          <div key={step.id} style={{ display: 'flex', gap: 11, alignItems: 'center', fontSize: 13.5, color: colors.ink2 }}>
            <span
              style={{
                width: 22, height: 22, borderRadius: '50%', flex: 'none', fontSize: 11,
                display: 'grid', placeItems: 'center',
                background: i === 0 ? colors.accent : colors.accentSoft,
                color: i === 0 ? '#fff' : colors.accent,
              }}
            >
              {stepNumber(i, lang)}
            </span>
            {step.title}
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 'auto', paddingTop: 14, borderTop: `1px solid ${colors.line2}`,
          display: 'flex', justifyContent: 'space-between', fontSize: 13, color: colors.muted2,
        }}
      >
        <span>
          {path.courses_count} {t('paths.coursesUnit')}
          {hours > 0 && ` · ${hours} ${t('paths.hoursUnit')}`}
        </span>
        <Link to={`/paths/${path.slug}`} style={{ color: colors.accent, fontWeight: 700 }}>
          {t('paths.start')} ←
        </Link>
      </div>
    </article>
  );
}
