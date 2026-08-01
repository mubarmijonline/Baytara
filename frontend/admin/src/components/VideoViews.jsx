import { List, Grid2X2, Table2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { durationLabel, posterFor } from '../catalog.js';
import { useAdminLanguage } from '../i18n.jsx';

function Poster({ video }) {
  const { t } = useAdminLanguage();
  const poster = posterFor(video);
  return poster ? <img className="video-poster" src={poster} alt="" /> : <div className="video-poster video-poster-fallback" role="img" aria-label={t('video.posterFallback')}>{t('admin.brand')}</div>;
}

function State({ video }) {
  const { t } = useAdminLanguage();
  const status = String(video.status || '').toLowerCase();
  return <span className={`chip chip-${status || 'unknown'}`}>{status ? t(`video.providerStatus.${status}`) : t('video.providerStatus.unknown')}</span>;
}

function Duration({ video }) {
  const { t } = useAdminLanguage();
  const minutes = durationLabel(video.duration_seconds, video.catalog?.duration_minutes);
  return minutes ? `${minutes} ${t('video.minutes')}` : t('video.notAvailable');
}

function Assignments({ video, names = false }) {
  const { t } = useAdminLanguage();
  const courses = video.catalog?.courses || [];
  if (names) return courses.length ? courses.map((course) => course.title).join(', ') : t('video.assignment.unassigned');
  return `${courses.length} ${courses.length === 1 ? t('video.courseCount') : t('video.courseCountPlural')}`;
}

function Metadata({ video, compact = false }) {
  const { t } = useAdminLanguage();
  const category = video.catalog?.category?.name || t('video.notAvailable');
  const access = video.catalog?.access_type ? t(`catalog.access.${video.catalog.access_type}`) : t('video.notAvailable');
  return <div className={`video-metadata ${compact ? 'compact' : ''}`}><span>{category}</span><span className="chip">{access}</span><Duration video={video} /><Assignments video={video} /></div>;
}

function VideoLink({ video, children }) {
  return <Link className="video-item-link" to={`/videos/${video.catalog?.id || video.id}`}>{children}</Link>;
}

export function VideoViewSwitcher({ view, onChange }) {
  const { t } = useAdminLanguage();
  const controls = [[Grid2X2, 'grid'], [List, 'list'], [Table2, 'table']];
  return <div className="view-switcher" aria-label={t('video.view')}>{controls.map(([Icon, value]) => <button key={value} className={`icon-button ${view === value ? 'active' : ''}`} type="button" aria-label={t(`video.view.${value}`)} title={t(`video.view.${value}`)} onClick={() => onChange(value)}><Icon size={17} /></button>)}</div>;
}

export default function VideoViews({ view, videos }) {
  const { t } = useAdminLanguage();
  if (view === 'table') return <table className="table video-table" data-testid="video-table"><thead><tr><th>{t('video.title')}</th><th>{t('video.providerId')}</th><th>{t('video.uploadDate')}</th><th>{t('video.providerState')}</th><th>{t('video.duration')}</th><th>{t('catalog.category')}</th><th>{t('catalog.accessType')}</th><th>{t('video.assignments')}</th></tr></thead><tbody>{videos.map((video) => <tr key={video.id}><td><VideoLink video={video}>{video.title || video.id}</VideoLink></td><td dir="ltr">{video.id}</td><td>{video.uploaded_at || t('video.notAvailable')}</td><td><State video={video} /></td><td><Duration video={video} /></td><td>{video.catalog?.category?.name || t('video.notAvailable')}</td><td>{video.catalog?.access_type ? t(`catalog.access.${video.catalog.access_type}`) : t('video.notAvailable')}</td><td><Assignments video={video} names /></td></tr>)}{!videos.length && <tr><td colSpan="8" className="empty">{t('video.empty')}</td></tr>}</tbody></table>;
  if (view === 'list') return <div className="video-list" data-testid="video-list">{videos.map((video) => <VideoLink key={video.id} video={video}><article className="video-list-row"><Poster video={video} /><div><strong>{video.title || video.id}</strong><small dir="ltr">{video.id}</small><Metadata video={video} compact /></div><State video={video} /></article></VideoLink>)}{!videos.length && <div className="empty">{t('video.empty')}</div>}</div>;
  return <div className="video-grid" data-testid="video-grid">{videos.map((video) => <VideoLink key={video.id} video={video}><article className="video-card"><Poster video={video} /><div className="video-card-body"><strong>{video.title || video.id}</strong><small dir="ltr">{video.id}</small><State video={video} /><Metadata video={video} /></div></article></VideoLink>)}{!videos.length && <div className="empty">{t('video.empty')}</div>}</div>;
}
