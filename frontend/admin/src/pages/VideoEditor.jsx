import { ArrowLeft, Eye, Save, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { ACCESS_TYPES, CATEGORY_KEYS, providerReady } from '../catalog.js';
import { Field, ErrText } from '../ui.jsx';
import { uploadForm } from '../vdocipher-upload.js';
import { useAdminLanguage } from '../i18n.jsx';

const emptyForm = {
  title: '', title_en: '', description: '', duration_minutes: '', category_id: '',
  price: '0', currency: 'EGP', access_days: '', access_type: 'general', status: 'draft', course_ids: [],
};

function CatalogFields({ form, setForm, categories, courses, t }) {
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  const toggleCourse = (id) => setForm({ ...form, course_ids: form.course_ids.includes(id) ? form.course_ids.filter((current) => current !== id) : [...form.course_ids, id] });
  return <>
    <div className="video-form-columns">
      <Field label={t('video.titleArabic')}><input value={form.title} onChange={set('title')} /></Field>
      <Field label={t('video.titleEnglish')}><input dir="ltr" value={form.title_en} onChange={set('title_en')} /></Field>
    </div>
    <Field label={t('video.description')}><textarea value={form.description} onChange={set('description')} /></Field>
    <div className="video-form-columns">
      <Field label={t('catalog.category')}><select value={form.category_id} onChange={set('category_id')}><option value="">{t('video.chooseCategory')}</option>{categories.filter((category) => CATEGORY_KEYS.includes(category.slug)).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></Field>
      <Field label={t('catalog.accessType')}><select value={form.access_type} onChange={set('access_type')}>{ACCESS_TYPES.map((access) => <option value={access} key={access}>{t(`catalog.access.${access}`)}</option>)}</select></Field>
      <Field label={t('catalog.status')}><select value={form.status} onChange={set('status')}>{['draft', 'published', 'unpublished'].map((status) => <option value={status} key={status}>{t(`catalog.status.${status}`)}</option>)}</select></Field>
    </div>
    <div className="video-form-columns">
      <Field label={t('catalog.price')}><input type="number" min="0" value={form.price} onChange={set('price')} /></Field>
      <Field label={t('catalog.currency')}><input dir="ltr" maxLength="3" value={form.currency} onChange={set('currency')} /></Field>
      <Field label={t('catalog.accessDays')}><input type="number" min="1" value={form.access_days} onChange={set('access_days')} /></Field>
      <Field label={t('video.duration')}><input type="number" min="0" value={form.duration_minutes} onChange={set('duration_minutes')} /></Field>
    </div>
    <Field label={t('video.assignCourses')}><div className="course-picker">{courses.map((course) => <label key={course.id}><input type="checkbox" checked={form.course_ids.includes(course.id)} onChange={() => toggleCourse(course.id)} /> {course.title}</label>)}{!courses.length && <span>{t('video.noCourses')}</span>}</div></Field>
  </>;
}

function cataloguePayload(form, includeCourses = false) {
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

function previewUrl(preview) {
  return `https://player.vdocipher.com/v2/?otp=${encodeURIComponent(preview.otp)}&playbackInfo=${encodeURIComponent(preview.playbackInfo)}`;
}

export default function VideoEditor({ routeParams, searchParams }) {
  const { t } = useAdminLanguage();
  const navigate = useNavigate();
  const videoId = routeParams.videoId;
  const creating = !videoId;
  const [form, setForm] = useState(emptyForm);
  const [categories, setCategories] = useState([]);
  const [courses, setCourses] = useState([]);
  const [provider, setProvider] = useState(null);
  const [providerOnly, setProviderOnly] = useState(false);
  const [providerTitle, setProviderTitle] = useState('');
  const [providerDescription, setProviderDescription] = useState('');
  const [file, setFile] = useState(null);
  const [folderId, setFolderId] = useState(searchParams.get('folder') || 'root');
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState(null);
  const [uploadedId, setUploadedId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.categories().then((result) => setCategories(result.categories || [])).catch(() => setCategories([]));
    api.courses({ per_page: 100 }).then((result) => setCourses(result.courses || [])).catch(() => setCourses([]));
  }, []);
  useEffect(() => {
    if (!videoId) return;
    setProviderOnly(false);
    api.video(videoId).then(async (result) => {
      const video = result.video;
      setForm({ ...emptyForm, ...video, category_id: video.category?.id || '', price: String(video.price ?? 0), access_days: video.access_days ?? '', duration_minutes: video.duration_minutes ?? '', course_ids: (video.courses || []).map((course) => course.id) });
      if (!video.vdocipher_video_id) return;
      const detail = await api.vdocipherVideo(video.vdocipher_video_id);
      const providerVideo = detail.video || detail;
      setProvider(providerVideo);
      setProviderTitle(providerVideo.title || '');
      setProviderDescription(providerVideo.description || '');
    }).catch(async () => {
      try {
        const detail = await api.vdocipherVideo(videoId);
        const providerVideo = detail.video || detail;
        setProviderOnly(true);
        setProvider(providerVideo);
        setProviderTitle(providerVideo.title || '');
        setProviderDescription(providerVideo.description || '');
        setForm({ ...emptyForm, title: providerVideo.title || '', description: providerVideo.description || '', vdocipher_video_id: providerVideo.id });
      } catch (caught) {
        setError(caught.message === 'no_api_key' ? 'no_api_key' : 'load');
      }
    });
  }, [videoId]);

  const canPreview = useMemo(() => providerReady(provider), [provider]);
  const validate = () => {
    if (!form.title.trim()) return t('video.validation.title');
    if (!form.description.trim()) return t('video.validation.description');
    if (!form.category_id) return t('video.validation.category');
    if (creating && !file) return t('video.validation.file');
    if (file && !file.type.startsWith('video/')) return t('video.validation.videoFile');
    return '';
  };
  const upload = async () => {
    const invalid = validate();
    if (invalid) { setError(invalid); return; }
    setBusy(true); setError(''); setProgress(0); setUploadedId('');
    let providerId = '';
    try {
      const credentials = await api.vdocipherUploadCredentials({ title: form.title.trim(), folder_id: folderId });
      providerId = credentials.video_id;
      setUploadedId(providerId);
      const body = new FormData();
      Object.entries(credentials.fields).forEach(([key, value]) => body.append(key, value));
      body.append('success_action_status', '201');
      body.append('success_action_redirect', '');
      body.append('file', file);
      await uploadForm(credentials.upload_link, body, setProgress);
      const result = await api.vdocipherImport({ ...cataloguePayload(form, true), video_id: providerId });
      navigate(`/videos/${result.video.id}`);
    } catch (caught) {
      setError(providerId ? 'partial' : (caught.message === 'no_api_key' ? 'no_api_key' : 'upload'));
    } finally { setBusy(false); }
  };
  const saveCatalog = async () => {
    const invalid = validate();
    if (invalid) { setError(invalid); return; }
    setBusy(true); setError('');
    try {
      if (providerOnly) {
        const result = await api.vdocipherImport({ ...cataloguePayload(form, true), video_id: form.vdocipher_video_id });
        navigate(`/videos/${result.video.id}`);
      } else {
        await api.videoUpdate(videoId, cataloguePayload(form));
        await api.videoCoursesSet(videoId, form.course_ids);
      }
    }
    catch { setError('save'); } finally { setBusy(false); }
  };
  const saveProvider = async () => {
    if (!form.vdocipher_video_id || !providerTitle.trim()) return;
    setBusy(true); setError('');
    try { const result = await api.vdocipherVideoUpdate(form.vdocipher_video_id, { title: providerTitle.trim(), description: providerDescription }); setProvider(result.video || { ...provider, title: providerTitle, description: providerDescription }); }
    catch { setError('save'); } finally { setBusy(false); }
  };
  const openPreview = async () => { try { setPreview(await api.vdocipherPreview(form.vdocipher_video_id)); } catch { setError('load'); } };

  return <section className="video-editor">
    <Link className="back-link" to="/videos"><ArrowLeft size={16} /> {t('common.back')}</Link>
    <h2>{creating ? t('pages.videoNew') : t('pages.videoDetails')}</h2>
    <ErrText>{error === 'partial' ? <>{t('video.partialUpload')} <strong dir="ltr">{uploadedId}</strong></> : error === 'no_api_key' ? <>{t('video.noApiKey')} <Link to="/settings">{t('nav.settings')}</Link></> : error ? (error === 'load' ? t('errors.load') : error === 'save' ? t('video.saveFailed') : error === 'upload' ? t('video.uploadFailed') : error) : ''}</ErrText>
    <div className="video-editor-layout">
      <section className="video-editor-panel"><h3>{t('video.catalogMetadata')}</h3><CatalogFields form={form} setForm={setForm} categories={categories} courses={courses} t={t} />
        {creating && <><Field label={t('video.folder')}><input dir="ltr" value={folderId} onChange={(event) => setFolderId(event.target.value)} /></Field><Field label={t('video.file')}><input type="file" accept="video/*" onChange={(event) => setFile(event.target.files?.[0] || null)} /></Field>{busy && <progress max="100" value={progress} />}</>}
        <button className="btn btn-filled" type="button" disabled={busy} onClick={creating ? upload : saveCatalog}>{creating ? <><Upload size={16} /> {t('video.uploadVideo')}</> : providerOnly ? <><Save size={16} /> {t('common.import')}</> : <><Save size={16} /> {t('common.save')}</>}</button>
      </section>
      {!creating && <section className="video-editor-panel"><h3>{t('video.providerMetadata')}</h3>{provider ? <><Field label={t('video.providerTitle')}><input dir="ltr" value={providerTitle} onChange={(event) => setProviderTitle(event.target.value)} /></Field><Field label={t('video.providerDescription')}><textarea dir="ltr" value={providerDescription} onChange={(event) => setProviderDescription(event.target.value)} /></Field><div className="row"><button className="btn btn-tonal" type="button" disabled={busy} onClick={saveProvider}>{t('common.save')}</button>{canPreview && <button className="btn btn-filled" type="button" onClick={openPreview}><Eye size={16} /> {t('video.preview')}</button>}</div>{!canPreview && <p className="video-encoding">{t('video.encoding')}</p>}{preview && <iframe className="video-preview" title={t('video.preview')} src={previewUrl(preview)} allow="encrypted-media" />}</> : <div className="video-skeletons"><span /><span /></div>}</section>}
    </div>
  </section>;
}
