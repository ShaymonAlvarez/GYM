import { useMemo, useState } from 'react';
import type { AppState } from '../types';
import { formatMetric } from '../lib/state';

// ─── Data model ─────────────────────────────────────────────────────────────

type SetSnapshot = {
  type: 'yellow' | 'orange' | 'red';
  load: string;
  reps: string;
  activeSeconds?: number;
  restSeconds?: number;
};

type DataPoint = {
  periodIndex: number;
  periodLabel: string;
  weekLabel: string;
  xLabel: string;
  totalLoad: number | null;
  averageReps: number | null;
  setCount: number;
  sets: SetSnapshot[];
  workoutDurationSeconds?: number;
};

type ExerciseEntry = {
  displayName: string;
  points: DataPoint[];
};

// ─── Data builder ────────────────────────────────────────────────────────────

function buildHistory(appState: AppState): Map<string, ExerciseEntry> {
  const archived = (appState.archives ?? []).map((a, i) => ({
    label: a.label ?? `Período ${i + 1}`,
    archivedAt: a.archivedAt,
    state: a.state as Partial<AppState>
  }));

  const periods = [
    ...archived,
    { label: 'Período atual', archivedAt: new Date().toISOString(), state: appState }
  ].sort((a, b) => new Date(a.archivedAt).getTime() - new Date(b.archivedAt).getTime());

  const map = new Map<string, ExerciseEntry>();

  periods.forEach((period, periodIndex) => {
    const templates = period.state.templates ?? [];
    const weeks = period.state.weeks ?? [];

    templates.forEach((template) => {
      template.exercises.forEach((exercise) => {
        const key = exercise.name.trim().toUpperCase();

        if (!map.has(key)) {
          map.set(key, { displayName: exercise.name.trim(), points: [] });
        }

        const entry = map.get(key)!;

        weeks.forEach((week, weekIndex) => {
          const workoutLog = week.workoutLogs.find((l) => l.workoutId === template.id);
          const exerciseLog = workoutLog?.exerciseLogs.find((l) => l.exerciseId === exercise.id);

          if (!exerciseLog || exerciseLog.summary.setCount === 0) return;

          entry.points.push({
            periodIndex,
            periodLabel: period.label,
            weekLabel: week.label,
            xLabel: `S${weekIndex + 1}`,
            totalLoad: exerciseLog.summary.totalLoad,
            averageReps: exerciseLog.summary.averageReps,
            setCount: exerciseLog.summary.setCount,
            sets: exerciseLog.sets.map((s) => ({
              type: s.type,
              load: s.load,
              reps: s.reps,
              activeSeconds: s.activeSeconds,
              restSeconds: s.restSeconds
            })),
            workoutDurationSeconds: workoutLog?.durationSeconds
          });
        });
      });
    });
  });

  return map;
}

// ─── SVG Line Chart ──────────────────────────────────────────────────────────

const CW = 320;
const CH = 130;
const MG = { top: 12, right: 16, bottom: 34, left: 50 };
const PW = CW - MG.left - MG.right;
const PH = CH - MG.top - MG.bottom;

function formatSeconds(s?: number) {
  if (!s) return null;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}m${rem > 0 ? `${rem}s` : ''}` : `${s}s`;
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h${m > 0 ? `${m}min` : ''}`;
  if (m > 0) return `${m}min${s > 0 ? `${s}s` : ''}`;
  return `${s}s`;
}

