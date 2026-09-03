import { useState } from 'react';
import { Edit3, List, Grid2X2, Table2, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { confirmDialog } from '../dialog.jsx';
import { toast } from '../toast.jsx';
import { durationLabel, posterFor } from '../catalog.js';
import { useAdminLanguage } from '../i18n.jsx';

function Poster({ video }) {
  const { t } = useAdminLanguage();
  const poster = posterFor(video);
  return poster ? <img className="video-poster" src={poster} alt="" /> : <div className="video-poster video-poster-fallback" role="img" aria-label={t('video.posterFallback')}>{t('admin.brand')}</div>;
}

function Delivery({ video }) {
  const { t } = useAdminLanguage();
  const local = video.catalog?.source === 'local' || (!video.provider_id && video.catalog);
  if (!local) return <span className="chip chip-role">{t('video.deliveryProvider')}</span>;
  const status = video.catalog?.local_status;
  const tone = status === 'ready' ? 'published' : status === 'failed' ? 'unpublished' : 'draft';
  return (
    <span className={`chip chip-${tone}`} title={video.catalog?.local_error || ''}>
      {t('video.deliveryLocal')}{status && status !== 'ready' ? ` · ${t(`videoUpload.status.${status}`)}` : ''}
    </span>
  );
}

function ProviderState({ video }) {
  const { t } = useAdminLanguage();
  const status = String(video.status || '').toLowerCase();
  return <span className={`chip chip-${status || 'unknown'}`}>{status ? t(`video.providerStatus.${status}`) : t('video.providerStatus.unknown')}</span>;
}

function Publication({ video }) {
  const { t } = useAdminLanguage();
  const status = video.catalog?.status;
  return <span className={`chip chip-${status || 'publication-unknown'}`}>{status ? t(`catalog.status.${status}`) : t('video.notAvailable')}</span>;
}

function localized(entity, base, english, language) {
  if (!entity) return '';
  return language === 'en' ? entity[english] || entity[base] : entity[base] || entity[english];
}

function titleFor(video, language) {
  return localized(video.catalog, 'title', 'title_en', language) || video.title || video.id;
}

function categoryFor(video, language) {
  return localized(video.catalog?.category, 'name', 'name_en', language);
}

function Duration({ video }) {
  const { t } = useAdminLanguage();
  const minutes = durationLabel(video.duration_seconds, video.catalog?.duration_minutes);
  return minutes ? `${minutes} ${t('video.minutes')}` : t('video.notAvailable');
}

function Assignments({ video, names = false }) {
  const { language, t } = useAdminLanguage();
  const courses = video.catalog?.courses || [];
  if (names) return courses.length ? courses.map((course) => localized(course, 'title', 'title_en', language)).join(', ') : t('video.assignment.unassigned');
  return `${courses.length} ${courses.length === 1 ? t('video.courseCount') : t('video.courseCountPlural')}`;
}

function ProviderId({ video }) {
  const { t } = useAdminLanguage();
  const id = video.provider_id === undefined ? video.id : video.provider_id;
  return id || t('video.notAvailable');
}

function Metadata({ video, compact = false }) {
  const { language, t } = useAdminLanguage();
  const category = categoryFor(video, language) || t('video.notAvailable');
  const access = video.catalog?.access_type ? t(`catalog.access.${video.catalog.access_type}`) : t('video.notAvailable');
  return <div className={`video-metadata ${compact ? 'compact' : ''}`}><Publication video={video} /><span>{category}</span><span className="chip">{access}</span><Duration video={video} /><Assignments video={video} /></div>;
}

function editTarget(video) {
  return `/videos/${video.catalog?.id || video.id}`;
}

function detailRows(video, language, t) {
  const providerId = video.provider_id === undefined ? video.id : video.provider_id;
  return [
    [t('video.title'), titleFor(video, language)],
    [t('video.providerId'), <span dir="ltr">{providerId || t('video.notAvailable')}</span>],
    [t('catalog.category'), categoryFor(video, language) || t('video.notAvailable')],
    [t('catalog.accessType'), video.catalog?.access_type ? t(`catalog.access.${video.catalog.access_type}`) : t('video.notAvailable')],
    [t('video.publication'), video.catalog?.status ? t(`catalog.status.${video.catalog.status}`) : t('video.notAvailable')],
    [t('video.providerState'), String(video.status || '').toLowerCase() ? t(`video.providerStatus.${String(video.status).toLowerCase()}`) : t('video.providerStatus.unknown')],
    [t('video.duration'), <Duration video={video} />],
    [t('video.uploadDate'), video.uploaded_at || t('video.notAvailable')],
    [t('video.assignments'), <Assignments video={video} names />],
  ];
}

function VideoDetailsDialog({ video, onClose, onDeleted }) {
  const { language, t } = useAdminLanguage();
  const [deleting, setDeleting] = useState(false);
  const title = titleFor(video, language);
  const catalogId = video.catalog?.id;

  // Deleting takes the packaged files with it, so it is worth one confirmation naming
  // the video. The server still refuses anything a course or a purchase depends on.
  const remove = async () => {
    if (!catalogId || !await confirmDialog(t('video.deleteConfirm').replace('{title}', title))) return;
    setDeleting(true);
    try {
      await api.videoDelete(catalogId);
      toast.success(t('video.deleted'));
      onDeleted?.(catalogId);
      onClose();
    } catch (error) {
      toast.error(error.data?.error === 'video_in_use' ? t('video.deleteInUse') : t('errors.generic'));
      setDeleting(false);
    }
  };
  const description = localized(video.catalog, 'description', 'description_en', language) || video.description || '';
  return (
    <div className="video-detail-overlay" role="presentation" onMouseDown={onClose}>
      <aside
        className="video-detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="video-detail-drawer-header">
          <div>
            <span>{t('video.allDetails')}</span>
            <h3>{title}</h3>
          </div>
          <button className="icon-button" type="button" aria-label={t('common.close')} onClick={onClose}><X size={18} /></button>
        </header>
        <Poster video={video} />
        {description && <p className="video-detail-description">{description}</p>}
        <div className="video-detail-facts">
          {detailRows(video, language, t).map(([label, value]) => (
            <div key={label} className="video-detail-fact"><span>{label}</span><strong>{value}</strong></div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 12px' }}>
          <Delivery video={video} />
        </div>
        <div className="video-detail-actions">
          <Link className="btn btn-filled btn-sm" to={editTarget(video)}><Edit3 size={15} /> {t('video.editMetadata')}</Link>
          {catalogId && (
            <button className="btn btn-error btn-sm" type="button" disabled={deleting} onClick={remove}>
              <Trash2 size={15} /> {deleting ? t('video.deleting') : t('common.delete')}
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}

function VideoOpenButton({ video, children, className = '', onClick }) {
  const { language, t } = useAdminLanguage();
  return (
    <button className={`video-open-button ${className}`} type="button" aria-label={`${t('video.viewDetailsFor')} ${titleFor(video, language)}`} onClick={onClick}>
      {children}
    </button>
  );
}

export function VideoViewSwitcher({ view, onChange }) {
  const { t } = useAdminLanguage();
  const controls = [[Grid2X2, 'grid'], [List, 'list'], [Table2, 'table']];
  return <div className="view-switcher" aria-label={t('video.view')}>{controls.map(([Icon, value]) => <button key={value} className={`icon-button ${view === value ? 'active' : ''}`} type="button" aria-label={t(`video.view.${value}`)} title={t(`video.view.${value}`)} onClick={() => onChange(value)}><Icon size={17} /></button>)}</div>;
}

export default function VideoViews({ view, videos, onDeleted }) {
  const { language, t } = useAdminLanguage();
  const [selected, setSelected] = useState(null);
  const open = (video) => (event) => {
    event.preventDefault();
    setSelected(video);
  };
  const detail = selected
    ? <VideoDetailsDialog video={selected} onClose={() => setSelected(null)} onDeleted={onDeleted} />
    : null;
  if (view === 'table') return <>{detail}<div className="video-table-scroll" data-testid="video-table-scroll"><table className="table video-table" data-testid="video-table"><thead><tr><th>{t('video.title')}</th><th>{t('video.providerId')}</th><th>{t('video.uploadDate')}</th><th>{t('video.delivery')}</th><th>{t('video.providerState')}</th><th>{t('video.publication')}</th><th>{t('video.duration')}</th><th>{t('catalog.category')}</th><th>{t('catalog.accessType')}</th><th>{t('video.assignments')}</th></tr></thead><tbody>{videos.map((video) => <tr key={video.id}><td><VideoOpenButton video={video} className="video-title-button" onClick={open(video)}>{titleFor(video, language)}</VideoOpenButton></td><td dir="ltr"><ProviderId video={video} /></td><td>{video.uploaded_at || t('video.notAvailable')}</td><td><Delivery video={video} /></td><td><ProviderState video={video} /></td><td><Publication video={video} /></td><td><Duration video={video} /></td><td>{categoryFor(video, language) || t('video.notAvailable')}</td><td>{video.catalog?.access_type ? t(`catalog.access.${video.catalog.access_type}`) : t('video.notAvailable')}</td><td><Assignments video={video} names /></td></tr>)}{!videos.length && <tr><td colSpan="9" className="empty">{t('video.empty')}</td></tr>}</tbody></table></div></>;
  if (view === 'list') return <>{detail}<div className="video-list" data-testid="video-list">{videos.map((video) => <VideoOpenButton key={video.id} video={video} onClick={open(video)}><article className="video-list-row"><Poster video={video} /><div><strong>{titleFor(video, language)}</strong><small dir="ltr"><ProviderId video={video} /></small><Metadata video={video} compact /></div><div className="video-row-chips"><Delivery video={video} /><ProviderState video={video} /></div></article></VideoOpenButton>)}{!videos.length && <div className="empty">{t('video.empty')}</div>}</div></>;
  return <>{detail}<div className="video-grid" data-testid="video-grid">{videos.map((video) => <VideoOpenButton key={video.id} video={video} onClick={open(video)}><article className="video-card"><Poster video={video} /><div className="video-card-body"><strong>{titleFor(video, language)}</strong><small dir="ltr"><ProviderId video={video} /></small><div className="video-row-chips"><Delivery video={video} /><ProviderState video={video} /></div><Metadata video={video} /></div></article></VideoOpenButton>)}{!videos.length && <div className="empty">{t('video.empty')}</div>}</div></>;
}
