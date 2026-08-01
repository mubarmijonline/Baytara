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
  return <span className={`chip chip-${video.status || 'draft'}`}>{video.status === 'ready' ? t('video.ready') : video.status || t('video.encoding')}</span>;
}

function Duration({ video }) {
  const { t } = useAdminLanguage();
  const minutes = durationLabel(video.duration_seconds, video.catalog?.duration_minutes);
  return minutes ? `${minutes} ${t('video.minutes')}` : '';
}

function VideoLink({ video, children }) {
  return <Link className="video-item-link" to={`/videos/${video.catalog?.id || video.id}`}>{children}</Link>;
}

export function VideoViewSwitcher({ view, onChange }) {
  const { t } = useAdminLanguage();
  const controls = [[Grid2X2, 'grid'], [List, 'list'], [Table2, 'table']];
  return <div className="view-switcher" aria-label={t('video.view')}>
    {controls.map(([Icon, value]) => <button key={value} className={`icon-button ${view === value ? 'active' : ''}`} type="button" aria-label={t(`video.view.${value}`)} title={t(`video.view.${value}`)} onClick={() => onChange(value)}><Icon size={17} /></button>)}
  </div>;
}

export default function VideoViews({ view, videos }) {
  const { t } = useAdminLanguage();
  if (view === 'table') return <table className="table video-table" data-testid="video-table">
    <thead><tr><th>{t('video.title')}</th><th>{t('video.providerId')}</th><th>{t('video.duration')}</th><th>{t('video.assignments')}</th><th>{t('video.providerState')}</th></tr></thead>
    <tbody>{videos.map((video) => <tr key={video.id}><td><VideoLink video={video}>{video.title || video.id}</VideoLink></td><td dir="ltr">{video.id}</td><td><Duration video={video} /></td><td>{video.catalog?.courses?.length || 0}</td><td><State video={video} /></td></tr>)}
      {!videos.length && <tr><td colSpan="5" className="empty">{t('video.empty')}</td></tr>}
    </tbody>
  </table>;
  if (view === 'list') return <div className="video-list" data-testid="video-list">{videos.map((video) => <VideoLink key={video.id} video={video}><article className="video-list-row"><Poster video={video} /><div><strong>{video.title || video.id}</strong><small dir="ltr">{video.id}</small></div><State video={video} /></article></VideoLink>)}{!videos.length && <div className="empty">{t('video.empty')}</div>}</div>;
  return <div className="video-grid" data-testid="video-grid">{videos.map((video) => <VideoLink key={video.id} video={video}><article className="video-card"><Poster video={video} /><div className="video-card-body"><strong>{video.title || video.id}</strong><small dir="ltr">{video.id}</small><State video={video} /></div></article></VideoLink>)}{!videos.length && <div className="empty">{t('video.empty')}</div>}</div>;
}
