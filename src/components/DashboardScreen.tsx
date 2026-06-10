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
  onWeekChange: (weekIndex: number) => void;
  onWorkoutChange: (workoutId: string) => void;
  getWeekSummary: (week: AppState['weeks'][number]) => SummaryMetrics;
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
  onWeekChange,
  onWorkoutChange,
  getWeekSummary
}: DashboardScreenProps) {
  const activeWorkout =
    appState.templates.find((w) => w.id === appState.activeWorkoutId) ?? appState.templates[0];
  const activeWeek = appState.weeks[appState.activeWeekIndex] ?? appState.weeks[0];

  return (
    <div className="screen" key="dashboard">
      {/* Métricas */}
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

      {/* Barra de progresso */}
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

      {/* Seletor de semana */}
      <div>
        <p className="section-label">Semana</p>
        <div className="section-title">
          <h2>Período de 6 semanas</h2>
        </div>
        <div className="selector-strip" style={{ marginTop: 8 }}>
          {appState.weeks.map((week) => {
            const summary = getWeekSummary(week);
            return (
              <button
                key={week.index}
                className={`week-chip${week.index === appState.activeWeekIndex ? ' week-chip--active' : ''}`}
                type="button"
                onClick={() => onWeekChange(week.index)}
              >
                <strong>{week.label}</strong>
                <span>{formatMetric(summary.totalLoad, 0)} kg</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Seletor de treino */}
      <div>
        <p className="section-label">Treino</p>
        <div className="section-title">
          <h2>{activeWeek.label} — Ficha do dia</h2>
        </div>
        <div className="selector-strip" style={{ marginTop: 8 }}>
          {appState.templates.map((workout) => (
            <button
              key={workout.id}
              className={`workout-chip${workout.id === activeWorkout.id ? ' workout-chip--active' : ''}`}
              style={{ ['--workout-accent' as string]: workout.accent }}
              type="button"
              onClick={() => onWorkoutChange(workout.id)}
            >
              <strong>{workout.name}</strong>
              <span>{workout.subtitle}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Legenda */}
      <div className="legend-row">
        <span className="legend-pill legend-pill--yellow">Aquecimento</span>
        <span className="legend-pill legend-pill--orange">Série séria</span>
        <span className="legend-pill legend-pill--red">Série difícil</span>
      </div>
    </div>
  );
}

export default DashboardScreen;
