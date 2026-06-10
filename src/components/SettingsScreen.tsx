import React from 'react';
import type { AppState, SheetLayout } from '../types';
import type { FeedbackState } from '../types';
import WorkbookSheet from './WorkbookSheet';

type FeedbackQuestion = {
  rowNumber: number;
  text: string;
  options: string[];
};

type SettingsScreenProps = {
  appState: AppState;
  supabaseUserEmail: string | null;
  isSupabaseConfigured: boolean;
  isSupabaseBusy: boolean;
  supabaseStatus: string;
  isExportingWorkbook: boolean;
  isExportingPdf: boolean;
  isSheetPreviewVisible: boolean;
  workbookCellValues: Record<string, string>;
  workbookLayout: SheetLayout;
  feedbackState: FeedbackState;
  feedbackQuestions: FeedbackQuestion[];
  pdfExportRef: React.RefObject<HTMLDivElement>;
  onToggleSync: (enabled: boolean) => void;
  onPushToSupabase: () => void;
  onPullFromSupabase: () => void;
  onSupabaseSignOut: () => void;
  onExportWorkbook: () => void;
  onExportPdf: () => void;
  onToggleSheetPreview: () => void;
  onLogout: () => void;
};

function SettingsScreen({
  appState,
  supabaseUserEmail,
  isSupabaseConfigured,
  isSupabaseBusy,
  supabaseStatus,
  isExportingWorkbook,
  isExportingPdf,
  isSheetPreviewVisible,
  workbookCellValues,
  workbookLayout,
  feedbackState,
  feedbackQuestions,
  pdfExportRef,
  onToggleSync,
  onPushToSupabase,
  onPullFromSupabase,
  onSupabaseSignOut,
  onExportWorkbook,
  onExportPdf,
  onToggleSheetPreview,
  onLogout
}: SettingsScreenProps) {
  const activeWeek = appState.weeks[appState.activeWeekIndex] ?? appState.weeks[0];

  return (
    <div className="screen" key="settings">
      <div>
        <p className="section-label">Configurações</p>
        <div className="section-title">
          <h2>Sincronização e exportação</h2>
        </div>
      </div>

      <div className="settings-group">
        {/* Status da conta */}
        <div className="settings-card">
          <span className="settings-card__title">Conta</span>
          <div
            className={`sync-status-bar ${isSupabaseConfigured && supabaseUserEmail ? 'sync-status-bar--ok' : 'sync-status-bar--off'}`}
          >
            <span className="sync-status-bar__dot" />
            {supabaseUserEmail
              ? `Conectado como ${supabaseUserEmail}`
              : isSupabaseConfigured
                ? 'Faça login para sincronizar.'
                : 'Supabase não configurado.'}
          </div>

          {supabaseUserEmail ? (
            <button
              className="btn btn--ghost btn--sm"
              type="button"
              disabled={isSupabaseBusy}
              onClick={onSupabaseSignOut}
            >
              Desconectar conta
            </button>
          ) : null}
        </div>

        {/* Sincronização */}
        <div className="settings-card">
          <span className="settings-card__title">Sincronização</span>

          <label className="switch-row">
            <div className="switch-toggle">
              <input
                type="checkbox"
                checked={appState.supabase?.enabled ?? false}
                onChange={(event) => onToggleSync(event.target.checked)}
              />
              <span className="switch-toggle__track" />
            </div>
            <span>Sincronizar dados e fotos otimizadas</span>
          </label>

          <div className="settings-actions">
            <button
              className="btn btn--primary btn--sm"
              type="button"
              disabled={!supabaseUserEmail || isSupabaseBusy}
              onClick={onPushToSupabase}
            >
              Enviar dados
            </button>
            <button
              className="btn btn--secondary btn--sm"
              type="button"
              disabled={!supabaseUserEmail || isSupabaseBusy}
              onClick={onPullFromSupabase}
            >
              Baixar dados
            </button>
          </div>

          {supabaseStatus ? <p className="sync-message">{supabaseStatus}</p> : null}

          <p className="settings-note">
            Fotos são redimensionadas para até 1800px e salvas em WebP/JPEG. Vídeos ficam somente no
            dispositivo.
          </p>
        </div>

        {/* Exportação */}
        <div className="settings-card">
          <span className="settings-card__title">Exportação</span>
          <div className="settings-actions">
            <button
              className="btn btn--secondary btn--sm"
              type="button"
              disabled={isExportingWorkbook}
              onClick={onExportWorkbook}
            >
              {isExportingWorkbook ? 'Gerando...' : 'Excel'}
            </button>
            <button
              className="btn btn--secondary btn--sm"
              type="button"
              disabled={isExportingPdf}
              onClick={onExportPdf}
            >
              {isExportingPdf ? 'Gerando...' : 'PDF'}
            </button>
          </div>
          <button className="btn btn--ghost btn--sm" type="button" onClick={onToggleSheetPreview}>
            {isSheetPreviewVisible ? 'Ocultar planilha' : 'Ver planilha'}
          </button>
        </div>

        {/* Sheet Preview */}
        {isSheetPreviewVisible ? (
          <div className="settings-card">
            <span className="settings-card__title">Conferência do layout</span>
            <div className="sheet-preview-scroller">
              <WorkbookSheet cellValues={workbookCellValues} layout={workbookLayout} />
            </div>
          </div>
        ) : null}

        {/* Logout */}
        <button className="btn btn--danger btn--full" type="button" onClick={onLogout}>
          Sair do app
        </button>
      </div>

      {/* PDF export surface (hidden) */}
      <div className="sheet-capture-surface" aria-hidden="true">
        <div ref={pdfExportRef} className="pdf-export-document">
          <section className="pdf-page">
            <h2>Ficha de cargas - {activeWeek.label}</h2>
            <WorkbookSheet cellValues={workbookCellValues} layout={workbookLayout} />
          </section>
          <section className="pdf-page">
            <h2>Feedback do período</h2>
            <table className="pdf-table">
              <thead>
                <tr>
                  <th>Pergunta</th>
                  {appState.weeks.map((week) => (
                    <th key={week.index}>{week.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {feedbackQuestions.map((question, questionIndex) => (
                  <tr key={question.rowNumber}>
                    <td>{question.text}</td>
                    {appState.weeks.map((week) => (
                      <td key={week.index}>
                        {feedbackState.weeklyAnswers[week.index]?.[questionIndex] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="pdf-page">
            <h2>Feedback comentários</h2>
            <table className="pdf-table pdf-table--comments">
              <tbody>
                {appState.weeks.map((week) => (
                  <tr key={week.index}>
                    <th>{week.label}</th>
                    <td>{feedbackState.weeklyComments[week.index] ?? ''}</td>
                  </tr>
                ))}
                <tr>
                  <th>Semana 6 fotos</th>
                  <td>{feedbackState.photoNote}</td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
}

export default SettingsScreen;
