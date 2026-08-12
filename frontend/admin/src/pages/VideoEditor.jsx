import { ArrowLeft, Eye, FolderInput, Save, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { ACCESS_TYPES, CATEGORY_KEYS, localizedCatalogValue, providerReady } from '../catalog.js';
import VideoFolderTree from '../components/VideoFolderTree.jsx';
import { Field, ErrText } from '../ui.jsx';
import { uploadForm } from '../vdocipher-upload.js';
import { useAdminLanguage } from '../i18n.jsx';

const emptyForm = {
  title: '', title_en: '', description: '', description_en: '', duration_minutes: '', category_id: '',
  price: '0', currency: 'EGP', access_days: '', access_type: 'general', status: 'draft', course_ids: [],
  is_protected: false,
};

function payload(form, includeCourses = false) {
  const { course_ids, ...metadata } = form;
  return {
    ...metadata,
    ...(includeCourses ? { course_ids } : {}),
    category_id: form.category_id ? Number(form.category_id) : null,
    price: Number(form.price || 0),
    access_days: form.access_days === '' ? null : Number(form.access_days),
    duration_minutes: form.duration_minutes === '' ? null : Number(form.duration_minutes),
  };
}

function payloadWithProvider(form, provider, includeCourses = false) {
  const catalogPayload = payload(form, includeCourses);
  return {
    ...catalogPayload,
    sync_provider_metadata: true,
    poster: provider?.poster || form.poster || '',
    duration_minutes: form.duration_minutes === '' && provider?.duration_seconds
      ? Math.max(1, Math.round(provider.duration_seconds / 60))
      : catalogPayload.duration_minutes,
  };
}

function previewUrl(preview) {
  return `https://player.vdocipher.com/v2/?otp=${encodeURIComponent(preview.otp)}&playbackInfo=${encodeURIComponent(preview.playbackInfo)}`;
}

function CatalogFields({ form, setForm, categories, courses, language, t, uploadLocal, removeLocal, uploading }) {
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  const toggle = (id) => setForm({ ...form, course_ids: form.course_ids.includes(id) ? form.course_ids.filter((value) => value !== id) : [...form.course_ids, id] });
  // paid videos always enforce the macOS Safari rule; free ones are opt-in
  const paidTier = form.access_type === 'baytarian' || form.access_type === 'general';
  return <>
    <div className="video-form-columns"><Field label={t('video.titleArabic')}><input value={form.title} onChange={set('title')} /></Field><Field label={t('video.titleEnglish')}><input dir="ltr" value={form.title_en} onChange={set('title_en')} /></Field></div>
    <div className="video-form-columns"><Field label={t('video.descriptionArabic')}><textarea value={form.description} onChange={set('description')} /></Field><Field label={t('video.descriptionEnglish')}><textarea dir="ltr" value={form.description_en} onChange={set('description_en')} /></Field></div>
    <div className="video-form-columns"><Field label={t('catalog.category')}><select value={form.category_id} onChange={set('category_id')}><option value="">{t('video.chooseCategory')}</option>{categories.filter((category) => CATEGORY_KEYS.includes(category.slug)).map((category) => <option value={category.id} key={category.id}>{localizedCatalogValue(category, 'name', language)}</option>)}</select></Field><Field label={t('catalog.accessType')}><select value={form.access_type} onChange={set('access_type')}>{ACCESS_TYPES.map((access) => <option value={access} key={access}>{t(`catalog.access.${access}`)}</option>)}</select></Field><Field label={t('catalog.status')}><select value={form.status} onChange={set('status')}>{['draft', 'published', 'unpublished'].map((status) => <option value={status} key={status}>{t(`catalog.status.${status}`)}</option>)}</select></Field></div>
    <div className="video-form-columns"><Field label={t('catalog.price')}><input type="number" min="0" value={form.price} onChange={set('price')} /></Field><Field label={t('catalog.currency')}><input dir="ltr" maxLength="3" value={form.currency} onChange={set('currency')} /></Field><Field label={t('catalog.accessDays')}><input type="number" min="1" value={form.access_days} onChange={set('access_days')} /></Field><Field label={t('video.duration')}><input type="number" min="0" value={form.duration_minutes} onChange={set('duration_minutes')} /></Field></div>
    <Field label={t('video.selfHosted')}>
      <div className="video-selfhost">
        <div style={{ fontSize: 12, color: 'var(--muted, #6b6b80)', marginBottom: 6 }}>{t('video.selfHostedHint')}</div>
        <input type="file" accept="video/mp4,video/quicktime,video/x-matroska,video/webm"
               disabled={!form.id || uploading}
               onChange={(event) => event.target.files?.[0] && uploadLocal(event.target.files[0])} />
        {!form.id && <div style={{ fontSize: 12, color: 'var(--muted, #6b6b80)' }}>{t('video.selfHostedSaveFirst')}</div>}
        {uploading > 0 && <div style={{ fontSize: 12 }}>{t('video.uploading')} {uploading}%</div>}
        {form.source === 'local' && (
          <div style={{ fontSize: 12, marginTop: 4 }}>
            {t('video.selfHostedStatus')}: <b>{form.local_status || '—'}</b>
            {form.local_status === 'ready' && ' ✅'}
            {form.local_error && <span style={{ color: '#b3261e' }}> — {form.local_error}</span>}
            <button type="button" className="btn btn-text btn-sm" onClick={removeLocal}>{t('video.selfHostedRemove')}</button>
          </div>
        )}
      </div>
    </Field>
    <Field label={t('video.captureProtection')}>
      <label className="video-protection-toggle" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          checked={paidTier || !!form.is_protected}
          disabled={paidTier}
          onChange={(event) => setForm({ ...form, is_protected: event.target.checked })}
        />
        <span>{paidTier ? t('video.captureProtectionPaid') : t('video.captureProtectionHint')}</span>
      </label>
    </Field>
    <Field label={t('video.assignCourses')}><div className="course-picker">{courses.map((course) => <label key={course.id}><input type="checkbox" checked={form.course_ids.includes(course.id)} onChange={() => toggle(course.id)} /> {localizedCatalogValue(course, 'title', language)}</label>)}{!courses.length && <span>{t('video.noCourses')}</span>}</div></Field>
  </>;
}

export default function VideoEditor({ routeParams, searchParams, setSearchParams }) {
  const { language, t } = useAdminLanguage();
  const navigate = useNavigate();
  const videoId = routeParams.videoId;
  const creating = !videoId;
  const [form, setForm] = useState(() => {
    const courseId = Number(searchParams.get('course'));
    return {
      ...emptyForm,
      course_ids: Number.isInteger(courseId) && courseId > 0 ? [courseId] : [],
    };
  });
  const [categories, setCategories] = useState([]);
  const [courses, setCourses] = useState([]);
  const [provider, setProvider] = useState(null);
  const [providerOnly, setProviderOnly] = useState(false);
  const [providerTitle, setProviderTitle] = useState('');
  const [providerDescription, setProviderDescription] = useState('');
  const [file, setFile] = useState(null);
  const [phase, setPhase] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [recovery, setRecovery] = useState(null);
  const [localError, setLocalError] = useState('');
  const [providerError, setProviderError] = useState('');
  const [uploading, setUploading] = useState(0);

  // Upload a file to our own server; the backend packages it as encrypted HLS in the
  // background, so poll until local_status settles.
  const uploadLocal = async (file) => {
    if (!videoId) return;
    setUploading(1);
    setLocalError('');
    try {
      const res = await api.videoUpload(videoId, file, setUploading);
      setForm((current) => ({ ...current, source: 'local', local_status: res?.video?.local_status || 'packaging' }));
      const poll = setInterval(async () => {
        try {
          const fresh = await api.video(videoId);
          const video = fresh.video || fresh;
          setForm((current) => ({ ...current, source: video.source, local_status: video.local_status, local_error: video.local_error }));
          if (video.local_status === 'ready' || video.local_status === 'failed') clearInterval(poll);
        } catch { clearInterval(poll); }
      }, 4000);
    } catch (error) {
      setLocalError(error.message);
    } finally {
      setUploading(0);
    }
  };

  const removeLocal = async () => {
    try {
      const res = await api.videoUploadDelete(videoId);
      setForm((current) => ({ ...current, source: res?.video?.source || 'vdocipher', local_status: null, local_error: null }));
    } catch (error) { setLocalError(error.message); }
  };

  const [providerDetail, setProviderDetail] = useState('');
  const [preview, setPreview] = useState(null);

  const providerId = form.vdocipher_video_id || provider?.id || '';
  const folderId = searchParams.get('folder') || 'root';
  const busy = phase !== 'idle';
  const canPreview = useMemo(() => providerReady(provider), [provider]);

  const selectFolder = (id) => {
    const next = new URLSearchParams(searchParams);
    if (id === 'root') next.delete('folder');
    else next.set('folder', id);
    setSearchParams(next);
  };

  useEffect(() => {
    api.categories().then((result) => setCategories(result.categories || [])).catch(() => setCategories([]));
    api.courses({ per_page: 100 }).then((result) => setCourses(result.courses || [])).catch(() => setCourses([]));
  }, []);
  useEffect(() => {
    if (!videoId) return;
    let active = true;
    const set = (fn) => active && fn();
    const loadProvider = async (id, catalogVideo) => {
      try {
        const result = await api.vdocipherVideo(id);
        const video = result.video || result;
        set(() => { setProvider(video); setProviderTitle(video.title || ''); setProviderDescription(video.description || ''); });
        const metadata = {};
        if (!catalogVideo.poster && video.poster) metadata.poster = video.poster;
        if (!catalogVideo.duration_minutes && video.duration_seconds) metadata.duration_minutes = Math.max(1, Math.round(video.duration_seconds / 60));
        if (Object.keys(metadata).length) await api.videoUpdate(videoId, metadata);
      } catch (error) { set(() => setProviderError(error.message)); }
    };
    (async () => {
      try {
        const result = await api.video(videoId);
        const video = result.video;
        set(() => setForm({ ...emptyForm, ...video, category_id: video.category?.id || '', price: String(video.price ?? 0), access_days: video.access_days ?? '', duration_minutes: video.duration_minutes ?? '', course_ids: (video.courses || []).map((course) => course.id) }));
        if (video.vdocipher_video_id) await loadProvider(video.vdocipher_video_id, video);
      } catch (error) {
        if (error.status !== 404) { set(() => setLocalError(error.message)); return; }
        try {
          const result = await api.vdocipherVideo(videoId);
          const video = result.video || result;
          set(() => { setProviderOnly(true); setProvider(video); setProviderTitle(video.title || ''); setProviderDescription(video.description || ''); setForm({ ...emptyForm, title: video.title || '', description: video.description || '', vdocipher_video_id: video.id }); });
        } catch (providerFailure) { set(() => setLocalError(providerFailure.message)); }
      }
    })();
    return () => { active = false; };
  }, [videoId]);

  const validate = (requiresUpload) => {
    if (!form.title.trim()) return t('video.validation.title');
    if (requiresUpload && !form.description.trim()) return t('video.validation.description');
    if (requiresUpload && !form.category_id) return t('video.validation.category');
    if (creating && !file) return t('video.validation.file');
    if (file && !file.type.startsWith('video/')) return t('video.validation.videoFile');
    return '';
  };
  const retryImport = async (savedRecovery) => {
    setPhase('import');
    try {
      const result = await api.vdocipherImport(savedRecovery.importPayload, { skipAdminDataChanged: true });
      setRecovery(null);
      navigate(`/videos/${result.video.id}`);
    } catch (error) { setRecovery({ ...savedRecovery, step: 'import' }); setLocalError(error.message); }
    finally { setPhase('idle'); }
  };
  const updateProviderThenImport = async (savedRecovery) => {
    setPhase('provider');
    try {
      await api.vdocipherVideoUpdate(savedRecovery.providerId, savedRecovery.providerPayload, { skipAdminDataChanged: true });
      setProviderError('');
      await retryImport({ ...savedRecovery, step: 'import' });
    } catch (error) { setRecovery({ ...savedRecovery, step: 'provider' }); setProviderError(error.message); setPhase('idle'); }
  };
  const upload = async () => {
    const invalid = validate(true);
    if (invalid) { setLocalError(invalid); return; }
    setLocalError(''); setProviderError(''); setRecovery(null); setProgress(0); setPhase('credentials');
    let credentials;
    try { credentials = await api.vdocipherUploadCredentials({ title: form.title.trim(), folder_id: folderId }); }
    catch (error) { setLocalError(error.message); setPhase('idle'); return; }
    const formData = new FormData();
    Object.entries(credentials.fields).forEach(([key, value]) => formData.append(key, value));
    formData.append('success_action_status', '201'); formData.append('success_action_redirect', ''); formData.append('file', file);
    setPhase('storage');
    try { await uploadForm(credentials.upload_link, formData, setProgress); }
    catch (error) { setLocalError('upload'); setPhase('idle'); return; }
    const savedRecovery = { providerId: credentials.video_id, providerPayload: { title: form.title.trim(), description: form.description }, importPayload: { ...payloadWithProvider(form, provider, true), video_id: credentials.video_id }, step: 'provider' };
    setRecovery(savedRecovery);
    await updateProviderThenImport(savedRecovery);
  };
  const saveCatalog = async () => {
    const invalid = validate(providerOnly);
    if (invalid) { setLocalError(invalid); return; }
    setPhase('local'); setLocalError('');
    try {
      if (providerOnly) {
        const result = await api.vdocipherImport({ ...payloadWithProvider(form, provider, true), video_id: providerId });
        navigate(`/videos/${result.video.id}`);
      } else { await api.videoUpdate(videoId, payloadWithProvider(form, provider)); await api.videoCoursesSet(videoId, form.course_ids); }
    } catch (error) { setLocalError(error.message); } finally { setPhase('idle'); }
  };
  const saveProvider = async () => {
    if (!providerId || !providerTitle.trim()) return;
    setPhase('provider'); setProviderError('');
    try { const result = await api.vdocipherVideoUpdate(providerId, { title: providerTitle.trim(), description: providerDescription }); setProvider(result.video || { ...provider, title: providerTitle, description: providerDescription }); }
    catch (error) { setProviderError(error.message); setProviderDetail(error.data?.detail || ''); } finally { setPhase('idle'); }
  };
  const moveVideo = async () => {
    if (!providerId) return;
    setPhase('move');
    try { await api.vdocipherMove({ folder_id: folderId, video_ids: [providerId], folder_ids: [] }); }
    catch (error) { setProviderError(error.message); setProviderDetail(error.data?.detail || ''); } finally { setPhase('idle'); }
  };
  const openPreview = async () => { try { setPreview(await api.vdocipherPreview(providerId)); } catch (error) { setProviderError(error.message); setProviderDetail(error.data?.detail || ''); } };
  const message = (error) => {
    const validationMessages = [t('video.validation.title'), t('video.validation.description'), t('video.validation.category'), t('video.validation.file'), t('video.validation.videoFile')];
    if (validationMessages.includes(error)) return error;
    if (error === 'no_api_key') return <>{t('video.noApiKey')} <Link to="/settings">{t('nav.settings')}</Link></>;
    // 403 = valid key, request refused (trial video cap, missing permission). Show VdoCipher's own words.
    if (error === 'vdocipher_forbidden') return <>{t('video.providerRefused')}{providerDetail ? ` — ${providerDetail}` : ''}</>;
    if (error === 'upload') return t('video.uploadFailed');
    if (error === 'import_failed') return t('video.importFailed');
    return error ? t('errors.load') : '';
  };

  return <section className="video-editor"><Link className="back-link" to="/videos"><ArrowLeft size={16} /> {t('common.back')}</Link><h2>{creating ? t('pages.videoNew') : t('pages.videoDetails')}</h2><ErrText>{message(localError)}</ErrText>
    <div className="video-editor-layout"><section className="video-editor-panel"><h3>{t('video.catalogMetadata')}</h3><CatalogFields form={form} setForm={setForm} categories={categories} courses={courses} language={language} t={t} uploadLocal={uploadLocal} removeLocal={removeLocal} uploading={uploading} />
      {(creating || providerOnly) && <><h3>{t('video.folder')}</h3><VideoFolderTree selectedId={folderId} onSelect={selectFolder} picker />{creating && <Field label={t('video.file')}><input type="file" accept="video/*" onChange={(event) => setFile(event.target.files?.[0] || null)} /></Field>}</>}
      {creating && busy && <progress max="100" value={progress} />}
      <button className="btn btn-filled" type="button" disabled={busy} onClick={creating ? upload : saveCatalog}>{creating ? <><Upload size={16} /> {t('video.uploadVideo')}</> : providerOnly ? t('common.import') : <><Save size={16} /> {t('common.save')}</>}</button>
      {recovery && <div className="video-recovery"><p>{t('video.storageComplete')} <strong dir="ltr">{recovery.providerId}</strong></p><button className="btn btn-tonal" type="button" disabled={busy} onClick={() => recovery.step === 'provider' ? updateProviderThenImport(recovery) : retryImport(recovery)}>{recovery.step === 'provider' ? t('video.retryProvider') : t('video.retryImport')}</button></div>}
    </section>
    {!creating && <section className="video-editor-panel"><h3>{t('video.providerMetadata')}</h3><ErrText>{message(providerError)}</ErrText>{provider ? <><Field label={t('video.providerTitle')}><input dir="ltr" value={providerTitle} onChange={(event) => setProviderTitle(event.target.value)} /></Field><Field label={t('video.providerDescription')}><textarea dir="ltr" value={providerDescription} onChange={(event) => setProviderDescription(event.target.value)} /></Field><div className="row"><button className="btn btn-tonal" type="button" disabled={busy} onClick={saveProvider}>{t('common.save')}</button>{canPreview && <button className="btn btn-filled" type="button" onClick={openPreview}><Eye size={16} /> {t('video.preview')}</button>}</div><h3>{t('video.moveVideo')}</h3><VideoFolderTree selectedId={folderId} onSelect={selectFolder} picker /><button className="btn btn-tonal" type="button" disabled={busy} onClick={moveVideo}><FolderInput size={16} /> {t('video.moveHere')}</button>{!canPreview && <p className="video-encoding">{t('video.encoding')}</p>}{preview && <iframe className="video-preview" title={t('video.preview')} src={previewUrl(preview)} allow="encrypted-media" />}</> : <div className="video-skeletons"><span /><span /></div>}</section>}</div>
  </section>;
}
