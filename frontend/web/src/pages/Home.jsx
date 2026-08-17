import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Container, SectionHeading } from '../components/Primitives.jsx';
import Avatar from '../components/Avatar.jsx';
import ResumeCard from '../components/ResumeCard.jsx';
import VideoCard from '../components/VideoCard.jsx';
import { colors, font, gradients } from '../theme/tokens.js';
import { auth, compact, isAuthed, useFetch, webapi } from '../lib/api.js';
import { categoryImage } from '../lib/category-images.js';
import { useI18n } from '../lib/i18n.jsx';
import { useSiteSettings } from '../lib/site-settings.jsx';

const DARK = colors.utilityBar;

const filledBtn = {
  background: colors.accent, color: '#fff', fontSize: 16, fontWeight: 700,
  padding: '15px 30px', borderRadius: 11, border: 'none', cursor: 'pointer',
};
const ghostBtn = {
  background: 'transparent', border: '1.5px solid rgba(255,255,255,.28)', color: '#fff',
  fontSize: 16, fontWeight: 600, padding: '15px 26px', borderRadius: 11, cursor: 'pointer',
};

function SectionLink({ to, children }) {
  return <Link to={to} style={{ fontSize: 14, fontWeight: 700, color: colors.accent }}>{children} ←</Link>;
}

/* ------------------------------- hero ------------------------------- */

function Hero({ summary }) {
  const navigate = useNavigate();
  const settings = useSiteSettings();
  const hero = settings.hero || {};
  const trust = Array.isArray(hero.trust) ? hero.trust : [];

  return (
    <div style={{ background: DARK, color: '#fff' }}>
      <Container
        className="home-hero-inner grid-collapse-2"
        style={{
          padding: '64px 24px 58px', display: 'grid',
          gridTemplateColumns: '1.1fr .9fr', gap: 56, alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontFamily: font, fontSize: 12, letterSpacing: 2, color: colors.gold, marginBottom: 18 }}>
            {hero.eyebrow}
          </div>
          <h1 className="home-hero-title" style={{ margin: '0 0 20px', fontSize: 50, lineHeight: 1.22, fontWeight: 700, letterSpacing: '-1.2px' }}>
            {hero.title}
          </h1>
          <p className="home-hero-copy" style={{ margin: '0 0 32px', fontSize: 18, lineHeight: 1.85, color: '#b9bfd6', maxWidth: 490 }}>
            {hero.subtitle}
          </p>
          <div className="home-hero-actions" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 30 }}>
            <button type="button" style={filledBtn} onClick={() => navigate('/courses')}>{hero.primary_cta}</button>
            <button type="button" style={ghostBtn} onClick={() => navigate('/videos?access_type=free')}>{hero.secondary_cta}</button>
          </div>
          {trust.length > 0 && (
            <div className="home-hero-trust" style={{ display: 'flex', alignItems: 'center', gap: 26, fontSize: 13.5, color: '#a7aec9', flexWrap: 'wrap' }}>
              {trust.map((item, i) => <span key={i}>{item.label}</span>)}
            </div>
          )}
        </div>
        <ResumeCard summary={summary} />
      </Container>
    </div>
  );
}

/* ------------------------------ stats band ------------------------------ */

function StatsBand() {
  const settings = useSiteSettings();
  const stats = settings.stats || [];
  if (!stats.length) return null;
  return (
    <div style={{ background: colors.surface, borderBottom: `1px solid ${colors.line}` }}>
      <Container
        className="home-stats-grid grid-collapse-sm"
        style={{ padding: '26px 24px', display: 'grid', gridTemplateColumns: `repeat(${stats.length},1fr)`, gap: 20 }}
      >
        {stats.map((stat, i) => (
          <div key={i} style={{ textAlign: 'center', borderInlineStart: i ? `1px solid ${colors.line}` : 'none' }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: DARK }}>{stat.num}</div>
            <div style={{ fontSize: 13.5, color: colors.muted }}>{stat.label}</div>
          </div>
        ))}
      </Container>
    </div>
  );
}

// The paths section is hidden for now; PathCard and /paths still exist for when it returns.

/* ------------------------------ categories ------------------------------ */

