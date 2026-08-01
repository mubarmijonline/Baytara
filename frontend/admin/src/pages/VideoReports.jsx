import { useEffect, useMemo, useState } from 'react';
import { Download, Eye, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAdminLanguage } from '../i18n.jsx';
import { pageCopy } from '../page-copy.js';

const FILTERS = ['date_from', 'date_to', 'video', 'category', 'course', 'access_type', 'viewer', 'status', 'device', 'ip'];
const STATUSES = ['denied', 'provider_failed', 'issued', 'playing', 'paused', 'completed', 'error', 'abandoned'];
const ACCESS_TYPES = ['free', 'vet_free', 'baytarian', 'general'];
const CATEGORY_OPTIONS = ['large-animals', 'equine', 'pet-animals', 'poultry', 'fish-other-animal-sources', 'camel'];

function reportParams(searchParams, includePage = true) {
  const params = {};
  FILTERS.forEach((key) => {
    const value = searchParams.get(key);
    if (value) params[key] = value;
  });
  if (includePage) {
    params.page = Math.max(Number(searchParams.get('page')) || 1, 1);
    params.per_page = 25;
  }
  return params;
}

function seconds(value) {
  const total = Number(value) || 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}:${String(secs).padStart(2, '0')}`;
}

function dateTime(value, language) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG' : 'en-GB', {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value));
}

function statusClass(status) {
  if (status === 'completed' || status === 'playing') return 'report-status-good';
  if (status === 'denied' || status === 'provider_failed' || status === 'error') return 'report-status-bad';
  return 'report-status-neutral';
}

function Status({ status, copy }) {
  return <span className={`report-status ${statusClass(status)}`}>{copy.statuses[status] || status}</span>;
}

function Filters({ searchParams, setSearchParams, copy }) {
  const setFilter = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    next.set('page', '1');
    setSearchParams(next);
  };
  const input = (key, type = 'text') => (
    <label className="report-filter" key={key}>
      <span>{copy.filters[key]}</span>
      <input type={type} value={searchParams.get(key) || ''} onChange={(event) => setFilter(key, event.target.value)} />
    </label>
  );
  return (
    <div className="report-filters">
      {input('date_from', 'date')}{input('date_to', 'date')}{input('video')}{input('course')}
      <label className="report-filter"><span>{copy.filters.category}</span><select value={searchParams.get('category') || ''} onChange={(event) => setFilter('category', event.target.value)}><option value="">{copy.all}</option>{CATEGORY_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className="report-filter"><span>{copy.filters.access_type}</span><select value={searchParams.get('access_type') || ''} onChange={(event) => setFilter('access_type', event.target.value)}><option value="">{copy.all}</option>{ACCESS_TYPES.map((value) => <option key={value} value={value}>{copy.access[value]}</option>)}</select></label>
      {input('viewer')}
      <label className="report-filter"><span>{copy.filters.status}</span><select value={searchParams.get('status') || ''} onChange={(event) => setFilter('status', event.target.value)}><option value="">{copy.all}</option>{STATUSES.map((value) => <option key={value} value={value}>{copy.statuses[value]}</option>)}</select></label>
      {input('device')}{input('ip')}
      <button type="button" className="btn btn-text btn-sm report-clear" onClick={() => setSearchParams({ page: '1' })}>{copy.clear}</button>
    </div>
  );
}

function ReportList({ searchParams, setSearchParams, copy, language }) {
  const [summary, setSummary] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const query = searchParams.toString();
  const params = useMemo(() => reportParams(searchParams), [query]);

  useEffect(() => {
    let active = true;
    setError('');
    Promise.all([api.videoReportSummary(params), api.videoReportSessions(params)])
      .then(([nextSummary, nextResult]) => { if (active) { setSummary(nextSummary); setResult(nextResult); } })
      .catch(() => { if (active) setError(copy.loadError); });
    return () => { active = false; };
  }, [query, reload, copy.loadError]);

  const movePage = (page) => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(page));
    setSearchParams(next);
  };
  const exportCsv = async () => {
    try {
      const blob = await api.downloadVideoReport(reportParams(searchParams, false));
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = `baytara-video-report-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(href);
    } catch { setError(copy.exportError); }
  };
  const metrics = summary ? [
    ['attempts', summary.attempts], ['successful', summary.successful], ['active', summary.active],
    ['unique_viewers', summary.unique_viewers], ['watch_seconds', seconds(summary.watch_seconds)],
    ['completion_rate', `${summary.completion_rate}%`], ['denied', summary.denied], ['failures', summary.failures],
  ] : [];

  return (
    <section className="video-report-page">
      <header className="report-header"><div><h2>{copy.heading}</h2><p>{copy.subtitle}</p></div><div className="report-actions"><button type="button" className="btn btn-tonal btn-sm" onClick={() => setReload((value) => value + 1)}><RefreshCw size={16} />{copy.refresh}</button><button type="button" className="btn btn-filled btn-sm" onClick={exportCsv}><Download size={16} />{copy.export}</button></div></header>
      {summary && <div className="report-metrics">{metrics.map(([key, value]) => <div className="report-metric" key={key}><strong>{value}</strong><span>{copy.metrics[key]}</span></div>)}</div>}
      <Filters searchParams={searchParams} setSearchParams={setSearchParams} copy={copy} />
      {error && <p className="error-text" role="alert">{error}</p>}
      {!result ? <div className="empty">{copy.loading}</div> : (
        <div className="table-scroll"><table className="table report-table"><thead><tr>{copy.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>
          {result.sessions.map((row) => <tr key={row.session_id}>
            <td><strong>{row.viewer?.name || '—'}</strong><small>{row.viewer?.email || '—'}</small></td>
            <td><strong>{row.video?.title || '—'}</strong><small>#{row.video?.id || '—'}</small></td>
            <td><span>{row.category || '—'}</span><small>{row.course?.title || '—'}</small></td>
            <td>{copy.access[row.access_type] || row.access_type}</td>
            <td><Status status={row.status} copy={copy} /></td>
            <td>{seconds(row.watched_seconds)}<small>{row.completion_percent || 0}%</small></td>
            <td><span>{row.security?.device_id || '—'}</span><small>{row.security?.ip_address || '—'}</small></td>
            <td>{dateTime(row.started_at, language)}</td>
            <td><Link className="icon-button" title={copy.view} aria-label={copy.view} to={`/video-reports/${row.session_id}`}><Eye size={17} /></Link></td>
          </tr>)}
          {!result.sessions.length && <tr><td colSpan="9" className="empty">{copy.empty}</td></tr>}
        </tbody></table></div>
      )}
      {result && <div className="report-pagination"><button type="button" className="btn btn-tonal btn-sm" disabled={result.page <= 1} onClick={() => movePage(result.page - 1)}>{copy.previous}</button><span>{copy.page} {result.page} {copy.of} {result.pages || 1}</span><button type="button" className="btn btn-tonal btn-sm" disabled={result.page >= result.pages} onClick={() => movePage(result.page + 1)}>{copy.next}</button></div>}
    </section>
  );
}

