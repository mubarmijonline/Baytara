import { ChevronDown, ChevronRight, Folder, FolderOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAdminLanguage } from '../i18n.jsx';

function FolderNode({ folder, depth, selectedId, onSelect }) {
  const { t } = useAdminLanguage();
  const [expanded, setExpanded] = useState(folder.id === 'root');
  const [children, setChildren] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!expanded || children !== null) return;
    api.vdocipherFolder(folder.id).then((data) => setChildren(data.folders || [])).catch(() => setError(true));
  }, [children, expanded, folder.id]);

  const open = () => {
    setExpanded((value) => !value);
    onSelect(folder.id);
  };
  return (
    <li>
      <div className={`video-folder-row ${selectedId === folder.id ? 'selected' : ''}`} style={{ paddingInlineStart: depth * 14 }}>
        <button className="icon-button" type="button" aria-label={expanded ? t('video.collapseFolder') : t('video.expandFolder')} onClick={open}>
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <button className="video-folder-select" type="button" onClick={() => onSelect(folder.id)}>
          {expanded ? <FolderOpen size={16} /> : <Folder size={16} />} {folder.name || t('video.libraryRoot')}
        </button>
      </div>
      {expanded && <ul className="video-folder-children">
        {children === null && <li className="video-folder-loading">{t('common.loading')}</li>}
        {error && <li className="error-text">{t('errors.load')}</li>}
        {(children || []).map((child) => <FolderNode key={child.id} folder={child} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />)}
      </ul>}
    </li>
  );
}

export default function VideoFolderTree({ selectedId = 'root', onSelect }) {
  const { t } = useAdminLanguage();
  return (
    <aside className="video-folder-tree" aria-label={t('video.folders')}>
      <h3>{t('video.folders')}</h3>
      <ul><FolderNode folder={{ id: 'root', name: t('video.libraryRoot') }} depth={0} selectedId={selectedId} onSelect={onSelect} /></ul>
    </aside>
  );
}
