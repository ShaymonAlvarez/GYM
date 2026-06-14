import type { AppState, SummaryMetrics } from '../types';

type DashboardScreenProps = {
  appState: AppState;
  activeWeekSummary: SummaryMetrics;
  activeWorkoutSummary: SummaryMetrics;
  previousWeekSummary: SummaryMetrics | null;
  workoutsThisWeek: number;
  activeProgress: number;
  activeCompletion: { completed: number; total: number };
  saveStatus: 'saved' | 'saving' | 'dirty';
  saveStatusLabel: string;
  formatMetric: (value: number | null, maxFractionDigits?: number) => string;
  onNavigateToWorkout: () => void;
};

function DashboardScreen({
  appState,
  activeWeekSummary,
  activeWorkoutSummary,
  previousWeekSummary,
  workoutsThisWeek,
  activeProgress,
  activeCompletion,
  saveStatus,
  saveStatusLabel,
  formatMetric,
  onNavigateToWorkout
}: DashboardScreenProps) {
  const activeWorkout =
    appState.templates.find((w) => w.id === appState.activeWorkoutId) ?? appState.templates[0];
  const activeWeek = appState.weeks[appState.activeWeekIndex] ?? appState.weeks[0];

  // Volume trend vs previous week (same workout)
  const currentVol = activeWeekSummary.totalLoad;
  const prevVol = previousWeekSummary?.totalLoad ?? null;
  const trendPct =
    currentVol !== null && prevVol !== null && prevVol > 0
      ? Math.round(((currentVol - prevVol) / prevVol) * 100)
      : null;
  const trendUp = trendPct !== null && trendPct >= 0;

  return (
    <div className="screen dashboard-screen" key="dashboard">
      <div className="dashboard-hero">
        <h2>Olá, pronto para treinar?</h2>
        <p>
          Você está na <strong>{activeWeek.label}</strong>, ficha{' '}
          <strong>{activeWorkout.name}</strong>.
        </p>
      </div>

      {/* Fila 1: métricas principais */}
      <div className="metrics-grid">
        <div className="metric-card metric-card--accent">
          <span className="metric-card__label">Semana</span>
          <strong className="metric-card__value">{formatMetric(activeWeekSummary.totalLoad, 0)}</strong>
          <span className="metric-card__sub">kg total</span>
        </div>
        <div className="metric-card">
          <span className="metric-card__label">Treino</span>
          <strong className="metric-card__value">{formatMetric(activeWorkoutSummary.totalLoad, 0)}</strong>
          <span className="metric-card__sub">kg total</span>
        </div>
        <div className="metric-card">
          <span className="metric-card__label">Progresso</span>
          <strong className="metric-card__value">{activeProgress}%</strong>
          <span className="metric-card__sub">
            {activeCompletion.completed}/{activeCompletion.total} séries
          </span>
        </div>
      </div>

      {/* Fila 2: tendência + treinos feitos */}
      <div className="metrics-grid metrics-grid--two">
        <div className="metric-card">
          <span className="metric-card__label">Tendência</span>
          {trendPct !== null ? (
            <>
              <strong
                className="metric-card__value"
                style={{ color: trendUp ? 'var(--success)' : 'var(--red)' }}
              >
                {trendUp ? '↑' : '↓'} {Math.abs(trendPct)}%
              </strong>
              <span className="metric-card__sub">vs semana anterior</span>
            </>
          ) : (
            <>
              <strong className="metric-card__value" style={{ color: 'var(--text-tertiary)' }}>
                —
              </strong>
              <span className="metric-card__sub">sem dados anteriores</span>
            </>
          )}
        </div>
        <div className="metric-card">
          <span className="metric-card__label">Treinos</span>
          <strong className="metric-card__value">{workoutsThisWeek}</strong>
          <span className="metric-card__sub">
            registrados esta semana
          </span>
        </div>
      </div>

      <div className="progress-section">
        <div className="progress-header">
          <div className="progress-header-left">
            <span className={`save-indicator save-indicator--${saveStatus}`} />
            <span>{saveStatusLabel}</span>
          </div>
          <strong>{activeProgress}%</strong>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${activeProgress}%` }} />
        </div>
      </div>

      <div className="dashboard-cta">
        <button className="btn btn--primary btn--huge" onClick={onNavigateToWorkout}>
          IR PARA O TREINO
        </button>
      </div>
    </div>
  );
}

export default DashboardScreen;
