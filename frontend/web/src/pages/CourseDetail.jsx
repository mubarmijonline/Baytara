import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, Play } from 'lucide-react';
import { Container } from '../components/Primitives.jsx';
import Avatar from '../components/Avatar.jsx';
import CurriculumAccordion from '../components/CurriculumAccordion.jsx';
import ReviewList from '../components/ReviewList.jsx';
import NotFound from './NotFound.jsx';
import { colors, gradients } from '../theme/tokens.js';
import { compact, useFetch, webapi } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';

const DARK = colors.utilityBar;

const darkTile = {
  background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.13)',
  borderRadius: 12, padding: 14,
};
const darkChip = {
  background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.13)',
  borderRadius: 12, padding: '11px 14px', fontSize: 12.5, color: '#cfcfe0',
};

function Tile({ value, label, gold = false }) {
  return (
    <div style={darkTile}>
      <div style={{ fontSize: 19, fontWeight: 700, color: gold ? colors.gold : '#fff' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#a7aec9', marginTop: 4 }}>{label}</div>
    </div>
  );
}

function dateLabel(iso, lang) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-GB' : 'ar-EG', { year: 'numeric', month: 'long' });
}

/* --------------------------- purchase card --------------------------- */

function PurchaseCard({ course, slug, preview, firstLessonId }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const isPaid = course.is_paid ?? course.price > 0;
  const locked = course.lock_reason;

  // Only what the database actually knows. No downloadable-resources or community rows:
  // there is nothing behind them.
  const includes = [
    course.access_days
      ? t('course.includes.days', { n: course.access_days })
      : t('access.lifetime'),
    t('course.includes.devices'),
    t('course.includes.lessons', { n: course.lessons_count, m: Math.round((course.video_minutes || 0) / 60) }),
    course.has_certificate ? t('course.includes.certificate') : null,
  ].filter(Boolean);

  return (
    <div style={{ background: colors.surface, borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,.3)' }}>
      <div style={{ aspectRatio: '16 / 9', background: course.image ? `center/cover url(${course.image})` : gradients.darkPanel, position: 'relative', display: 'grid', placeItems: 'center' }}>
        {preview ? (
          <Link
            to={`/videos/${preview.id}`}
            aria-label={`${t('course.preview')}: ${preview.title}`}
            style={{ width: 58, height: 58, borderRadius: '50%', background: DARK, display: 'grid', placeItems: 'center', color: '#fff', fontSize: 17 }}
          >
            <Play size={20} fill="currentColor" aria-hidden="true" />
          </Link>
        ) : (
          <span aria-hidden="true" style={{ width: 58, height: 58, borderRadius: '50%', background: 'rgba(20,30,66,.55)', display: 'grid', placeItems: 'center', color: '#fff' }}><Play size={20} fill="currentColor" /></span>
        )}
        {preview && (
          <span style={{ position: 'absolute', bottom: 10, insetInlineStart: 10, background: 'rgba(20,30,66,.85)', color: '#fff', fontSize: 11.5, padding: '4px 9px', borderRadius: 6 }}>
            {t('course.preview')}{preview.duration_minutes ? ` · ${preview.duration_minutes} ${t('common.minutesShort')}` : ''}
          </span>
        )}
      </div>

      <div style={{ padding: 22 }}>
        <div style={{ border: `1px solid ${colors.line}`, borderRadius: 12, padding: 14, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: colors.accent }}>{t(`access.${course.access_type}`)}</div>
            <div style={{ fontSize: 12.5, color: colors.muted2, marginTop: 3 }}>
              {course.access_days ? t('course.includes.days', { n: course.access_days }) : t('access.lifetime')}
            </div>
          </div>
          <div style={{ textAlign: 'end', borderInlineStart: `1px solid ${colors.line2}`, paddingInlineStart: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: DARK }}>
              {isPaid ? `${course.price} ${course.currency || t('common.egp')}` : t('access.free')}
            </div>
          </div>
        </div>

        {locked ? (
          <>
            <div style={{ fontSize: 13, color: '#b3261e', margin: '0 0 14px', fontWeight: 700 }}>{t(`lock.${locked}`)}</div>
            <button
              type="button"
              onClick={() => navigate(locked === 'needs_baytarian' ? '/pricing' : '/courses')}
              style={{ width: '100%', background: locked === 'needs_baytarian' ? colors.accent : '#575E7D', border: 'none', borderRadius: 11, color: '#fff', fontSize: 15.5, fontWeight: 700, padding: 15, cursor: 'pointer', marginBottom: 18 }}
            >
              {locked === 'needs_baytarian' ? t('membership.verify') : t('lock.instructors_only')}
            </button>
          </>
        ) : (
          /* A course with no fee is not joined: there is nothing to buy and no seat to
             record, so the button opens the first lesson instead of a checkout. */
          <button
            type="button"
            onClick={() => (isPaid
              ? navigate(`/buy/${slug}`)
              : navigate(firstLessonId ? `/learn/${course.id}/${firstLessonId}` : `/courses/${slug}`))}
            disabled={!isPaid && !firstLessonId}
            style={{ width: '100%', background: colors.accent, border: 'none', borderRadius: 11, color: '#fff', fontSize: 15.5, fontWeight: 700, padding: 15, cursor: 'pointer', marginBottom: 18, opacity: (!isPaid && !firstLessonId) ? 0.6 : 1 }}
          >
            {isPaid ? t('course.buyAndStart') : t('course.watchFree')}
          </button>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {includes.map((row) => (
            <div key={row} style={{ display: 'flex', gap: 10, alignItems: 'center', background: colors.surfaceMuted, borderRadius: 9, padding: '11px 13px', fontSize: 13.5, color: colors.ink2 }}>
              <Check size={16} strokeWidth={3} aria-hidden="true" style={{ color: colors.accent, flex: 'none' }} />{row}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ page ------------------------------ */

export default function CourseDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useI18n();

  const { data, error, loading } = useFetch(() => webapi.course(slug), [slug]);
  const course = data?.course;
  const { data: reviewData } = useFetch(() => webapi.courseReviews(slug).catch(() => null), [slug]);
  const { data: instructorData } = useFetch(
    () => (course?.instructor?.id ? webapi.instructor(course.instructor.id) : Promise.resolve(null)),
    [course?.instructor?.id],
  );
  const { data: relatedData } = useFetch(
    () => (course?.category?.slug
      ? webapi.courses({ category: course.category.slug, per_page: 4 })
      : Promise.resolve(null)),
    [course?.category?.slug],
  );

  if (loading) return <Container style={{ padding: '40px 24px', color: colors.muted }}>{t('common.loading')}</Container>;
  if (error || !course) return <NotFound />;

  const modules = course.modules || [];
  const videos = course.videos || [];
  const preview = videos.find((v) => v.access_type === 'free' && v.has_video) || null;
  const firstLessonId = videos.find((v) => v.has_video)?.id || null;
  // public_profile already merges the real course/student counts into the instructor object
  const instructor = instructorData?.instructor;
  const related = (relatedData?.courses || []).filter((c) => c.slug !== slug).slice(0, 3);
  const hours = Math.round((course.video_minutes || 0) / 60);
  const updated = dateLabel(course.content_updated_at, lang);

  return (
    <div style={{ background: colors.surface }}>
      {/* ---------------- dark hero ---------------- */}
      <div style={{ background: DARK, color: '#fff' }}>
        <Container className="grid-collapse-2" style={{ padding: '32px 24px 44px', display: 'grid', gridTemplateColumns: '1fr 372px', gap: 40, alignItems: 'start' }}>
          <div>
            <nav aria-label={t('course.breadcrumb')} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 9, padding: '7px 13px', fontSize: 12.5, color: '#cfcfe0', marginBottom: 18, flexWrap: 'wrap' }}>
              <Link to="/courses" style={{ color: 'inherit' }}>{t('nav.courses')}</Link>
              {course.category && (
                <>
                  <span aria-hidden="true" style={{ opacity: 0.5 }}>›</span>
                  <Link to={`/courses?category=${course.category.slug}`} style={{ color: 'inherit' }}>{course.category.name}</Link>
                </>
              )}
              <span aria-hidden="true" style={{ opacity: 0.5 }}>›</span>
              <span style={{ color: '#fff' }}>{course.title}</span>
            </nav>

            <h1 style={{ margin: '0 0 14px', fontSize: 36, fontWeight: 700, lineHeight: 1.3, letterSpacing: '-.8px', maxWidth: 640 }}>
              {course.title}
            </h1>
            {course.description && (
              <p style={{ margin: '0 0 24px', fontSize: 16.5, lineHeight: 1.85, color: '#b9bfd6', maxWidth: 600, whiteSpace: 'pre-line' }}>
                {course.description}
              </p>
            )}

            <div className="grid-collapse-sm" style={{ display: 'grid', gridTemplateColumns: `repeat(${course.rating != null ? 4 : 3},1fr)`, gap: 10, maxWidth: 640, marginBottom: 22 }}>
              {course.rating != null && (
                <Tile gold value={`★ ${course.rating}`} label={t('course.ratingsCount', { n: course.reviews_count })} />
              )}
              <Tile value={course.lessons_count} label={t('course.lessonsUnit')} />
              <Tile value={hours} label={t('course.hoursUnit')} />
              <Tile value={compact(course.enrolled_count, lang)} label={t('home.learners')} />
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              {course.instructor && (
                <Link
                  to={`/instructors/${course.instructor.id}`}
                  style={{ ...darkChip, display: 'inline-flex', alignItems: 'center', gap: 11, padding: '9px 14px 9px 9px', color: '#fff' }}
                >
                  <span style={{ width: 34, height: 34, borderRadius: '50%', overflow: 'hidden', background: gradients.avatar, flex: 'none' }}>
                    {course.instructor.avatar_url && (
                      <img src={course.instructor.avatar_url} alt={course.instructor.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    )}
                  </span>
                  <span>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700 }}>{course.instructor.name}</span>
                    {course.instructor.headline && (
                      <span style={{ display: 'block', fontSize: 11.5, color: '#a7aec9' }}>{course.instructor.headline}</span>
                    )}
                  </span>
                </Link>
              )}
              <span style={{ background: colors.accent, color: '#fff', borderRadius: 12, padding: '11px 14px', fontSize: 12.5, fontWeight: 700 }}>
                {t(`access.${course.access_type}`)}
              </span>
              <span style={darkChip}>{t(`level.${course.level}`)}</span>
              {updated && <span style={darkChip}>{t('course.lastUpdated', { date: updated })}</span>}
            </div>
          </div>

          <PurchaseCard course={course} slug={slug} preview={preview} firstLessonId={firstLessonId} />
        </Container>
      </div>

      {/* ---------------- body ---------------- */}
      <Container className="grid-collapse-2" style={{ padding: '36px 24px 60px', display: 'grid', gridTemplateColumns: '1fr 372px', gap: 40, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, minWidth: 0 }}>
          {course.objectives?.length > 0 && (
            <section style={{ border: `1px solid ${colors.line}`, borderRadius: 16, padding: 26 }}>
              <h2 style={{ margin: '0 0 18px', fontSize: 20, fontWeight: 700, color: DARK }}>{t('course.objectives')}</h2>
              <div className="grid-2">
                {course.objectives.map((point) => (
                  <div key={point} style={{ display: 'flex', gap: 10, background: colors.surfaceMuted, borderRadius: 10, padding: '13px 14px', fontSize: 14, color: colors.ink2, lineHeight: 1.6 }}>
                    <Check size={16} strokeWidth={3} aria-hidden="true" style={{ color: colors.accent, flex: 'none', marginTop: 2 }} />{point}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 14, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: DARK }}>{t('course.curriculum')}</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ background: colors.surfaceAlt, borderRadius: 8, padding: '7px 12px', fontSize: 12.5, color: colors.muted, fontWeight: 600 }}>
                  {t('course.unitsCount', { n: modules.length })}
                </span>
                <span style={{ background: colors.surfaceAlt, borderRadius: 8, padding: '7px 12px', fontSize: 12.5, color: colors.muted, fontWeight: 600 }}>
                  {course.lessons_count} {t('course.lessonsUnit')}
                </span>
              </div>
            </div>
            {modules.length ? (
              <CurriculumAccordion modules={modules} onSelect={(video) => navigate(`/learn/${slug}/${video.id}`)} />
            ) : (
              <div style={{ color: colors.muted, fontSize: 14.5 }}>{t('course.noLessons')}</div>
            )}
          </section>

          {instructor && (
            <section style={{ border: `1px solid ${colors.line}`, borderRadius: 16, padding: 26 }}>
              <h2 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 700, color: DARK }}>{t('course.aboutInstructor')}</h2>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <span style={{ width: 72, height: 72, flex: 'none' }}>
                  <Avatar src={instructor.avatar_url} name={instructor.name} round iconSize={34} />
                </span>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <Link to={`/instructors/${instructor.id}`} style={{ fontSize: 16.5, fontWeight: 700, color: colors.ink }}>{instructor.name}</Link>
                  {instructor.headline && <div style={{ fontSize: 13.5, color: colors.muted, margin: '4px 0 14px' }}>{instructor.headline}</div>}
                  <div className="grid-collapse-sm" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 14, maxWidth: 320 }}>
                    <div style={{ border: `1px solid ${colors.line}`, borderRadius: 10, padding: '11px 13px' }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: DARK }}>{instructor.courses}</div>
                      <div style={{ fontSize: 12, color: colors.muted2, marginTop: 2 }}>{t('paths.coursesUnit')}</div>
                    </div>
                    <div style={{ border: `1px solid ${colors.line}`, borderRadius: 10, padding: '11px 13px' }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: DARK }}>{compact(instructor.students, lang)}</div>
                      <div style={{ fontSize: 12, color: colors.muted2, marginTop: 2 }}>{t('home.learners')}</div>
                    </div>
                  </div>
                  {instructor.bio && <p style={{ margin: '0 0 14px', fontSize: 13.5, lineHeight: 1.8, color: colors.muted }}>{instructor.bio}</p>}
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    {(instructor.expertise || []).map((skill) => (
                      <span key={skill} style={{ background: colors.surfaceAlt, color: colors.muted, fontSize: 12, fontWeight: 600, padding: '6px 11px', borderRadius: 8 }}>{skill}</span>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          <ReviewList
            reviews={reviewData?.reviews || []}
            rating={course.rating}
            count={course.reviews_count}
          />
        </div>

        {/* ---------------- aside ---------------- */}
        <aside style={{ position: 'sticky', top: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {related.length > 0 && (
            <section style={{ border: `1px solid ${colors.line}`, borderRadius: 16, padding: 22 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: colors.ink, margin: '0 0 14px' }}>{t('course.related')}</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {related.map((item) => (
                  <Link key={item.id} to={`/courses/${item.slug}`} style={{ display: 'flex', gap: 12, border: `1px solid ${colors.line2}`, borderRadius: 11, padding: 10, color: 'inherit' }}>
                    <span style={{ width: 84, height: 54, borderRadius: 8, flex: 'none', overflow: 'hidden', background: gradients.darkPanel }}>
                      {item.image && <img src={item.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                    </span>
                    <span>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: colors.ink, lineHeight: 1.5 }}>{item.title}</span>
                      <span style={{ display: 'block', fontSize: 12, color: colors.muted2, marginTop: 5 }}>
                        {item.lessons_count} {t('course.lessonsUnit')}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section style={{ background: colors.surfaceMuted, border: `1px solid ${colors.line}`, borderRadius: 16, padding: 22 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: colors.ink, margin: '0 0 8px' }}>{t('course.consultTitle')}</h2>
            <p style={{ fontSize: 13.5, color: colors.muted, lineHeight: 1.8, margin: '0 0 14px' }}>{t('course.consultBody')}</p>
            <Link to="/contact" style={{ display: 'block', border: `1.5px solid ${colors.accent}`, color: colors.accent, fontSize: 14, fontWeight: 700, padding: 12, borderRadius: 10, textAlign: 'center' }}>
              {t('course.consultCta')}
            </Link>
          </section>
        </aside>
      </Container>
    </div>
  );
}
