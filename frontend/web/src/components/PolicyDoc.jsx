// The shared renderer for a legal page: hero, intro, numbered sections, closing note.
//
// Refund.jsx predates this and still carries its own copy of the markup. It is left alone
// on purpose — it is a live page the payment gateway has already reviewed, and rewriting
// it to save seventy lines is a risk with no reader-facing benefit. New policy pages use
// this.
import { Container } from './Primitives.jsx';
import PageHero from './PageHero.jsx';
import { colors } from '../theme/tokens.js';
import { useI18n } from '../lib/i18n.jsx';

export default function PolicyDoc({ doc, copy, updated, supportEmail }) {
  const { lang } = useI18n();
  const key = lang === 'en' ? 'en' : 'ar';
  const text = copy[key];

  return (
    <div>
      <PageHero
        breadcrumb={text.breadcrumb}
        title={text.title}
        subtitle={`${text.updated}: ${updated[key]}`}
      />
      <Container style={{ padding: '50px 24px', maxWidth: 820 }}>
        <p style={{ fontSize: 16, color: colors.ink2, lineHeight: 1.95, margin: '0 0 34px' }}>{text.intro}</p>

        {doc[key].map((section) => (
          <section
            key={section.title}
            // A stable id where one is given, so a clause can be linked to directly —
            // useful when a gateway or a lawyer asks "which section says that?".
            // scroll-margin-top clears the sticky site header, otherwise the anchor lands
            // with the heading hidden behind it.
            id={section.id}
            style={{ marginBottom: 34, scrollMarginTop: 'calc(var(--site-header-h) + 16px)' }}
          >
            <h2 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 12px' }}>{section.title}</h2>
            {(section.body || []).map((paragraph) => (
              <p key={paragraph} style={{ fontSize: 16, color: colors.muted, lineHeight: 1.9, margin: '0 0 10px' }}>
                {paragraph}
              </p>
            ))}
            {section.contact && supportEmail && (
              <p style={{ fontSize: 16, color: colors.muted, lineHeight: 1.9, margin: '0 0 10px' }}>
                {text.contactLead}{' '}
                <a href={`mailto:${supportEmail}`} style={{ color: colors.accent, fontWeight: 700 }} dir="ltr">
                  {supportEmail}
                </a>
              </p>
            )}
            {/* A clause that carries consequences, set apart from the prose around it so a
                reader cannot skim past it. */}
            {section.callout && (
              <div style={{
                margin: '14px 0 4px',
                padding: '16px 18px',
                background: colors.surfaceMuted,
                borderInlineStart: `3px solid ${colors.accent}`,
                borderRadius: 8,
              }}>
                <strong style={{ display: 'block', fontSize: 16, color: colors.ink, marginBottom: 8 }}>
                  {section.callout.lead}
                </strong>
                <p style={{ margin: 0, fontSize: 15.5, color: colors.ink2, lineHeight: 1.95 }}>
                  {section.callout.text}
                </p>
              </div>
            )}
            {section.items && (
              <ul style={{ margin: 0, paddingInlineStart: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {section.items.map((item) => (
                  <li key={item} style={{ fontSize: 16, color: colors.muted, lineHeight: 1.9 }}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}

        {text.binding && (
          <p style={{ fontSize: 13.5, color: colors.muted2, lineHeight: 1.9, margin: 0 }}>{text.binding}</p>
        )}
      </Container>
    </div>
  );
}