function CategoriesSection() {
  const navigate = useNavigate();
  const settings = useSiteSettings();
  const { t } = useI18n();
  const { data } = useFetch(() => webapi.categories(), []);
  const categories = data?.categories || [];
  if (!categories.length) return null;

  return (
    <Container className="home-section" style={{ padding: '38px 24px 10px' }}>
      <SectionHeading
        title={settings.home?.categories_title}
        subtitle={settings.home?.categories_subtitle}
        action={<SectionLink to="/courses">{t('common.viewAllCategories')}</SectionLink>}
      />
      <div className="grid-3 home-category-grid" style={{ gap: 14 }}>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => navigate(`/videos?category=${category.slug}`)}
            className="hover-card"
            style={{ border: `1px solid ${colors.line}`, borderRadius: 12, overflow: 'hidden', background: colors.surface, display: 'block', padding: 0, textAlign: 'inherit', cursor: 'pointer', width: '100%' }}
          >
            <div style={{ position: 'relative', aspectRatio: '16 / 9', background: DARK }}>
              {categoryImage(category.slug) && (
                <img src={categoryImage(category.slug)} alt={category.name}
                  style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }} />
              )}
              <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(20,30,66,0) 35%, rgba(20,30,66,.52) 100%)' }} />
            </div>
            <div style={{ padding: 14 }}>
              <div style={{ fontSize: 15.5, fontWeight: 700, color: colors.ink }}>{category.name}</div>
            </div>
          </button>
        ))}
      </div>
    </Container>
  );
}

/* ----------------------------- free videos ----------------------------- */

function FreeVideosSection() {
  const { t } = useI18n();
  const { data } = useFetch(() => webapi.videos({ access_type: 'free', per_page: 3 }), []);
  const videos = data?.videos || [];
  if (!videos.length) return null;

  return (
    <div style={{ background: colors.surfaceMuted, borderTop: `1px solid ${colors.line}`, marginTop: 44 }}>
      <Container className="home-section" style={{ padding: '48px 24px' }}>
        <SectionHeading
          title={t('video.homeTitle')}
          subtitle={t('home.freeVideosSubtitle')}
          action={<SectionLink to="/videos">{t('video.allVideos')}</SectionLink>}
        />
        <div className="grid-3">
          {videos.map((video) => <VideoCard key={video.id} video={video} />)}
        </div>
      </Container>
    </div>
  );
}

/* ----------------------------- instructors ----------------------------- */

