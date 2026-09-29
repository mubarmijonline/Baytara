import { ArrowDown, ArrowLeft, ArrowUp, Clock3, GripVertical, Pencil, Plus, RefreshCw, Trash2, Upload, Video } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { catalogErrorCodes, durationLabel, localizedCatalogValue, posterFor } from '../catalog.js';
import { confirmDialog, promptDialog } from '../dialog.jsx';
import { useAdminLanguage } from '../i18n.jsx';
import { ErrText, Field, catalogErrorText } from '../ui.jsx';
import CourseExamEditor from '../components/CourseExamEditor.jsx';
import { uploadForm } from '../vdocipher-upload.js';

const COPY = {
  ar: {
    heading: 'محتوى الدورة', back: 'الدورات', loading: 'جارٍ تحميل المحتوى…', loadError: 'تعذّر تحميل محتوى الدورة.',
    deliveryLocal: 'على خادمنا', deliveryVdo: 'VdoCipher',
    addVideo: 'رفع فيديو جديد لهذه الدورة',
    addVideoTitle: 'عنوان الفيديو',
    addVideoWhere: 'مكان التخزين',
    addVideoVdo: 'VdoCipher — محمي بتقنية DRM',
    addVideoLocal: 'خادم بيطرة — بدون DRM',
    addVideoVdoHint: 'الخيار الموصى به للمحتوى المدفوع: يمنع تسجيل الشاشة على iPhone وعلى أجهزة أندرويد المدعومة.',
    addVideoLocalHint: 'مناسب للمحتوى المجاني فقط: الصورة قابلة للتسجيل على أي جهاز، والعلامة المائية وحدها هي ما يحدّد الحساب.',
    addVideoLocalPreviewHint: 'سيرفر بيطرة بلا حماية DRM، لذلك يُرفع الفيديو هنا كـ«معاينة مجانية» يشاهدها أي زائر. للمحتوى المدفوع في هذه الدورة استخدم VdoCipher.',
    addVideoProtect: 'تفعيل منع تسجيل الشاشة (يمنع التشغيل من متصفح الجوال إذا كان إلزام التطبيق مُفعّلاً)',
    addVideoFile: 'ملف الفيديو',
    addVideoSubmit: 'رفع وإضافة للدورة',
    addVideoTitleRequired: 'اكتب عنوان الفيديو.',
    addVideoFileRequired: 'اختر ملف الفيديو.',
    addVideoNoInstructor: 'لا يمكن الرفع: هذه الدورة بلا محاضر.',
    addVideoPhase: { creating: 'جارٍ التحضير…', uploading: 'جارٍ الرفع', importing: 'جارٍ التسجيل في المكتبة…', attaching: 'جارٍ الإضافة للدورة…' },
    addVideoLink: 'VdoCipher: فيديو مرفوع بالفعل (ربط بالـ Video ID)',
    addVideoLinkHint: 'ارفع الفيديو من لوحة تحكم VdoCipher، ثم انسخ الـ Video ID من صفحة الفيديو هناك والصقه هنا. يُسحب الغلاف والمدة من VdoCipher تلقائياً.',
    addVideoId: 'معرّف الفيديو على VdoCipher (Video ID)',
    addVideoIdCheck: 'تحقّق',
    addVideoIdRequired: 'الصق معرّف الفيديو (Video ID).',
    addVideoIdNotFound: 'لا يوجد فيديو بهذا المعرّف على حسابكم في VdoCipher.',
    addVideoIdInvalid: 'هذا ليس معرّف فيديو من VdoCipher. انسخه كما هو من صفحة الفيديو هناك.',
    addVideoIdFound: (video) => `موجود على VdoCipher: ${video.title || '—'}${video.duration_seconds ? ` · ${Math.max(1, Math.round(video.duration_seconds / 60))} د` : ''}${video.status ? ` · ${video.status}` : ''}`,
    addVideoLinkSubmit: 'ربط وإضافة للدورة',
    addVideoRecovered: 'الملف وصل إلى VdoCipher بنجاح لكن تعذّرت إضافته للدورة. معرّفه محفوظ بالأسفل: اضغط «ربط وإضافة للدورة» لإكمالها من غير رفع من جديد.',

    exam: {
      heading: 'اختبار نهاية الدورة',
      intro: 'اختيار من متعدد، الطالب بيدخله بعد ما يخلّص كل الفيديوهات. الشهادة متطلعش غير لما ينجح.',
      passPercent: 'درجة النجاح %',
      timeLimit: 'مدة الاختبار (دقيقة)', timeLimitHint: 'اتركها فارغة لو مفيش وقت محدد.',
      noLimit: 'بلا وقت', perAttempt: 'عدد الأسئلة لكل محاولة',
      perAttemptHint: 'يسحب عدد عشوائي من بنك الأسئلة. اتركها فارغة لعرض كل الأسئلة.',
      allQuestions: 'الكل',
      showResults: 'عرض التصحيح بعد التسليم',
      showResultsHint: 'يعرض للطالب إجابته الصحيحة والشرح. المحاولات غير محدودة، فالتفعيل يسهّل المحاولة التالية.',
      explanation: 'شرح الإجابة (اختياري)',
      explanationHint: 'يظهر بعد التصحيح فقط، ولا يخرج أبداً مع ورقة الأسئلة.',
      invalidTimeLimit: 'مدة الاختبار غير صحيحة.',
      passHint: 'المتفق عليه ٧٠٪.',
      publish: 'نشر الاختبار',
      publishWarning: 'أول ما تنشر الاختبار، مفيش شهادة هتطلع في الدورة دي غير للطالب اللي ينجح فيه.',
      live: 'منشور', notLive: 'غير منشور',
      addQuestion: 'إضافة سؤال', questionText: 'نص السؤال',
      optionsHint: 'حدد الإجابة الصحيحة من الدائرة جنب الاختيار. لازم اختيارين على الأقل.',
      option: 'اختيار', addOption: 'إضافة اختيار', removeOption: 'حذف الاختيار',
      markCorrect: 'الإجابة الصحيحة',
      save: 'حفظ', cancel: 'إلغاء', edit: 'تعديل السؤال', remove: 'حذف السؤال',
      removeConfirm: 'حذف السؤال ده؟',
      notAnswerable: 'السؤال ده ناقص: محتاج اختيارين على الأقل وإجابة صحيحة واحدة. مش محسوب في الاختبار.',
      summary: '{answerable} سؤال محسوب من {total}.',
      loadError: 'تعذّر تحميل الاختبار.', saveError: 'تعذّر الحفظ.',
      errors: {
        at_least_two_options_required: 'لازم اختيارين على الأقل.',
        exactly_one_correct_option_required: 'حدد إجابة صحيحة واحدة بالظبط.',
        option_text_required: 'اكتب نص كل اختيار.',
        question_text_required: 'اكتب نص السؤال.',
        invalid_pass_percent: 'درجة النجاح لازم تكون بين ١ و ١٠٠.',
        invalid_time_limit: 'مدة الاختبار لازم تكون رقم من ١ إلى ٦٠٠ دقيقة.',
        invalid_questions_per_attempt: 'عدد الأسئلة لكل محاولة غير صحيح.',
        questions_per_attempt_exceeds_bank: 'عدد الأسئلة المطلوب أكبر من عدد الأسئلة المكتملة.',
        exam_has_no_answerable_questions: 'مش ممكن تنشر اختبار من غير أسئلة مكتملة.',
      },
    },
    upload: 'رفع وتعيين', search: 'البحث في الفيديوهات القابلة لإعادة الاستخدام', available: 'مكتبة الفيديوهات',
    assigned: 'الفيديوهات المرتبة', add: 'إضافة الفيديوهات المحددة', noAvailable: 'لا توجد فيديوهات مطابقة.',
    noAssigned: 'لا توجد فيديوهات في هذه الدورة.', moveUp: 'نقل {title} لأعلى', moveDown: 'نقل {title} لأسفل',
    remove: 'إزالة {title} من هذه الدورة', removeConfirm: 'إزالة الفيديو من هذه الدورة فقط؟ سيبقى الفيديو في المكتبة والدورات الأخرى.',
    orderConflict: 'تغيّر ترتيب الدورة في جلسة أخرى. أعد التحميل ثم حاول مجدداً.', reload: 'إعادة التحميل',
    addError: 'تعذّر تعيين الفيديوهات المحددة.', removeError: 'تعذّرت إزالة الفيديو من الدورة.', courses: 'دورات', minutes: 'د',
    plays: 'مشاهدة',
    units: 'الوحدات', newUnit: 'وحدة جديدة', unitName: 'اسم الوحدة', renameUnit: 'إعادة تسمية الوحدة',
    deleteUnit: 'حذف الوحدة', deleteUnitConfirm: 'حذف هذه الوحدة؟ ستبقى الفيديوهات في الدورة بلا وحدة.',
    noUnit: 'بدون وحدة', unitOf: 'الوحدة', unitError: 'تعذّر تحديث الوحدات.',
    unitsHint: 'الوحدة تخص هذه الدورة وحدها، فالفيديو المشترك قد يكون في وحدة مختلفة في دورة أخرى.',
  },
  en: {
    heading: 'Course content', back: 'Courses', loading: 'Loading course content…', loadError: 'Unable to load course content.',
    deliveryLocal: 'Our server', deliveryVdo: 'VdoCipher',
    addVideo: 'Upload a new video to this course',
    addVideoTitle: 'Video title',
    addVideoWhere: 'Where it is stored',
    addVideoVdo: 'VdoCipher — DRM protected',
    addVideoLocal: 'Baytara server — no DRM',
    addVideoVdoHint: 'The choice for paid content: it blocks screen recording on iPhone and on supported Android devices.',
    addVideoLocalHint: 'Free content only: the picture can be recorded on any device, and only the watermark identifies the account.',
    addVideoLocalPreviewHint: 'The Baytara server has no DRM, so a video uploaded here becomes a free preview anyone can watch. Paid lessons in this course must go to VdoCipher.',
    addVideoProtect: 'Enforce the screen-recording rule (blocks mobile browsers while the app-only setting is on)',
    addVideoFile: 'Video file',
    addVideoSubmit: 'Upload and add to the course',
    addVideoTitleRequired: 'Give the video a title.',
    addVideoFileRequired: 'Choose a video file.',
    addVideoNoInstructor: 'Cannot upload: this course has no instructor.',
    addVideoPhase: { creating: 'Preparing…', uploading: 'Uploading', importing: 'Recording it in the library…', attaching: 'Adding it to the course…' },
    addVideoLink: 'VdoCipher: a video already uploaded there (link by Video ID)',
    addVideoLinkHint: 'Upload the video in the VdoCipher dashboard, then copy the Video ID from its page there and paste it here. The poster and length are taken from VdoCipher.',
    addVideoId: 'VdoCipher Video ID',
    addVideoIdCheck: 'Check',
    addVideoIdRequired: 'Paste the Video ID.',
    addVideoIdNotFound: 'There is no video with this ID on your VdoCipher account.',
    addVideoIdInvalid: 'That is not a VdoCipher Video ID. Copy it exactly as shown on the video page there.',
    addVideoIdFound: (video) => `Found on VdoCipher: ${video.title || '—'}${video.duration_seconds ? ` · ${Math.max(1, Math.round(video.duration_seconds / 60))} min` : ''}${video.status ? ` · ${video.status}` : ''}`,
    addVideoLinkSubmit: 'Link and add to the course',
    addVideoRecovered: 'The file reached VdoCipher, but adding it to the course failed. Its ID is kept below: press "Link and add to the course" to finish without uploading again.',
    exam: {
      heading: 'End-of-course exam',
      intro: 'Multiple choice, sat once the learner has watched every video. No certificate without a pass.',
      passPercent: 'Pass mark %',
      timeLimit: 'Time limit (minutes)', timeLimitHint: 'Leave empty for no limit.',
      noLimit: 'No limit', perAttempt: 'Questions per attempt',
      perAttemptHint: 'Draws that many at random from the bank. Leave empty to ask them all.',
      allQuestions: 'All',
      showResults: 'Show the marking after submitting',
      showResultsHint: 'Shows the candidate the right answer and the explanation. Attempts are unlimited, so this makes the next one easier.',
      explanation: 'Answer explanation (optional)',
      explanationHint: 'Shown after marking only; it never goes out with the paper.',
      invalidTimeLimit: 'That time limit is not valid.',
      passHint: 'Agreed at 70%.',
      publish: 'Publish the exam',
      publishWarning: 'Once published, no one on this course earns a certificate without passing it.',
      live: 'Published', notLive: 'Not published',
      addQuestion: 'Add a question', questionText: 'Question',
      optionsHint: 'Mark the correct answer with the radio beside it. At least two options.',
      option: 'Option', addOption: 'Add an option', removeOption: 'Remove option',
      markCorrect: 'Correct answer',
      save: 'Save', cancel: 'Cancel', edit: 'Edit question', remove: 'Delete question',
      removeConfirm: 'Delete this question?',
      notAnswerable: 'Incomplete: needs at least two options and exactly one correct answer. Not counted.',
      summary: '{answerable} of {total} questions count.',
      loadError: 'Unable to load the exam.', saveError: 'Unable to save.',
      errors: {
        at_least_two_options_required: 'At least two options are required.',
        exactly_one_correct_option_required: 'Mark exactly one correct answer.',
        option_text_required: 'Every option needs text.',
        question_text_required: 'The question needs text.',
        invalid_pass_percent: 'The pass mark must be between 1 and 100.',
        invalid_time_limit: 'The time limit must be between 1 and 600 minutes.',
        invalid_questions_per_attempt: 'That number of questions per attempt is not valid.',
        questions_per_attempt_exceeds_bank: 'You are asking for more questions than the bank has complete.',
        exam_has_no_answerable_questions: 'An exam with no complete questions cannot be published.',
      },
    },
    upload: 'Upload and assign', search: 'Search reusable videos', available: 'Video library', assigned: 'Ordered videos',
    add: 'Add selected videos', noAvailable: 'No matching videos.', noAssigned: 'No videos in this course.',
    moveUp: 'Move {title} up', moveDown: 'Move {title} down', remove: 'Remove {title} from this course',
    removeConfirm: 'Remove this video from this course only? It remains in the library and other courses.',
    orderConflict: 'The course order changed in another session. Reload it and try again.', reload: 'Reload',
    addError: 'Unable to assign the selected videos.', removeError: 'Unable to remove the video from this course.', courses: 'courses', minutes: 'min',
    plays: 'plays',
    units: 'Units', newUnit: 'New unit', unitName: 'Unit name', renameUnit: 'Rename unit',
    deleteUnit: 'Delete unit', deleteUnitConfirm: 'Delete this unit? Its videos stay in the course, ungrouped.',
    noUnit: 'No unit', unitOf: 'Unit', unitError: 'Unable to update units.',
    unitsHint: 'A unit belongs to this course only, so a shared video can sit in a different unit elsewhere.',
  },
};

