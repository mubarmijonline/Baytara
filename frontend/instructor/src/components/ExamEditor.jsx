// Writing the end-of-course exam, in the instructor's own portal.
//
// The endpoints and the validation are the same ones the admin portal uses
// (backend/app/services/exam_authoring.py), so the rules cannot drift between the two:
// one right answer per question, at least two options, and no publishing an exam with
// nothing answerable in it. The server checks on every call that this course belongs to
// the instructor asking.
//
// Publishing is the switch that starts withholding certificates on this course, so the
// consequence is spelled out next to it rather than left to be discovered from a
// learner's complaint.
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { confirmDialog } from '../dialog.jsx';
import { ErrText, Field, apiError } from '../ui.jsx';

const BLANK = {
  text: '', explanation: '',
  options: [{ text: '', is_correct: true }, { text: '', is_correct: false }],
};

const ERRORS = {
  invalid_pass_percent: 'درجة النجاح لازم تكون بين ١ و ١٠٠.',
  invalid_time_limit: 'مدة الاختبار لازم تكون رقماً من ١ إلى ٦٠٠ دقيقة.',
  invalid_questions_per_attempt: 'عدد الأسئلة لكل محاولة غير صحيح.',
  questions_per_attempt_exceeds_bank: 'عدد الأسئلة المطلوب أكبر من عدد الأسئلة المكتملة.',
  exam_has_no_answerable_questions: 'لا يمكن نشر اختبار بلا أسئلة مكتملة.',
  at_least_two_options_required: 'السؤال يحتاج خيارين على الأقل.',
  exactly_one_correct_option_required: 'اختر إجابة صحيحة واحدة بالضبط.',
  question_text_required: 'اكتب نص السؤال.',
  option_text_required: 'لا تترك خياراً فارغاً.',
  forbidden: 'هذه الدورة ليست من دوراتك.',
};

function QuestionForm({ initial, onCancel, onSave, saving }) {
  const [draft, setDraft] = useState(() => ({
    text: initial?.text || '',
    explanation: initial?.explanation || '',
    options: (initial?.options || BLANK.options).map((o) => ({ text: o.text, is_correct: !!o.is_correct })),
  }));

  // Exactly one right answer, so choosing one clears the rest rather than letting the
  // author save something the server will refuse.
  const chooseCorrect = (index) => setDraft((d) => ({
    ...d, options: d.options.map((o, i) => ({ ...o, is_correct: i === index })),
  }));
  const setOption = (index, patch) => setDraft((d) => ({
    ...d, options: d.options.map((o, i) => (i === index ? { ...o, ...patch } : o)),
  }));

  return (
    <div className="panel" style={{ marginBottom: 10, padding: 14 }}>
      <Field label="نص السؤال">
        <textarea rows={2} value={draft.text}
          onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))} />
      </Field>
      <p style={{ margin: '4px 0 8px', fontSize: 12.5, opacity: 0.75 }}>
        اختر الإجابة الصحيحة. خياران على الأقل.
      </p>
      {draft.options.map((option, index) => (
        <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <input type="radio" name="correct" checked={option.is_correct}
            aria-label="الإجابة الصحيحة" onChange={() => chooseCorrect(index)} />
          <input style={{ flex: 1 }} value={option.text} placeholder={`خيار ${index + 1}`}
            onChange={(e) => setOption(index, { text: e.target.value })} />
          {draft.options.length > 2 && (
            <button type="button" className="btn btn-text" aria-label="حذف الخيار"
              onClick={() => setDraft((d) => ({
                ...d,
                // Never leave the question without a right answer.
                options: d.options.filter((_, i) => i !== index).map((o, i, all) => (
                  all.some((x) => x.is_correct) ? o : { ...o, is_correct: i === 0 }
                )),
              }))}>✕</button>
          )}
        </div>
      ))}
      <Field label="شرح الإجابة (اختياري)">
        <textarea rows={2} value={draft.explanation}
          onChange={(e) => setDraft((d) => ({ ...d, explanation: e.target.value }))} />
      </Field>
      <p style={{ margin: '0 0 10px', fontSize: 12, opacity: 0.7 }}>
        يظهر بعد التصحيح فقط، ولا يخرج أبداً مع ورقة الأسئلة.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" disabled={saving}
          onClick={() => onSave(draft)}>حفظ السؤال</button>
        <button type="button" className="btn btn-text" onClick={onCancel}>إلغاء</button>
        {draft.options.length < 6 && (
          <button type="button" className="btn btn-text"
            onClick={() => setDraft((d) => ({ ...d, options: [...d.options, { text: '', is_correct: false }] }))}>
            + خيار
          </button>
        )}
      </div>
    </div>
  );
}

