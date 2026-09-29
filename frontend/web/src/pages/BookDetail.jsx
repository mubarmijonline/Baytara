// One book summary: a public page anyone can land on and share, and the summary itself
// for anyone signed in. The split is deliberate -- a page nobody can open cannot be
// shared or found, and reading is what the account is for.
import { Link, useParams } from 'react-router-dom';
import { Container } from '../components/Primitives.jsx';
import NotFound from './NotFound.jsx';
import PdfReader from '../components/PdfReader.jsx';
import ShareRow from '../components/ShareRow.jsx';
import CourseCard from '../components/CourseCard.jsx';
import { isAuthed, mapCourse, useFetch, webapi } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { colors } from '../theme/tokens.js';

export default function BookDetail() {
  const { slug } = useParams();
  const { t } = useI18n();
  const { data, error, loading } = useFetch(() => webapi.book(slug), [slug]);
  // A reader who finished a summary is the likeliest person on the site to want a course.
  const suggested = useFetch(() => webapi.courses({ sort: 'newest', per_page: 3 }), []);

  if (loading) return <Container style={{ padding: '60px 24px' }}>{t('common.loading')}</Container>;
  if (error || !data?.book) return <NotFound />;

  const book = data.book;
  const courses = (suggested.data?.courses || []).map((course, index) => mapCourse(course, index));

  return (
    <main style={{ background: colors.surfaceMuted, padding: '30px 0 70px' }}>
      <Container style={{ maxWidth: 940 }}>
        <Link to="/library?shelf=books" style={{ color: colors.accent, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
          ← {t('library.books')}
        </Link>

        <header style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start', margin: '14px 0 20px' }}>
          {book.cover && (
            <img src={book.cover} alt="" style={{ width: 120, borderRadius: 10, display: 'block' }} />
          )}
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 800, lineHeight: 1.4, overflowWrap: 'anywhere' }}>
              {book.title}
            </h1>
            {book.book_author && (
              <div style={{ color: colors.muted2, fontSize: 14, marginBottom: 8 }}>{book.book_author}</div>
            )}
            {book.excerpt && (
              <p style={{ margin: '0 0 12px', color: colors.muted, lineHeight: 1.9, fontSize: 15 }}>{book.excerpt}</p>
            )}
            <ShareRow title={book.title} />
          </div>
        </header>

        {isAuthed()
          ? <PdfReader slug={book.slug} />
          : (
            <div style={{ background: '#fff', borderRadius: 14, padding: 28, textAlign: 'center' }}>
              <p style={{ margin: '0 0 14px', color: colors.muted, lineHeight: 1.9 }}>{t('library.signInToRead')}</p>
              <Link to={`/auth?next=${encodeURIComponent(`/library/${book.slug}`)}`}
                style={{ background: colors.accent, color: '#fff', padding: '12px 24px', borderRadius: 11,
                  fontWeight: 700, textDecoration: 'none' }}>{t('library.signIn')}</Link>
            </div>
          )}

        {courses.length > 0 && (
          <section style={{ marginTop: 34 }}>
            <h2 style={{ margin: '0 0 14px', fontSize: 19, fontWeight: 700, color: colors.utilityBar }}>
              {t('library.relatedCourses')}
            </h2>
            <div className="grid-3">
              {courses.map((course) => <CourseCard key={course.id} course={course} width={null} />)}
            </div>
          </section>
        )}
      </Container>
    </main>
  );
}