function label(template, title) {
  return template.replace('{title}', title);
}


// Upload a video straight into this course, choosing where it is served from.
//
// Before this, a video was created somewhere else and then assigned here, and the only
// upload screen wrote to our own server — so videos meant for VdoCipher ended up
// self-hosted, which has no DRM and cannot stop a screen recording. The destination is
// now an explicit choice at the moment of upload, and the course supplies the category
// and the instructor, so the pairing the server would refuse cannot be made by accident.

// Where a video is served from, said out loud. A local video has no DRM and a
// VdoCipher one does, and the two were indistinguishable in this list.
function DeliveryChip({ video, copy }) {
  const local = video.source === 'local';
  const status = video.local_status;
  const tone = !local ? 'published' : status === 'ready' ? 'role' : status === 'failed' ? 'unpublished' : 'draft';
  return (
    <span className={`chip chip-${tone}`} title={video.local_error || ''}>
      {local ? copy.deliveryLocal : copy.deliveryVdo}
      {local && status && status !== 'ready' ? ` · ${status}` : ''}
    </span>
  );
}

function AddVideoToCourse({ course, courseId, onAdded, copy, t }) {
  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState('vdocipher');
  // Our server has no DRM, so a paid course cannot put its videos there. The server
  // refuses it too (paid_requires_vdocipher); this just keeps the option from being
  // offered, with the reason on screen instead of an error after the upload.
  const paid = course?.access_type === 'baytarian' || course?.access_type === 'general';
  // Protection is for paid content; it defaults off for a free course. It used to default
  // on everywhere, and on a local upload the checkbox is not even shown, so free videos
  // were silently put behind the strict browser rules.
  const [protect, setProtect] = useState(null);
  const [file, setFile] = useState(null);
  // Linking a video that is already on VdoCipher: its ID, and what VdoCipher said about it.
  const [providerId, setProviderId] = useState('');
  const [found, setFound] = useState(null);
  const [checking, setChecking] = useState(false);
  const [phase, setPhase] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const reset = () => {
    setTitle(''); setFile(null); setProgress(0); setPhase('');
    setProviderId(''); setFound(null);
    if (fileRef.current) fileRef.current.value = '';
  };
  const linking = destination === 'vdocipher_id';

  // Everything the catalogue insists on, taken from the course rather than asked again.
  const metadata = (name = title.trim()) => ({
    title: name,
    category_id: course?.category?.id || null,
    instructor_id: course?.instructor?.id || null,
    // Local storage has no DRM, and the server refuses to play a paid lesson from it
    // (`paid_requires_vdocipher`). So a local upload is a free lesson by definition --
    // which is exactly what an intro or preview video is, and it is what puts the
    // "معاينة مجانية" badge on it in the curriculum.
    access_type: destination === 'local' ? 'free' : (course?.access_type || 'free'),
    status: 'published',
    // A paid lesson takes the course's price. The server refuses a paid video priced at
    // zero (positive_price_required), and a price of 0 is what this sent: every VdoCipher
    // upload into a paid course failed after the file had already reached VdoCipher. The
    // price is never charged on its own, since a lesson in a course cannot be bought
    // separately (video_not_standalone), and the site does not show it.
    price: destination !== 'local' && paid ? Number(course?.price || 0) : 0,
    currency: course?.currency || 'EGP',
    is_protected: destination === 'local' ? false
      : (protect ?? (course?.access_type === 'baytarian' || course?.access_type === 'general')),
  });

  async function check() {
    setError(''); setFound(null);
    const id = providerId.trim();
    if (!id) { setError(copy.addVideoIdRequired); return; }
    setChecking(true);
    try {
      const result = await api.vdocipherVideo(id);
      const video = result.video || result;
      setFound(video);
      if (!title.trim() && video.title) setTitle(video.title);
    } catch (failure) {
      setError(failure.status === 404 ? copy.addVideoIdNotFound
        : failure.status === 422 ? copy.addVideoIdInvalid : catalogErrorText(failure, t));
    } finally { setChecking(false); }
  }

  async function submit() {
    setError('');
    // When linking, VdoCipher's own title stands in for an empty one.
    const name = title.trim() || (linking ? (found?.title || '').trim() : '');
    if (!name) { setError(copy.addVideoTitleRequired); return; }
    if (linking ? !providerId.trim() : !file) {
      setError(linking ? copy.addVideoIdRequired : copy.addVideoFileRequired); return;
    }
    if (!course?.instructor?.id) { setError(copy.addVideoNoInstructor); return; }

    // Set once the file is on VdoCipher, so a failure after that point can be finished by
    // linking instead of by uploading the same file again.
    let landed = '';
    try {
      let videoId;
      // `destination` alone. This used to carry `&& !paid`, left over from when the
      // selector was disabled on paid courses: unlocking the dropdown without removing it
      // meant choosing local storage on a paid course silently uploaded to VdoCipher
      // instead, which is the opposite of what the form said it would do.
      if (linking) {
        setPhase('importing');
        // The same import an upload ends with, given an ID that is already there. It checks
        // the ID with VdoCipher and takes the poster and length from it.
        const imported = await api.vdocipherImport(
          { ...metadata(name), video_id: providerId.trim(), sync_provider_metadata: true },
          { skipAdminDataChanged: true },
        );
        videoId = (imported.video || imported).id;
      } else if (destination === 'local') {
        setPhase('creating');
        const created = await api.videoCreate(metadata(name), { silent: true });
        videoId = (created.video || created).id;
        setPhase('uploading');
        await api.videoUpload(videoId, file, setProgress);
      } else {
        // The provider needs the file before we have anything to record, so the
        // catalogue row is created by the import once the upload lands.
        setPhase('creating');
        const credentials = await api.vdocipherUploadCredentials({
          title: title.trim(), course_id: courseId,
        });
        const body = new FormData();
        Object.entries(credentials.fields).forEach(([key, value]) => body.append(key, value));
        body.append('success_action_status', '201');
        body.append('success_action_redirect', '');
        body.append('file', file);
        setPhase('uploading');
        await uploadForm(credentials.upload_link, body, setProgress);
        landed = credentials.video_id;
        setPhase('importing');
        // Silent: the data-changed event remounts this page mid-flow, and the course would
        // reload before the video had been attached to it.
        const imported = await api.vdocipherImport(
          { ...metadata(name), video_id: credentials.video_id }, { skipAdminDataChanged: true },
        );
        videoId = (imported.video || imported).id;
      }
      setPhase('attaching');
      await api.videoCoursesAdd(videoId, [courseId]);
      reset();
      onAdded();
    } catch (failure) {
      if (landed) {
        // The upload is not lost: switch to linking, with its ID filled in.
        setDestination('vdocipher_id');
        setProviderId(landed);
        setError(`${copy.addVideoRecovered} (${catalogErrorText(failure, t)})`);
      } else {
        setError(catalogErrorText(failure, t));
      }
      setPhase('');
    }
  }

  const working = Boolean(phase);
  return (
    <section className="catalog-panel course-add-video">
      <h3>{copy.addVideo}</h3>
      <Field label={copy.addVideoTitle}>
        <input value={title} onChange={(event) => setTitle(event.target.value)} disabled={working} />
      </Field>
      {/* Open on every course. A paid course still needs an intro or two that anyone can
          watch, and those do not need DRM -- they need to be free, which is what choosing
          local storage makes them. */}
      <Field
        label={copy.addVideoWhere}
        hint={destination === 'local'
          ? (paid ? copy.addVideoLocalPreviewHint : copy.addVideoLocalHint)
          : linking ? copy.addVideoLinkHint : copy.addVideoVdoHint}
      >
        <select value={destination} onChange={(event) => { setDestination(event.target.value); setError(''); }} disabled={working}>
          <option value="vdocipher">{copy.addVideoVdo}</option>
          <option value="vdocipher_id">{copy.addVideoLink}</option>
          <option value="local">{copy.addVideoLocal}</option>
        </select>
      </Field>
      {destination !== 'local' && (
        <label className="course-add-protect">
          <input type="checkbox" checked={protect ?? (course?.access_type === 'baytarian' || course?.access_type === 'general')} onChange={(event) => setProtect(event.target.checked)} disabled={working} />
          <span>{copy.addVideoProtect}</span>
        </label>
      )}
      {linking ? (
        <div className="course-add-link">
          {/* The label goes on the input itself, so the button sits beside the field. */}
          <Field label={copy.addVideoId}>
            <input dir="ltr" value={providerId} placeholder="1234567890abcdef" disabled={working}
                   onChange={(event) => { setProviderId(event.target.value); setFound(null); }} />
          </Field>
          <button className="btn btn-tonal" type="button" disabled={working || checking} onClick={check}>
            {checking ? t('common.loading') : copy.addVideoIdCheck}
          </button>
          {found && <p className="course-add-found">{copy.addVideoIdFound(found)}</p>}
        </div>
      ) : (
        <Field label={copy.addVideoFile}>
          <input ref={fileRef} type="file" accept="video/mp4,video/quicktime,video/x-matroska,video/webm"
                 disabled={working} onChange={(event) => setFile(event.target.files?.[0] || null)} />
        </Field>
      )}
      {working && (
        <div className="course-add-progress">
          <progress max="100" value={phase === 'uploading' ? progress : undefined} />
          <span>{copy.addVideoPhase[phase] || phase}{phase === 'uploading' ? ` ${progress}%` : ''}</span>
        </div>
      )}
      <ErrText>{error}</ErrText>
      <button className="btn btn-filled" type="button" disabled={working} onClick={submit}>
        <Upload size={16} /> {linking ? copy.addVideoLinkSubmit : copy.addVideoSubmit}
      </button>
    </section>
  );
}