function LoadChart({ points }: { points: DataPoint[] }) {
  const withLoad = points.filter((p) => p.totalLoad !== null && p.totalLoad > 0);

  if (withLoad.length < 2) {
    return (
      <div className="history-chart-empty">
        Registros insuficientes para gráfico
      </div>
    );
  }

  const maxLoad = Math.max(...withLoad.map((p) => p.totalLoad!));
  const yTicks = [0, Math.round(maxLoad / 2), Math.round(maxLoad)];

  const xStep = PW / (points.length - 1);
  const yScale = (v: number) => PH - (v / maxLoad) * PH;

  // Line path through points that have data
  const pathParts: string[] = [];
  let lastHadData = false;
  points.forEach((p, i) => {
    const x = MG.left + i * xStep;
    if (p.totalLoad == null || p.totalLoad === 0) {
      lastHadData = false;
      return;
    }
    const y = MG.top + yScale(p.totalLoad);
    pathParts.push(`${lastHadData ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`);
    lastHadData = true;
  });

  // Period separator positions (between last week of period N and first of period N+1)
  const separators: number[] = [];
  for (let i = 1; i < points.length; i++) {
    if (points[i].periodIndex !== points[i - 1].periodIndex) {
      const x = MG.left + (i - 0.5) * xStep;
      separators.push(x);
    }
  }

  return (
    <svg
      viewBox={`0 0 ${CW} ${CH}`}
      width="100%"
      className="history-chart-svg"
      aria-label="Gráfico de carga total"
    >
      {/* Y grid + labels */}
      {yTicks.map((tick) => {
        const y = MG.top + yScale(tick);
        return (
          <g key={tick}>
            <line
              x1={MG.left} y1={y} x2={CW - MG.right} y2={y}
              stroke="var(--border)" strokeWidth="0.8"
            />
            <text
              x={MG.left - 5} y={y + 4}
              textAnchor="end"
              className="history-chart-label"
            >
              {tick}
            </text>
          </g>
        );
      })}

      {/* Period separators */}
      {separators.map((x, i) => (
        <line
          key={i}
          x1={x} y1={MG.top} x2={x} y2={MG.top + PH}
          stroke="var(--accent)" strokeWidth="1" strokeDasharray="3 3" opacity="0.5"
        />
      ))}

      {/* X labels */}
      {points.map((p, i) => {
        const x = MG.left + i * xStep;
        const showLabel = points.length <= 12 || i % 2 === 0;
        if (!showLabel) return null;
        return (
          <text
            key={i}
            x={x} y={CH - 4}
            textAnchor="middle"
            className="history-chart-label"
          >
            {p.xLabel}
          </text>
        );
      })}

      {/* Line */}
      {pathParts.length > 0 && (
        <path
          d={pathParts.join(' ')}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}

      {/* Dots */}
      {points.map((p, i) => {
        if (p.totalLoad == null || p.totalLoad === 0) return null;
        const x = MG.left + i * xStep;
        const y = MG.top + yScale(p.totalLoad);
        return (
          <circle key={i} cx={x} cy={y} r="3.5"
            fill="var(--accent)" stroke="var(--bg)" strokeWidth="1.5"
          />
        );
      })}
    </svg>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

type HistoryScreenProps = { appState: AppState };

function HistoryScreen({ appState }: HistoryScreenProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expandedPoint, setExpandedPoint] = useState<number | null>(null);

  const historyMap = useMemo(() => buildHistory(appState), [appState]);

  const entries = useMemo(() => {
    const q = search.trim().toUpperCase();
    return Array.from(historyMap.entries())
      .filter(([key]) => !q || key.includes(q))
      .map(([key, entry]) => ({
        key,
        ...entry,
        sessions: entry.points.length,
        bestLoad: Math.max(0, ...entry.points.map((p) => p.totalLoad ?? 0)) || null
      }))
      .sort((a, b) => b.sessions - a.sessions);
  }, [historyMap, search]);

  // ── Exercise detail view ──────────────────────────────────────────────────
  if (selectedKey) {
    const entry = historyMap.get(selectedKey);
    if (!entry) { setSelectedKey(null); return null; }

    const { points } = entry;
    const withLoad = points.filter((p) => p.totalLoad !== null && p.totalLoad > 0);
    const bestLoad = withLoad.length ? Math.max(...withLoad.map((p) => p.totalLoad!)) : null;
    const avgReps = withLoad.length
      ? withLoad.reduce((s, p) => s + (p.averageReps ?? 0), 0) / withLoad.filter((p) => p.averageReps !== null).length
      : null;

    return (
      <div className="screen" key="history-detail">
        <div className="history-back-row">
          <button
            type="button"
            className="btn btn--ghost btn--sm history-back-btn"
            onClick={() => { setSelectedKey(null); setExpandedPoint(null); }}
          >
            ← Voltar
          </button>
        </div>

        <div>
          <p className="section-label">Histórico</p>
          <h2 className="history-exercise-title">{entry.displayName}</h2>
        </div>

        <div className="history-stats-row">
          <div className="history-stat">
            <span className="history-stat__value">{points.length}</span>
            <span className="history-stat__label">Sessões</span>
          </div>
          <div className="history-stat">
            <span className="history-stat__value">{formatMetric(bestLoad)}</span>
            <span className="history-stat__label">Melhor carga</span>
          </div>
          <div className="history-stat">
            <span className="history-stat__value">{formatMetric(avgReps)}</span>
            <span className="history-stat__label">Média reps</span>
          </div>
        </div>

        <div className="card history-chart-card">
          <p className="history-chart-title">Carga total por semana</p>
          <LoadChart points={points} />
        </div>

        <div className="history-points-list">
          {points.map((p, i) => {
            const isExpanded = expandedPoint === i;
            const activeSets = p.sets.filter((s) => s.type !== 'yellow' && (s.load || s.reps));
            return (
              <div key={i} className="history-point-card card">
                <button
                  type="button"
                  className="history-point-header"
                  onClick={() => setExpandedPoint(isExpanded ? null : i)}
                >
                  <div className="history-point-labels">
                    <span className="history-point-period">{p.periodLabel}</span>
                    <span className="history-point-week">{p.weekLabel}</span>
                  </div>
                  <div className="history-point-metrics">
                    <span className="history-point-load">{formatMetric(p.totalLoad)} kg</span>
                    <span className="history-point-reps">{formatMetric(p.averageReps)} reps</span>
                    <span className="history-point-chevron">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="history-point-sets">
                    {p.workoutDurationSeconds != null && p.workoutDurationSeconds > 0 && (
                      <div className="history-session-duration">
                        ⏱ Treino: {formatDuration(p.workoutDurationSeconds)}
                      </div>
                    )}
                    {activeSets.map((s, si) => {
                      const activeStr = formatSeconds(s.activeSeconds);
                      const restStr = formatSeconds(s.restSeconds);
                      return (
                        <div key={si} className={`history-set history-set--${s.type}`}>
                          <span className="history-set__index">S{si + 1}</span>
                          <span className="history-set__load">{s.load || '—'} kg</span>
                          <span className="history-set__reps">{s.reps || '—'} reps</span>
                          {activeStr && <span className="history-set__time">⏱ {activeStr}</span>}
                          {restStr && <span className="history-set__rest">💤 {restStr}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Exercise list view ────────────────────────────────────────────────────
  return (
    <div className="screen" key="history">
      <div>
        <p className="section-label">Histórico</p>
        <div className="section-title">
          <h2>Progresso dos exercícios</h2>
        </div>
      </div>

      <input
        type="search"
        className="history-search"
        placeholder="Buscar exercício..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {entries.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '32px 16px' }}>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
            {search ? 'Nenhum exercício encontrado.' : 'Nenhum histórico ainda. Complete treinos para ver o progresso aqui.'}
          </p>
        </div>
      ) : (
        <div className="history-exercise-list">
          {entries.map(({ key, displayName, sessions, bestLoad }) => (
            <button
              key={key}
              type="button"
              className="history-exercise-item card"
              onClick={() => setSelectedKey(key)}
            >
              <span className="history-exercise-item__name">{displayName}</span>
              <div className="history-exercise-item__meta">
                <span>{sessions} {sessions === 1 ? 'sessão' : 'sessões'}</span>
                {bestLoad ? <span>Melhor: {formatMetric(bestLoad)} kg</span> : null}
              </div>
              <span className="history-exercise-item__arrow">›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default HistoryScreen;
