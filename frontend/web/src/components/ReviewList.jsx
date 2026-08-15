import { colors, gradients } from '../theme/tokens.js';
import { useI18n } from '../lib/i18n.jsx';

function Stars({ rating }) {
  return (
    <div aria-label={`${rating} / 5`} style={{ color: colors.star, fontSize: 12.5, marginBottom: 10 }}>
      <span aria-hidden="true">{'★'.repeat(rating)}<span style={{ opacity: 0.3 }}>{'☆'.repeat(5 - rating)}</span></span>
    </div>
  );
}

// Learner reviews. Renders nothing at all when a course has none — an empty state here
// would read as "badly reviewed" rather than "new".
export default function ReviewList({ reviews = [], rating, count = 0 }) {
  const { t } = useI18n();
  if (!reviews.length) return null;

  return (
    <section style={{ border: `1px solid ${colors.line}`, borderRadius: 16, padding: 26, background: colors.surface }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 14, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: colors.utilityBar }}>{t('course.reviews')}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {rating != null && (
            <span style={{ background: '#fdf5e0', color: '#8a6d1f', borderRadius: 8, padding: '7px 12px', fontSize: 13, fontWeight: 700 }}>
              ★ {rating}
            </span>
          )}
          <span style={{ background: colors.surfaceAlt, color: colors.muted, borderRadius: 8, padding: '7px 12px', fontSize: 13, fontWeight: 600 }}>
            {t('course.ratingsCount', { n: count })}
          </span>
        </div>
      </div>

      <div className="grid-2">
        {reviews.map((review) => (
          <figure key={review.id} style={{ border: `1px solid ${colors.line}`, borderRadius: 12, padding: 18, margin: 0 }}>
            <Stars rating={review.rating} />
            {review.body && (
              <blockquote style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.8, color: colors.ink2 }}>
                {review.body}
              </blockquote>
            )}
            <figcaption style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 12, borderTop: `1px solid ${colors.line2}` }}>
              <span style={{ width: 34, height: 34, borderRadius: '50%', overflow: 'hidden', background: gradients.avatar, flex: 'none' }}>
                {review.author?.avatar_url && (
                  <img src={review.author.avatar_url} alt={review.author.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                )}
              </span>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: colors.ink }}>{review.author?.name}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