function InstructorsSection() {
  const settings = useSiteSettings();
  const { t, lang } = useI18n();
  const { data } = useFetch(() => webapi.instructors(), []);
  const instructors = (data?.instructors || []).slice(0, 4);
  if (!instructors.length) return null;

  return (
    <Container className="home-section" style={{ padding: '52px 24px 8px' }}>
      <div style={{ textAlign: 'center', marginBottom: 30 }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 25, fontWeight: 700, color: DARK, letterSpacing: '-.4px' }}>
          {settings.home?.instructors_title}
        </h2>
        {settings.home?.instructors_subtitle && (
          <p style={{ margin: 0, fontSize: 14.5, color: colors.muted }}>{settings.home.instructors_subtitle}</p>
        )}
      </div>
      <div className="grid-4">
        {instructors.map((instructor) => (
          <Link
            key={instructor.id}
            to={`/instructors/${instructor.id}`}
            className="hover-card"
            style={{ border: `1px solid ${colors.line}`, borderRadius: 16, overflow: 'hidden', background: colors.surface, display: 'block' }}
          >
            {/* Square. 4/5 made the card mostly photo; 16/10 was shallow enough to cut
                the chin off a portrait, since these are all tall studio shots (roughly
                0.65–0.9 wide-to-tall) and `cover` crops from the top. */}
            <Avatar src={instructor.avatar_url} name={instructor.name} ratio="1 / 1" iconSize={52} />
            <div style={{ padding: '18px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: colors.ink, lineHeight: 1.45 }}>{instructor.name}</div>
              {instructor.headline && (
                <div style={{ fontSize: 12.5, color: colors.muted, marginTop: 6, lineHeight: 1.6 }}>{instructor.headline}</div>
              )}
              <div style={{ fontSize: 12, color: colors.muted2, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${colors.line2}` }}>
                {instructor.courses} {t('paths.coursesUnit')} · {compact(instructor.students, lang)} {t('home.learners')}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </Container>
  );
}

/* ----------------------------- testimonials ----------------------------- */

function Testimonials() {
  const settings = useSiteSettings();
  const items = settings.testimonials || [];
  if (!items.length) return null;

  return (
    <div style={{ background: colors.surfaceMuted, borderTop: `1px solid ${colors.line}`, marginTop: 48 }}>
      {/* The design mock has no heading here, but home.testimonials_title is an editable
          CMS field, so it renders when set rather than becoming dead weight. */}
      {settings.home?.testimonials_title && (
        <Container className="home-section" style={{ padding: '46px 24px 0', textAlign: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 25, fontWeight: 700, color: DARK, letterSpacing: '-.4px' }}>
            {settings.home.testimonials_title}
          </h2>
        </Container>
      )}
      <Container className="home-section grid-3" style={{ padding: '46px 24px', gap: 20 }}>
        {items.map((item, i) => (
          <figure key={i} style={{ background: colors.surface, border: `1px solid ${colors.line}`, borderRadius: 16, padding: 26, margin: 0 }}>
            <div aria-hidden="true" style={{ color: colors.star, fontSize: 14, marginBottom: 12 }}>★★★★★</div>
            <blockquote style={{ margin: '0 0 18px', fontSize: 14.5, lineHeight: 1.85, color: colors.ink2 }}>
              {item.quote}
            </blockquote>
            <figcaption style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span style={{ width: 40, height: 40, flex: 'none' }}>
                <Avatar name={item.name} round iconSize={20} />
              </span>
              <span>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: colors.ink }}>{item.name}</span>
                <span style={{ display: 'block', fontSize: 12.5, color: colors.muted2 }}>{item.role}</span>
              </span>
            </figcaption>
          </figure>
        ))}
      </Container>
    </div>
  );
}

/* --------------------------- business + CTA --------------------------- */

function BusinessBanner() {
  const navigate = useNavigate();
  const settings = useSiteSettings();
  const business = settings.business || {};
  const stats = business.stats || [];

  return (
    <Container className="home-business-banner" style={{ padding: '48px 24px 20px' }}>
      <div
        className="grid-collapse-2"
        style={{
          background: gradients.darkPanel, borderRadius: 22, padding: '44px 46px', color: '#fff',
          display: 'grid', gridTemplateColumns: '1.2fr .8fr', gap: 38, alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontFamily: font, fontSize: 12, fontWeight: 700, color: colors.gold, letterSpacing: 1.5, marginBottom: 12 }}>
            {business.eyebrow}
          </div>
          <h2 style={{ margin: '0 0 12px', fontSize: 30, fontWeight: 700, lineHeight: 1.3 }}>{business.title}</h2>
          <p style={{ margin: '0 0 24px', fontSize: 16, color: '#c9c9dc', lineHeight: 1.75, maxWidth: 440 }}>{business.body}</p>
          <button
            type="button"
            onClick={() => navigate('/business')}
            style={{ background: '#fff', color: colors.ink, fontSize: 15.5, fontWeight: 700, padding: '14px 28px', borderRadius: 11, border: 'none', cursor: 'pointer' }}
          >
            {business.primary_cta}
          </button>
        </div>
        {stats.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {stats.map((stat, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 13, padding: 16 }}>
                <div style={{ fontSize: 23, fontWeight: 700 }}>{stat.num}</div>
                <div style={{ fontSize: 12.5, color: '#b6b6cc' }}>{stat.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Container>
  );
}

function FinalCta() {
  const navigate = useNavigate();
  const settings = useSiteSettings();
  const { t } = useI18n();

  return (
    <Container className="home-final-cta" style={{ padding: '26px 24px 56px' }}>
      <div
        style={{
          border: `1px solid ${colors.line}`, borderRadius: 18, background: colors.surfaceMuted, padding: 34,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 26, flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: DARK, marginBottom: 6 }}>{settings.home?.cta_title}</div>
          <div style={{ fontSize: 14.5, color: colors.muted }}>{settings.home?.cta_subtitle}</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={() => navigate('/pricing')} style={{ ...filledBtn, fontSize: 15.5, padding: '14px 28px' }}>
            {t('common.enroll')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/contact')}
            style={{ border: `1.5px solid #d6d9e4`, background: 'transparent', color: colors.ink, fontSize: 15.5, fontWeight: 600, padding: '14px 24px', borderRadius: 11, cursor: 'pointer' }}
          >
            {t('common.getApp')}
          </button>
        </div>
      </div>
    </Container>
  );
}

/* --------------------------------- page --------------------------------- */

export default function Home() {
  const [summary, setSummary] = useState(null);

  // Signed-out visitors never call the authed endpoint; a failure just leaves the
  // hero card on its featured-course variant.
  useEffect(() => {
    if (!isAuthed()) return undefined;
    let alive = true;
    auth.learningSummary()
      .then((data) => alive && setSummary(data))
      .catch(() => alive && setSummary(null));
    return () => { alive = false; };
  }, []);

  return (
    <div style={{ background: colors.surface }}>
      <Hero summary={summary} />
      <StatsBand />
      <CategoriesSection />
      <FreeVideosSection />
      <InstructorsSection />
      <Testimonials />
      <BusinessBanner />
      <FinalCta />
    </div>
  );
}
