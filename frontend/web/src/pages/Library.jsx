// مكتبة بيطرة — articles and book summaries under one roof.
//
// Free, and deliberately open to guests: the client's reason for the section is that
// people come for something useful, come back, and eventually buy a course. A wall in
// front of an article would defeat that. Only the PDF of a book asks for an account.
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Container } from '../components/Primitives.jsx';
import { useFetch, webapi } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { colors, gradients } from '../theme/tokens.js';

function Card({ to, cover, title, meta, excerpt }) {
  return (
    <Link to={to} style={{ textDecoration: 'none', color: 'inherit', display: 'block',
      border: `1px solid ${colors.line2}`, borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
      <div style={{ aspectRatio: '16 / 9', background: cover ? colors.surfaceAlt : gradients.darkPanel }}>
        {cover && <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
      </div>
      <div style={{ padding: 14 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, lineHeight: 1.5, overflowWrap: 'anywhere' }}>{title}</h3>
        {meta && <div style={{ fontSize: 12.5, color: colors.muted2, marginBottom: 6 }}>{meta}</div>}
        {excerpt && <p style={{ margin: 0, fontSize: 13.5, color: colors.muted, lineHeight: 1.8 }}>{excerpt}</p>}
      </div>
    </Link>
  );
}

export default function Library() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const [shelf, setShelf] = useState(params.get('shelf') === 'books' ? 'books' : 'articles');

  const articles = useFetch(() => webapi.articles({ type: 'blog' }), []);
  const books = useFetch(() => webapi.books(), []);

  const pick = (next) => {
    setShelf(next);
    const q = new URLSearchParams(params);
    if (next === 'books') q.set('shelf', 'books'); else q.delete('shelf');
    setParams(q, { replace: true });
  };

  const tab = (key, label) => (
    <button type="button" onClick={() => pick(key)}
      style={{ border: 'none', background: shelf === key ? colors.accent : 'transparent',
        color: shelf === key ? '#fff' : colors.ink, borderRadius: 10, padding: '10px 20px',
        fontWeight: 700, fontSize: 14.5, cursor: 'pointer' }}>{label}</button>
  );

  const items = shelf === 'books' ? (books.data?.books || []) : (articles.data?.articles || []);
  const loading = shelf === 'books' ? books.loading : articles.loading;

  return (
    <main style={{ background: colors.surfaceMuted, minHeight: '70vh', padding: '32px 0 70px' }}>
      <Container>
        <h1 style={{ margin: '0 0 6px', fontSize: 28, fontWeight: 800, color: colors.utilityBar }}>
          {t('library.title')}
        </h1>
        <p style={{ margin: '0 0 18px', color: colors.muted, fontSize: 15 }}>{t('library.subtitle')}</p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
          {tab('articles', t('library.articles'))}
          {tab('books', t('library.books'))}
        </div>

        {loading ? (
          <p style={{ color: colors.muted }}>{t('common.loading')}</p>
        ) : !items.length ? (
          <p style={{ color: colors.muted }}>{t('library.empty')}</p>
        ) : (
          <div className="grid-3">
            {shelf === 'books'
              ? items.map((book) => (
                <Card key={book.slug} to={`/library/${book.slug}`} cover={book.cover} title={book.title}
                  meta={[book.book_author, book.pages ? `${book.pages} ${t('library.pages')}` : ''].filter(Boolean).join(' · ')}
                  excerpt={book.excerpt} />
              ))
              : items.map((article) => (
                <Card key={article.slug} to={`/blog/${article.slug}`} cover={article.cover}
                  title={article.title} excerpt={article.excerpt} />
              ))}
          </div>
        )}
      </Container>
    </main>
  );
}