export default function CourseContent({ routeParams = {} }) {
  const { language, t } = useAdminLanguage();
  const c = COPY[language];
  const courseId = Number(routeParams.courseId);
  const [course, setCourse] = useState(null);
  const [videos, setVideos] = useState([]);
  const [units, setUnits] = useState([]);
  // video_id -> module_id, so the select next to each video knows its unit
  const [videoUnit, setVideoUnit] = useState({});
  const [library, setLibrary] = useState([]);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [error, setError] = useState('');
  const dragIndex = useRef(null);
  const orderSaving = useRef(false);

  async function loadCourse({ clearError = true, showLoading = true } = {}) {
    if (showLoading) setLoading(true);
    if (clearError) setError('');
    try {
      const result = await api.course(courseId);
      setCourse(result.course);
      setUnits(result.course.all_modules || []);
      const placement = {};
      (result.course.modules || []).forEach((unit) => {
        (unit.videos || []).forEach((video) => { placement[video.id] = unit.id; });
      });
      setVideoUnit(placement);
      const nextVideos = result.course.videos || [];
      setVideos(nextVideos);
      const assignedIds = new Set(nextVideos.map((video) => video.id));
      setPicked((current) => current.filter((video) => !assignedIds.has(video.id)));
      return nextVideos;
    } catch {
      if (clearError) setError(c.loadError);
      return null;
    } finally { if (showLoading) setLoading(false); }
  }

  useEffect(() => { loadCourse(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [courseId]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      api.catalogVideos({ q: query, per_page: 100 }).then((result) => {
        if (active) setLibrary(result.items || result.videos || []);
      }).catch(() => active && setLibrary([]));
    }, query ? 180 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [query]);

  const assigned = useMemo(() => new Set(videos.map((video) => video.id)), [videos]);
  const available = useMemo(() => library.filter((video) => !assigned.has(video.id)), [library, assigned]);
  const pickedIds = useMemo(() => new Set(picked.map((video) => video.id)), [picked]);
  const controlsBusy = busy || ordering;

  async function persistOrder(next) {
    if (orderSaving.current) return;
    orderSaving.current = true;
    setOrdering(true);
    setVideos(next); setError('');
    try { await api.courseVideoOrder(courseId, next.map((video) => video.id)); }
    catch (apiError) {
      const codes = catalogErrorCodes(apiError);
      const message = codes.includes('video_order_membership_mismatch') ? c.orderConflict : codes.join(' ');
      await loadCourse({ clearError: false, showLoading: false });
      setError(message);
    } finally {
      orderSaving.current = false;
      setOrdering(false);
    }
  }

  function move(from, to) {
    if (orderSaving.current || to < 0 || to >= videos.length || from === to) return;
    const next = [...videos];
    const [video] = next.splice(from, 1);
    next.splice(to, 0, video);
    persistOrder(next);
  }

  async function addSelected() {
    const selected = picked.filter((video) => !assigned.has(video.id));
    if (!selected.length) return;
    setBusy(true); setError('');
    const results = await Promise.allSettled(
      selected.map((video) => api.videoCoursesAdd(video.id, [courseId])),
    );
    try {
      await loadCourse({ clearError: false, showLoading: false });
      if (results.some((result) => result.status === 'rejected')) {
        setError(c.addError);
        return;
      }
      setPicked([]);
    } finally { setBusy(false); }
  }

  async function addUnit() {
    const title = await promptDialog(c.unitName, '');
    if (!title || !title.trim()) return;
    setBusy(true); setError('');
    try { await api.moduleCreate(courseId, { title: title.trim(), position: units.length }); await loadCourse({ showLoading: false }); }
    catch { setError(c.unitError); }
    finally { setBusy(false); }
  }

  async function renameUnit(unit) {
    const title = await promptDialog(c.renameUnit, unit.title || '');
    if (!title || !title.trim()) return;
    setBusy(true); setError('');
    try { await api.moduleUpdate(unit.id, { title: title.trim() }); await loadCourse({ showLoading: false }); }
    catch { setError(c.unitError); }
    finally { setBusy(false); }
  }

  async function removeUnit(unit) {
    if (!await confirmDialog(c.deleteUnitConfirm)) return;
    setBusy(true); setError('');
    try { await api.moduleDelete(unit.id); await loadCourse({ showLoading: false }); }
    catch { setError(c.unitError); }
    finally { setBusy(false); }
  }

  async function setUnitFor(videoId, value) {
    const moduleId = value === '' ? null : Number(value);
    setVideoUnit((current) => ({ ...current, [videoId]: moduleId }));
    try { await api.courseVideoModule(courseId, videoId, moduleId); }
    catch { setError(c.unitError); await loadCourse({ clearError: false, showLoading: false }); }
  }

  async function remove(video) {
    if (!await confirmDialog(c.removeConfirm)) return;
    setBusy(true); setError('');
    try {
      await api.videoCourseRemove(video.id, courseId);
      setVideos((current) => current.filter((item) => item.id !== video.id));
    } catch { setError(c.removeError); }
    finally { setBusy(false); }
  }

  return <section className="course-content-page">
    <Link className="back-link" to="/courses"><ArrowLeft size={16} /> {c.back}</Link>
    <div className="catalog-page-header"><div><h2>{c.heading}</h2>{course && <p>{localizedCatalogValue(course, 'title', language)}</p>}</div><Link className="btn btn-filled" to={`/videos/new?course=${courseId}`}><Upload size={16} /> {c.upload}</Link></div>
    <ErrText>{error}</ErrText>
    {error === c.orderConflict && <button className="btn btn-tonal btn-sm" type="button" onClick={() => loadCourse()}><RefreshCw size={14} /> {c.reload}</button>}
    {loading ? <div className="empty">{c.loading}</div> : <div className="course-content-layout">
      <section className="catalog-panel course-order-panel">
        <div className="catalog-page-header"><h3>{c.units}</h3><button className="btn btn-tonal btn-sm" type="button" disabled={controlsBusy} onClick={addUnit}><Plus size={14} /> {c.newUnit}</button></div>
        <p className="catalog-warning">{c.unitsHint}</p>
        <div className="catalog-selector">
          {units.map((unit) => <div key={unit.id} className="ordered-video-row">
            <strong style={{ flex: 1 }}>{unit.title}</strong>
            <button className="btn btn-tonal btn-sm" type="button" disabled={controlsBusy} onClick={() => renameUnit(unit)}><Pencil size={14} /> {c.renameUnit}</button>
            <button className="btn btn-error btn-sm" type="button" disabled={controlsBusy} onClick={() => removeUnit(unit)}><Trash2 size={14} /> {c.deleteUnit}</button>
          </div>)}
          {!units.length && <div className="empty compact">{c.noUnit}</div>}
        </div>
        <h3>{c.assigned}</h3>
        <div className="ordered-video-list">
          {videos.map((video, index) => {
            const title = localizedCatalogValue(video, 'title', language);
            const poster = posterFor(video);
            const minutes = durationLabel(video.duration_seconds, video.duration_minutes);
            return <article key={video.id} className="ordered-video-row" draggable={!controlsBusy}
              aria-busy={ordering || undefined}
              onDragStart={() => { if (!controlsBusy) dragIndex.current = index; }} onDragOver={(event) => { if (!controlsBusy) event.preventDefault(); }}
              onDrop={() => { if (!controlsBusy && dragIndex.current !== null) move(dragIndex.current, index); dragIndex.current = null; }}>
              <GripVertical size={18} className="drag-handle" aria-hidden="true" />
              <span className="order-number">{index + 1}</span>
              <div className="ordered-video-poster">{poster ? <img src={poster} alt="" /> : <Video size={20} aria-hidden="true" />}</div>
              <div className="ordered-video-copy"><strong>{title}</strong><span>{video.category ? localizedCatalogValue(video.category, 'name', language) : '—'} · {video.assignment_count ?? 1} {c.courses}</span><div className="ordered-video-meta"><DeliveryChip video={video} copy={c} /><span className="chip chip-role">{t(`catalog.access.${video.access_type}`)}</span>{video.plays != null ? <span className="chip chip-role" title={t('video.playsHint')}>{video.plays} {c.plays}</span> : null}{minutes ? <span><Clock3 size={13} aria-hidden="true" /> {minutes} {c.minutes}</span> : null}</div></div>
              <div className="ordered-video-actions">
                <select aria-label={`${c.unitOf}: ${title}`} disabled={controlsBusy}
                  value={videoUnit[video.id] ?? ''} onChange={(event) => setUnitFor(video.id, event.target.value)}>
                  <option value="">{c.noUnit}</option>
                  {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.title}</option>)}
                </select>
                <button className="icon-button" type="button" title={label(c.moveUp, title)} aria-label={label(c.moveUp, title)} disabled={index === 0 || controlsBusy} onClick={() => move(index, index - 1)}><ArrowUp size={16} /></button>
                <button className="icon-button" type="button" title={label(c.moveDown, title)} aria-label={label(c.moveDown, title)} disabled={index === videos.length - 1 || controlsBusy} onClick={() => move(index, index + 1)}><ArrowDown size={16} /></button>
                <button className="btn btn-error btn-sm" type="button" aria-label={label(c.remove, title)} disabled={controlsBusy} onClick={() => remove(video)}><Trash2 size={14} /> {language === 'en' ? 'Remove from course' : 'إزالة من الدورة'}</button>
              </div>
            </article>;
          })}
          {!videos.length && <div className="empty">{c.noAssigned}</div>}
        </div>
      </section>
      <AddVideoToCourse course={course} courseId={courseId} copy={c} t={t}
        onAdded={() => loadCourse({ showLoading: false })} />
      <CourseExamEditor courseId={courseId} copy={c.exam} t={t} />

      <aside className="catalog-panel reusable-video-panel"><h3>{c.available}</h3>
        <input className="catalog-search" type="search" aria-label={c.search} placeholder={c.search} value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="catalog-selector">
          {available.map((video) => <label key={video.id}>
            <input type="checkbox" checked={pickedIds.has(video.id)} onChange={() => setPicked((current) => current.some((item) => item.id === video.id) ? current.filter((item) => item.id !== video.id) : [...current, video])} />
            <span><strong>{localizedCatalogValue(video, 'title', language)}</strong><small><span className="chip chip-role">{t(`catalog.access.${video.access_type}`)}</span> · {video.assignment_count ?? 0} {c.courses}</small></span>
          </label>)}
          {!available.length && <div className="empty compact">{c.noAvailable}</div>}
        </div>
        <button className="btn btn-tonal" type="button" disabled={!picked.length || controlsBusy} onClick={addSelected}><Plus size={16} /> {c.add}</button>
      </aside>
    </div>}
  </section>;
}
