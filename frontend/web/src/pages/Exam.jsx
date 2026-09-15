// The end-of-course exam.
//
// The paper arrives already shuffled and without any marker of which option is right;
// marking happens on the server. So there is nothing here that decides a result, and
// nothing worth reading in the response to cheat with.
//
// Attempts are unlimited by decision, so this screen never bars a retry. What it does do
// is refuse to submit a half-finished paper without saying so first: an unanswered
// question is marked wrong, and losing a pass to a question the learner simply scrolled
// past would feel like a bug rather than a result.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Container } from '../components/Primitives.jsx';
import NotFound from './NotFound.jsx';
import { auth, isAuthed, useFetch, webapi } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { colors, gradients } from '../theme/tokens.js';

function Panel({ children, style }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e6e8f0', borderRadius: 16,
      padding: '26px 24px', ...style }}>{children}</div>
  );
}

function Result({ result, slug, onRetry, t }) {
  const { attempt, certificate, pass_percent: passMark } = result;
  const passed = attempt.passed;
  return (
    <Panel style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 6 }} aria-hidden="true">{passed ? '🎓' : '📝'}</div>
      <h1 style={{ margin: '0 0 8px', fontSize: 26 }}>
        {passed ? t('exam.passedTitle') : t('exam.failedTitle')}
      </h1>
      <p style={{ margin: '0 0 6px', fontSize: 34, fontWeight: 800,
        color: passed ? '#176b45' : colors.accent }}>{attempt.score_percent}%</p>
      <p style={{ margin: '0 0 20px', color: colors.muted, fontSize: 14.5 }}>
        {t('exam.scoreDetail')
          .replace('{correct}', attempt.correct_count)
          .replace('{total}', attempt.question_count)
          .replace('{pass}', passMark)}
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        {passed && certificate && (
          <Link to={`/certificates/${certificate.serial}`}
            style={{ background: colors.accent, color: '#fff', padding: '12px 22px',
              borderRadius: 11, fontWeight: 700, textDecoration: 'none' }}>
            {t('exam.viewCertificate')}
          </Link>
        )}
        {/* Unlimited attempts: a failure is never a dead end. */}
        <button type="button" onClick={onRetry}
          style={{ background: passed ? 'transparent' : colors.accent,
            color: passed ? colors.ink : '#fff',
            border: passed ? '1px solid #d6d9e4' : 'none',
            padding: '12px 22px', borderRadius: 11, fontWeight: 700, cursor: 'pointer' }}>
          {passed ? t('exam.retakeAnyway') : t('exam.tryAgain')}
        </button>
        <Link to={`/courses/${slug}`}
          style={{ padding: '12px 22px', borderRadius: 11, fontWeight: 700,
            textDecoration: 'none', color: colors.ink, border: '1px solid #d6d9e4' }}>
          {t('exam.backToCourse')}
        </Link>
      </div>
    </Panel>
  );
}