function Fact({ label, children }) {
  return <div className="report-fact"><span>{label}</span><strong>{children || '—'}</strong></div>;
}

function ReportDetail({ sessionId, copy, language }) {
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api.videoReportSession(sessionId).then((data) => active && setSession(data.session)).catch(() => active && setError(copy.loadError));
    return () => { active = false; };
  }, [sessionId, copy.loadError]);
  if (error) return <p className="error-text" role="alert">{error}</p>;
  if (!session) return <div className="empty">{copy.loading}</div>;
  return (
    <section className="video-report-page report-detail">
      <Link className="back-link" to="/video-reports">{copy.back}</Link>
      <header className="report-header"><div><h2>{copy.detailHeading}</h2><p>{session.session_id}</p></div><Status status={session.status} copy={copy} /></header>
      <div className="report-detail-sections">
        <section><h3>{copy.identity}</h3><div className="report-facts"><Fact label={copy.labels.name}>{session.viewer?.name}</Fact><Fact label={copy.labels.email}>{session.viewer?.email}</Fact><Fact label={copy.labels.phone}>{session.viewer?.phone}</Fact><Fact label={copy.labels.video}>{session.video?.title}</Fact><Fact label={copy.labels.course}>{session.course?.title}</Fact><Fact label={copy.labels.category}>{session.category}</Fact></div></section>
        <section><h3>{copy.security}</h3><div className="report-facts"><Fact label={copy.labels.device}>{session.security?.device_id}</Fact><Fact label={copy.labels.ip}>{session.security?.ip_address}</Fact><Fact label={copy.labels.browser}>{session.security?.user_agent}</Fact><Fact label={copy.labels.reason}>{session.reason}</Fact><Fact label={copy.labels.started}>{dateTime(session.started_at, language)}</Fact><Fact label={copy.labels.lastEvent}>{dateTime(session.last_event_at, language)}</Fact></div></section>
        <section><h3>{copy.measurements}</h3><div className="report-facts"><Fact label={copy.labels.watched}>{seconds(session.watched_seconds)}</Fact><Fact label={copy.labels.covered}>{seconds(session.covered_seconds)}</Fact><Fact label={copy.labels.duration}>{seconds(session.duration_seconds)}</Fact><Fact label={copy.labels.completion}>{session.completion_percent}%</Fact><Fact label={copy.labels.firstPlayed}>{dateTime(session.first_played_at, language)}</Fact><Fact label={copy.labels.ended}>{dateTime(session.ended_at, language)}</Fact></div></section>
      </div>
      <section className="report-timeline"><h3>{copy.timeline}</h3><div className="table-scroll"><table className="table"><thead><tr><th>{copy.labels.event}</th><th>{copy.labels.position}</th><th>{copy.labels.watched}</th><th>{copy.labels.time}</th></tr></thead><tbody>{(session.events || []).map((event) => <tr data-testid="playback-event" key={event.id || event.event_id}><td>{copy.events[event.type] || event.type}</td><td>{event.position_seconds == null ? '—' : seconds(event.position_seconds)}</td><td>{event.watched_seconds == null ? '—' : seconds(event.watched_seconds)}</td><td>{dateTime(event.created_at, language)}</td></tr>)}</tbody></table></div></section>
    </section>
  );
}

export default function VideoReports({ routeParams, searchParams, setSearchParams }) {
  const { language } = useAdminLanguage();
  const copy = pageCopy('videoReports', language);
  return routeParams.sessionId
    ? <ReportDetail sessionId={routeParams.sessionId} copy={copy} language={language} />
    : <ReportList searchParams={searchParams} setSearchParams={setSearchParams} copy={copy} language={language} />;
}
