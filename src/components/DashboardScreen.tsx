import type { AppState, SummaryMetrics } from '../types';

type DashboardScreenProps = {
  appState: AppState;
  activeWeekSummary: SummaryMetrics;
  activeWorkoutSummary: SummaryMetrics;
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

  return (
    <div className="screen dashboard-screen" key="dashboard">
      <div className="dashboard-hero">
        <h2>Olá, pronto para treinar?</h2>
        <p>Você está na <strong>{activeWeek.label}</strong>, ficha <strong>{activeWorkout.name}</strong>.</p>
      </div>

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
          <span className="metric-card__sub">{activeCompletion.completed}/{activeCompletion.total}</span>
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
        <button className="btn btn--primary btn--full btn--huge" onClick={onNavigateToWorkout}>
          IR PARA O TREINO
        </button>
      </div>
    </div>
  );
}

export default DashboardScreen;