export default function ExamEditor({ courseId }) {
  const [exam, setExam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try { setExam((await api.courseExam(courseId)).exam); }
    catch (e) { setError(ERRORS[apiError(e, '')] || 'تعذّر تحميل الاختبار.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [courseId]);

  const run = async (work) => {
    setSaving(true); setError('');
    try { await work(); await load(); setAdding(false); setEditing(null); }
    catch (e) { setError(ERRORS[apiError(e, '')] || 'تعذّر الحفظ.'); }
    finally { setSaving(false); }
  };

  const questions = exam?.questions || [];
  const answerable = questions.filter((q) => q.is_answerable).length;

  if (loading) return <div className="empty">جارٍ التحميل…</div>;

  return (
    <section className="panel" style={{ padding: 16 }}>
      <h3 style={{ marginTop: 0 }}>اختبار نهاية الدورة</h3>
      <p style={{ marginTop: -6, fontSize: 13, opacity: 0.8 }}>
        اختيار من متعدد، إجابة صحيحة واحدة لكل سؤال. الطالب يدخله بعد إنهاء كل الدروس،
        والشهادة لا تصدر إلا لمن ينجح فيه.
      </p>

      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
        <Field label="درجة النجاح %">
          <input type="number" min="1" max="100" style={{ width: 110 }}
            value={exam?.pass_percent ?? 70}
            onChange={(e) => setExam((x) => ({ ...(x || {}), pass_percent: e.target.value }))}
            onBlur={(e) => run(() => api.courseExamSave(courseId, { pass_percent: Number(e.target.value) }))} />
        </Field>
        <Field label="مدة الاختبار (دقيقة)">
          <input type="number" min="0" style={{ width: 130 }} placeholder="بلا وقت"
            value={exam?.time_limit_minutes ?? ''}
            onChange={(e) => setExam((x) => ({ ...(x || {}), time_limit_minutes: e.target.value }))}
            onBlur={(e) => run(() => api.courseExamSave(courseId, { time_limit_minutes: e.target.value }))} />
        </Field>
        <Field label="عدد الأسئلة لكل محاولة">
          <input type="number" min="0" style={{ width: 150 }} placeholder="الكل"
            value={exam?.questions_per_attempt ?? ''}
            onChange={(e) => setExam((x) => ({ ...(x || {}), questions_per_attempt: e.target.value }))}
            onBlur={(e) => run(() => api.courseExamSave(courseId, { questions_per_attempt: e.target.value }))} />
        </Field>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 12.5, opacity: 0.75 }}>
        اتركها فارغة لو مش عايز وقتاً محدداً أو عايز كل الأسئلة تُعرض. تحديد عدد أقل يسحب
        أسئلة عشوائية من بنك الأسئلة، فتختلف الورقة من محاولة لأخرى.
      </p>

      <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={!!exam?.show_results} disabled={saving}
            onChange={(e) => run(() => api.courseExamSave(courseId, { show_results: e.target.checked }))} />
          <span>عرض التصحيح بعد التسليم</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={!!exam?.is_published} disabled={saving}
            onChange={(e) => run(() => api.courseExamSave(courseId, { is_published: e.target.checked }))} />
          <span>نشر الاختبار</span>
        </label>
        <span className={`chip ${exam?.is_published ? 'chip-on' : 'chip-off'}`}>
          {exam?.is_published ? 'منشور' : 'غير منشور'}
        </span>
      </div>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: '#9b6b00' }}>
        أول ما تنشر الاختبار، لن تصدر شهادة في هذه الدورة إلا لمن ينجح فيه.
      </p>

      {questions.map((question, index) => (
        editing === question.id ? (
          <QuestionForm key={question.id} initial={question} saving={saving}
            onCancel={() => setEditing(null)}
            onSave={(draft) => run(() => api.examQuestionUpdate(question.id, draft))} />
        ) : (
          <div key={question.id} className="panel" style={{ marginBottom: 8, padding: 12 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <strong style={{ opacity: 0.6 }}>{index + 1}.</strong>
              <div style={{ flex: 1 }}>
                <p style={{ margin: '0 0 6px', fontWeight: 700 }}>{question.text}</p>
                <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 13.5 }}>
                  {question.options.map((option) => (
                    <li key={option.id} style={{ color: option.is_correct ? '#176b45' : 'inherit',
                      fontWeight: option.is_correct ? 700 : 400 }}>
                      {option.text}{option.is_correct ? ' ✓' : ''}
                    </li>
                  ))}
                </ul>
                {!question.is_answerable && (
                  <ErrText>هذا السؤال غير مكتمل، ولن يُحتسب في الاختبار.</ErrText>
                )}
              </div>
              <button type="button" className="btn btn-text" onClick={() => setEditing(question.id)}>تعديل</button>
              <button type="button" className="btn btn-text" onClick={async () => {
                if (!await confirmDialog('حذف السؤال؟')) return;
                run(() => api.examQuestionDelete(question.id));
              }}>حذف</button>
            </div>
          </div>
        )
      ))}

      {adding ? (
        <QuestionForm initial={BLANK} saving={saving}
          onCancel={() => setAdding(false)}
          onSave={(draft) => run(() => api.examQuestionCreate(courseId, draft))} />
      ) : (
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>+ سؤال جديد</button>
      )}

      <p style={{ marginTop: 12, fontSize: 12.5, opacity: 0.75 }}>
        {answerable} سؤال مكتمل من {questions.length}.
      </p>
      <ErrText>{error}</ErrText>
    </section>
  );
}
