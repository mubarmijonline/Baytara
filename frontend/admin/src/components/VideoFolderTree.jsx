import { ChevronDown, ChevronRight, Folder, FolderOpen, FolderPlus, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { confirmDialog, promptDialog } from '../dialog.jsx';
import { useAdminLanguage } from '../i18n.jsx';

function Node({ folder, depth, selectedId, onSelect, revision }) {
  const { t } = useAdminLanguage();
  const [expanded, setExpanded] = useState(folder.id === 'root');
  const [children, setChildren] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => { setChildren(null); }, [revision]);
  useEffect(() => {
    if (!expanded || children !== null) return;
    api.vdocipherFolder(folder.id).then((data) => setChildren(data.folders || [])).catch(() => setError(true));
  }, [children, expanded, folder.id]);
  return <li><div className={`video-folder-row ${selectedId === folder.id ? 'selected' : ''}`} style={{ paddingInlineStart: depth * 14 }}><button className="icon-button" type="button" aria-label={expanded ? t('video.collapseFolder') : t('video.expandFolder')} onClick={() => { setExpanded((value) => !value); onSelect(folder.id); }}>{expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button><button className="video-folder-select" type="button" onClick={() => onSelect(folder.id)}>{expanded ? <FolderOpen size={16} /> : <Folder size={16} />} {folder.name || t('video.libraryRoot')}</button></div>{expanded && <ul className="video-folder-children">{children === null && <li className="video-folder-loading">{t('common.loading')}</li>}{error && <li className="error-text">{t('errors.load')}</li>}{(children || []).map((child) => <Node key={child.id} folder={child} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} revision={revision} />)}</ul>}</li>;
}

export default function VideoFolderTree({ selectedId = 'root', onSelect, picker = false }) {
  const { t } = useAdminLanguage();
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const refresh = () => setRevision((value) => value + 1);
  const create = async () => { const name = await promptDialog(t('video.folderName')); if (!name) return; try { const result = await api.vdocipherFolderCreate({ name, parent_id: selectedId }); onSelect(result.folder?.id || selectedId); refresh(); } catch (caught) { setError(caught.message); } };
  const rename = async () => { if (selectedId === 'root') return; const name = await promptDialog(t('video.folderRename')); if (!name) return; try { await api.vdocipherFolderRename(selectedId, { name }); refresh(); } catch (caught) { setError(caught.message); } };
  const remove = async () => { if (selectedId === 'root' || !await confirmDialog(t('video.folderDeleteConfirm'))) return; try { await api.vdocipherFolderDelete(selectedId); onSelect('root'); refresh(); } catch (caught) { setError(caught.message); } };
  return <aside className={`video-folder-tree ${picker ? 'video-folder-picker' : ''}`} aria-label={t('video.folders')}><div className="video-folder-heading"><h3>{t('video.folders')}</h3><div className="folder-actions"><button className="icon-button" type="button" aria-label={t('video.createFolder')} title={t('video.createFolder')} onClick={create}><FolderPlus size={16} /></button>{selectedId !== 'root' && <><button className="icon-button" type="button" aria-label={t('video.renameFolder')} title={t('video.renameFolder')} onClick={rename}><Pencil size={16} /></button><button className="icon-button" type="button" aria-label={t('video.deleteFolder')} title={t('video.deleteFolder')} onClick={remove}><Trash2 size={16} /></button></>}</div></div>{error && <div className="error-text">{error}</div>}<ul><Node folder={{ id: 'root', name: t('video.libraryRoot') }} depth={0} selectedId={selectedId} onSelect={onSelect} revision={revision} /></ul></aside>;
}
