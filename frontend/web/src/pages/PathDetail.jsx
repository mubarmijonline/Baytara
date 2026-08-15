import { useParams } from 'react-router-dom';
import { Container } from '../components/Primitives.jsx';
import PageHero from '../components/PageHero.jsx';
import CourseCard from '../components/CourseCard.jsx';
import NotFound from './NotFound.jsx';
import { colors } from '../theme/tokens.js';
import { webapi, useFetch, mapCourse } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';

export default function PathDetail() {
  const { slug } = useParams();
  const { t, lang } = useI18n();
  const { data, error, loading } = useFetch(() => webapi.path(slug), [slug]);
  const path = data?.path;

  if (loading) return <Container style={{ padding: '40px 24px', color: colors.muted }}>{t('common.loading')}</Container>;
  if (error || !path) return <NotFound />;

  const hours = Math.round((path.total_minutes || 0) / 60);
  const meta = [
    t(`paths.level.${path.level}`),
    `${path.courses_count} ${t('paths.coursesUnit')}`,
    hours > 0 ? `${hours} ${t('paths.hoursUnit')}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div style={{ background: colors.surfaceMuted, minHeight: '70vh' }}>
      <PageHero breadcrumb={meta} title={path.title} subtitle={path.description} />
      <Container style={{ padding: '32px 24px 60px' }}>
        <ol className="grid-3" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {(path.courses || []).map((course, i) => (
            <li key={course.id}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.accent, marginBottom: 8 }}>
                {new Intl.NumberFormat(lang === 'en' ? 'en' : 'ar-EG').format(i + 1)}
              </div>
              <CourseCard course={mapCourse(course, i)} width={null} />
            </li>
          ))}
        </ol>
      </Container>
    </div>
  );
}
