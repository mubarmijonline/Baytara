// Writing the end-of-course exam.
//
// Publishing is the switch that starts withholding certificates on this course, so it is
// deliberately the least convenient thing on the panel: it is refused while there is
// nothing answerable, and the consequence is spelled out next to it rather than left for
// someone to discover from a learner's complaint.
//
// A question is edited as one unit -- text and all four options together -- because that
// is how the person writing it thinks about it, and because replacing the options
// wholesale is what the server does anyway.
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { confirmDialog } from '../dialog.jsx';
import { ErrText, Field } from '../ui.jsx';

const BLANK = { text: '', options: [{ text: '', is_correct: true }, { text: '', is_correct: false }] };

function QuestionForm({ initial, copy, onCancel, onSave, saving }) {
  const [draft, setDraft] = useState(() => ({
    text: initial?.text || '',
    options: (initial?.options || BLANK.options).map((o) => ({ text: o.text, is_correct: !!o.is_correct })),
  }));
  const setOption = (index, patch) => setDraft((d) => ({
    ...d, options: d.options.map((o, i) => (i === index ? { ...o, ...patch } : o)),
  }));
  // Exactly one right answer, so choosing one clears the rest rather than letting an
  // author save a question the server will refuse.
  const chooseCorrect = (index) => setDraft((d) => ({
    ...d, options: d.options.map((o, i) => ({ ...o, is_correct: i === index })),
  }));

  return (
    <div className="catalog-panel" style={{ marginBottom: 10 }}>
      <Field label={copy.questionText}>
        <textarea rows={2} value={draft.text}
          onChange={(event) => setDraft((d) => ({ ...d, text: event.target.value }))} />
      </Field>
      <p style={{ margin: '4px 0 8px', fontSize: 12.5, color: 'var(--muted, #6b6b80)' }}>
        {copy.optionsHint}
      </p>
      {draft.options.map((option, index) => (
        <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <input type="radio" name="correct" checked={option.is_correct}
            aria-label={copy.markCorrect} onChange={() => chooseCorrect(index)} />
          <input style={{ flex: 1 }} value={option.text} placeholder={`${copy.option} ${index + 1}`}
            onChange={(event) => setOption(index, { text: event.target.value })} />
          {draft.options.length > 2 && (
            <button className="icon-button" type="button" aria-label={copy.removeOption}
              onClick={() => setDraft((d) => ({
                ...d,
                // Never leave the question without a right answer.
                options: d.options.filter((_, i) => i !== index).map((o, i, all) => (
                  all.some((x) => x.is_correct) ? o : { ...o, is_correct: i === 0 }
                )),
              }))}><X size={15} /></button>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <button className="btn btn-tonal btn-sm" type="button"
          onClick={() => setDraft((d) => ({ ...d, options: [...d.options, { text: '', is_correct: false }] }))}>
          <Plus size={14} /> {copy.addOption}
        </button>
        <button className="btn btn-filled btn-sm" type="button" disabled={saving}
          onClick={() => onSave(draft)}><Check size={14} /> {copy.save}</button>
        <button className="btn btn-tonal btn-sm" type="button" onClick={onCancel}>{copy.cancel}</button>
      </div>
    </div>
  );
}

export default function CourseExamEditor({ courseId, copy, t }) {
  const [exam, setExam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    try { setExam((await api.courseExam(courseId)).exam); }
    catch { setError(copy.loadError); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [courseId]);

  const fail = (failure) => setError(copy.errors[failure?.data?.error] || copy.saveError);

  const run = async (work) => {
    setSaving(true); setError('');
    try { await work(); await load(); setAdding(false); setEditing(null); }
    catch (failure) { fail(failure); }
    finally { setSaving(false); }
  };

  const questions = exam?.questions || [];
  const answerable = questions.filter((q) => q.is_answerable).length;

  return (
    <section className="catalog-panel course-exam-panel">
      <h3>{copy.heading}</h3>
      <p style={{ marginTop: -6, color: 'var(--muted, #6b6b80)', fontSize: 13 }}>{copy.intro}</p>

      {loading ? <p>{t('common.loading')}</p> : (
        <>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
            <Field label={copy.passPercent} hint={copy.passHint}>
              <input type="number" min="1" max="100" style={{ width: 110 }}
                value={exam?.pass_percent ?? 70}
                onChange={(event) => setExam((e) => ({ ...(e || {}), pass_percent: event.target.value }))}
                onBlur={(event) => run(() => api.courseExamSave(courseId, { pass_percent: Number(event.target.value) }))} />
            </Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10 }}>
              <input type="checkbox" checked={!!exam?.is_published} disabled={saving}
                onChange={(event) => run(() => api.courseExamSave(courseId, { is_published: event.target.checked }))} />
              <span>{copy.publish}</span>
            </label>
            <span className={`chip chip-${exam?.is_published ? 'published' : 'draft'}`}>
              {exam?.is_published ? copy.live : copy.notLive}
            </span>
          </div>
          <p style={{ margin: '0 0 14px', fontSize: 12.5, color: '#9b6b00' }}>{copy.publishWarning}</p>

          {questions.map((question, index) => (
            editing === question.id ? (
              <QuestionForm key={question.id} initial={question} copy={copy} saving={saving}
                onCancel={() => setEditing(null)}
                onSave={(draft) => run(() => api.examQuestionUpdate(question.id, draft))} />
            ) : (
              <div key={question.id} className="catalog-panel" style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <strong style={{ color: 'var(--muted, #6b6b80)' }}>{index + 1}.</strong>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: '0 0 6px', fontWeight: 700 }}>{question.text}</p>
                    <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 13.5 }}>
                      {question.options.map((option) => (
                        <li key={option.id} style={{ color: option.is_correct ? '#176b45' : 'inherit',
                          fontWeight: option.is_correct ? 700 : 400 }}>
                          {option.text}{option.is_correct ? ` ✓` : ''}
                        </li>
                      ))}
                    </ul>
                    {!question.is_answerable && <ErrText>{copy.notAnswerable}</ErrText>}
                  </div>
                  <button className="icon-button" type="button" aria-label={copy.edit}
                    onClick={() => setEditing(question.id)}><Pencil size={15} /></button>
                  <button className="icon-button" type="button" aria-label={copy.remove}
                    onClick={async () => {
                      if (!await confirmDialog(copy.removeConfirm)) return;
                      run(() => api.examQuestionDelete(question.id));
                    }}><Trash2 size={15} /></button>
                </div>
              </div>
            )
          ))}

          {adding ? (
            <QuestionForm initial={BLANK} copy={copy} saving={saving}
              onCancel={() => setAdding(false)}
              onSave={(draft) => run(() => api.examQuestionCreate(courseId, draft))} />
          ) : (
            <button className="btn btn-filled" type="button" onClick={() => setAdding(true)}>
              <Plus size={16} /> {copy.addQuestion}
            </button>
          )}

          <p style={{ marginTop: 12, fontSize: 12.5, color: 'var(--muted, #6b6b80)' }}>
            {copy.summary.replace('{answerable}', answerable).replace('{total}', questions.length)}
          </p>
          <ErrText>{error}</ErrText>
        </>
      )}
    </section>
  );
}