export default function Exam() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [reloadKey, setReloadKey] = useState(0);
  const { data, error, loading } = useFetch(() => auth.exam(slug), [slug, reloadKey]);
  const course = useFetch(() => webapi.course(slug), [slug]);

  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [confirmPartial, setConfirmPartial] = useState(false);

  const exam = data?.exam;
  const questions = exam?.questions || [];

  useEffect(() => { setAnswers({}); setConfirmPartial(false); }, [reloadKey]);

  const retry = useCallback(() => {
    setResult(null);
    setSubmitError('');
    setReloadKey((n) => n + 1);   // a fresh paper, reshuffled by the server
  }, []);

  if (!isAuthed()) { navigate(`/auth?next=${encodeURIComponent(`/courses/${slug}/exam`)}`); return null; }
  if (loading) return <Container style={{ padding: '60px 24px' }}>{t('common.loading')}</Container>;
  if (error) {
    const code = error?.data?.error;
    if (code === 'no_exam' || code === 'course_not_found') return <NotFound />;
    return (
      <Container style={{ padding: '60px 24px' }}>
        <Panel><p style={{ margin: 0 }}>{t(`exam.err.${code}`) || t('exam.err.generic')}</p></Panel>
      </Container>
    );
  }

  const title = course.data?.course?.title || '';
  const answered = Object.keys(answers).length;

  const submit = async () => {
    if (answered < questions.length && !confirmPartial) {
      // Say it once, then let them through -- an unanswered question is simply wrong,
      // and forcing a full paper would be a rule the client never asked for.
      setConfirmPartial(true);
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      setResult(await auth.examSubmit(slug, answers));
    } catch (failure) {
      setSubmitError(t(`exam.err.${failure?.data?.error}`) || t('exam.err.generic'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ background: colors.surfaceMuted, padding: '34px 0 70px' }}>
      <Container style={{ maxWidth: 780 }}>
        <div style={{ background: gradients.darkPanel, color: '#fff', borderRadius: 16,
          padding: '24px 26px', marginBottom: 18 }}>
          <div style={{ fontSize: 12.5, color: colors.gold, fontWeight: 700, marginBottom: 6 }}>
            {t('exam.title')}
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{title}</h1>
          <p style={{ margin: '10px 0 0', fontSize: 13.5, color: '#b9bfd6', lineHeight: 1.8 }}>
            {t('exam.rules')
              .replace('{pass}', exam.pass_percent)
              .replace('{count}', exam.question_count)}
          </p>
        </div>

        {result ? (
          <Result result={result} slug={slug} onRetry={retry} t={t} />
        ) : !exam.eligible ? (
          <Panel>
            <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>{t('exam.notYetTitle')}</h2>
            <p style={{ margin: '0 0 16px', color: colors.muted, lineHeight: 1.9 }}>
              {t('exam.notYetBody').replace('{percent}', exam.course_percent)}
            </p>
            <Link to={`/learn/${slug}`}
              style={{ background: colors.accent, color: '#fff', padding: '12px 22px',
                borderRadius: 11, fontWeight: 700, textDecoration: 'none' }}>
              {t('exam.continueCourse')}
            </Link>
          </Panel>
        ) : (
          <>
            {exam.passed && (
              <Panel style={{ marginBottom: 14, borderColor: '#bfe3d0', background: '#f2fbf6' }}>
                <p style={{ margin: 0, color: '#176b45', fontWeight: 700 }}>
                  {t('exam.alreadyPassed').replace('{best}', exam.best_score_percent)}
                </p>
              </Panel>
            )}
            {questions.map((question, index) => (
              <Panel key={question.id} style={{ marginBottom: 12 }}>
                <p style={{ margin: '0 0 14px', fontWeight: 700, lineHeight: 1.8 }}>
                  <span style={{ color: colors.muted, marginInlineEnd: 8 }}>{index + 1}.</span>
                  {question.text}
                </p>
                {question.options.map((option) => {
                  const checked = answers[question.id] === option.id;
                  return (
                    <label key={option.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px',
                        borderRadius: 10, cursor: 'pointer', marginBottom: 7,
                        border: `1px solid ${checked ? colors.accent : '#e6e8f0'}`,
                        background: checked ? '#fff5f5' : '#fff' }}>
                      <input type="radio" name={`q${question.id}`} checked={checked}
                        onChange={() => setAnswers((a) => ({ ...a, [question.id]: option.id }))} />
                      <span style={{ lineHeight: 1.7 }}>{option.text}</span>
                    </label>
                  );
                })}
              </Panel>
            ))}

            <Panel style={{ position: 'sticky', bottom: 12, display: 'flex',
              alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13.5, color: colors.muted }}>
                {t('exam.answeredCount').replace('{answered}', answered).replace('{total}', questions.length)}
              </span>
              <button type="button" onClick={submit} disabled={submitting}
                style={{ marginInlineStart: 'auto', background: colors.accent, color: '#fff',
                  border: 'none', padding: '13px 26px', borderRadius: 11, fontWeight: 700,
                  cursor: submitting ? 'progress' : 'pointer' }}>
                {submitting ? t('common.loading')
                  : confirmPartial ? t('exam.submitAnyway') : t('exam.submit')}
              </button>
              {confirmPartial && (
                <p role="alert" style={{ width: '100%', margin: 0, fontSize: 13, color: '#9b6b00' }}>
                  {t('exam.partialWarning').replace('{left}', questions.length - answered)}
                </p>
              )}
              {submitError && (
                <p role="alert" style={{ width: '100%', margin: 0, fontSize: 13, color: '#9b2626' }}>
                  {submitError}
                </p>
              )}
            </Panel>
          </>
        )}
      </Container>
    </div>
  );
}
