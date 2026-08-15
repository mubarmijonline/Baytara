import { useState } from 'react';
import { colors } from '../theme/tokens.js';
import { useI18n } from '../lib/i18n.jsx';

// Curriculum units. Shared by the course page and the lesson player's sidebar, which is
// why selection is a callback rather than a hardcoded navigate.
export default function CurriculumAccordion({
  modules = [], onSelect, activeId = null, doneIds = {}, dense = false,
}) {
  const { t } = useI18n();
  // The unit holding the active lesson opens first; otherwise the first unit does.
  const initial = Math.max(modules.findIndex((m) => (m.videos || []).some((v) => v.id === activeId)), 0);
  const [open, setOpen] = useState({ [initial]: true });

  if (!modules.length) return null;

  const pad = dense ? 12 : 26;

  return (
    <div style={{ border: `1px solid ${colors.line}`, borderRadius: dense ? 12 : 16, overflow: 'hidden', background: colors.surface }}>
      {modules.map((unit, index) => {
        const isOpen = !!open[index];
        const videos = unit.videos || [];
        return (
          <div key={unit.id ?? `loose-${index}`} style={{ borderBottom: index < modules.length - 1 ? `1px solid ${colors.line2}` : 'none' }}>
            <button
              type="button"
              onClick={() => setOpen((current) => ({ ...current, [index]: !current[index] }))}
              aria-expanded={isOpen}
              style={{
                width: '100%', padding: `16px ${pad}px`, display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', gap: 12, background: isOpen ? colors.surfaceMuted : colors.surface,
                border: 'none', cursor: 'pointer', textAlign: 'inherit',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <span aria-hidden="true" style={{ color: isOpen ? colors.accent : '#9aa1b8', fontSize: 13 }}>
                  {isOpen ? '▾' : '▸'}
                </span>
                <span style={{ fontSize: dense ? 13.5 : 15, fontWeight: 700, color: colors.ink }}>
                  {unit.title || t('course.unitDefault')}
                </span>
              </span>
              <span style={{ display: 'flex', gap: 8, flex: 'none' }}>
                <span style={{ background: colors.surface, border: `1px solid ${colors.line}`, borderRadius: 8, padding: '5px 10px', fontSize: 12, color: colors.muted2 }}>
                  {unit.lessons_count} {t('course.lessonsUnit')}
                </span>
                {unit.total_minutes > 0 && (
                  <span className="hide-sm" style={{ background: colors.surface, border: `1px solid ${colors.line}`, borderRadius: 8, padding: '5px 10px', fontSize: 12, color: colors.muted2 }}>
                    {unit.total_minutes} {t('common.minutesShort')}
                  </span>
                )}
              </span>
            </button>

            {isOpen && (
              <div style={{ padding: `10px ${pad}px 14px`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {videos.map((video) => {
                  const active = video.id === activeId;
                  const done = !!doneIds[video.id];
                  return (
                    <button
                      key={video.id}
                      type="button"
                      onClick={() => onSelect?.(video)}
                      aria-current={active ? 'true' : undefined}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                        border: `1px solid ${active ? colors.accent : colors.line2}`,
                        background: active ? '#f8faff' : colors.surface,
                        borderRadius: 10, padding: '11px 14px', fontSize: dense ? 13 : 14,
                        color: colors.ink2, cursor: 'pointer', textAlign: 'inherit', width: '100%',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                        <span aria-hidden="true" style={{ color: done ? '#1a7f4b' : active ? colors.accent : '#9aa1b8', flex: 'none' }}>
                          {done ? '✓' : '▶'}
                        </span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{video.title}</span>
                        {video.access_type === 'free' && (
                          <span style={{ background: '#e8f4ee', color: '#1a7f4b', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, flex: 'none' }}>
                            {t('course.preview')}
                          </span>
                        )}
                      </span>
                      {video.duration_minutes > 0 && (
                        <span style={{ background: colors.surfaceAlt, borderRadius: 7, padding: '4px 9px', color: colors.muted2, fontSize: 12.5, flex: 'none' }}>
                          {video.duration_minutes} {t('common.minutesShort')}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
