import React, { useState } from 'react';
import type { AppState, SheetLayout } from '../types';
import type { FeedbackState } from '../types';

type PreviewTab = 'cargas' | 'feedback' | 'comentarios';
import WorkbookSheet from './WorkbookSheet';

const SunIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);

const MoonIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

type FeedbackQuestion = {
  rowNumber: number;
  text: string;
  fullText?: string;
  options: string[];
};

type SettingsScreenProps = {
  appState: AppState;
  supabaseUserEmail: string | null;
  isSupabaseConfigured: boolean;
  isExportingWorkbook: boolean;
  isExportingPdf: boolean;
  isSheetPreviewVisible: boolean;
  workbookCellValues: Record<string, string>;
  workbookLayout: SheetLayout;
  feedbackState: FeedbackState;
  feedbackQuestions: FeedbackQuestion[];
  pdfExportRef: React.RefObject<HTMLDivElement>;
  onSupabaseSignOut: () => void;
  onExportWorkbook: () => void;
  onExportPdf: () => void;
  onToggleSheetPreview: () => void;
  onChangeTheme: (theme: 'light' | 'dark' | 'system') => void;
  onToggleHideWarmupSets: (hide: boolean) => void;
  onImportPdf: (file: File) => void;
  onClearLocalData: () => void;
  onClearAllData: () => void;
  onLogout: () => void;
};

function SettingsScreen({
  appState,
  supabaseUserEmail,
  isSupabaseConfigured,
  isExportingWorkbook,
  isExportingPdf,
  isSheetPreviewVisible,
  workbookCellValues,
  workbookLayout,
  feedbackState,
  feedbackQuestions,
  pdfExportRef,
  onSupabaseSignOut,
  onExportWorkbook,
  onExportPdf,
  onToggleSheetPreview,
  onChangeTheme,
  onToggleHideWarmupSets,
  onImportPdf,
  onClearLocalData,
  onClearAllData,
  onLogout
}: SettingsScreenProps) {
  const activeWeek = appState.weeks[appState.activeWeekIndex] ?? appState.weeks[0] ?? { index: 0, label: 'Semana 1', workoutLogs: [] };
  const isDark = (appState.theme ?? 'dark') !== 'light';
  const [previewTab, setPreviewTab] = useState<PreviewTab>('cargas');

  return (
    <div className="screen" key="settings">
      <div>
        <p className="section-label">Configurações</p>
        <div className="section-title">
          <h2>Sincronização e exportação</h2>
        </div>
      </div>

      <div className="settings-group">

        {/* Conta */}
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
                : 'Sincronização indisponível.'}
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

        {/* Importação */}
        <div className="settings-card">
          <span className="settings-card__title">Importar Treino (PDF)</span>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: '12px' }}>
            Importe o PDF com o treino. O progresso atual será arquivado no Histórico e um novo ciclo será iniciado.
          </p>
          <label className="btn btn--primary" style={{ cursor: 'pointer', textAlign: 'center', display: 'block' }}>
            Selecionar PDF
            <input
              type="file"
              accept="application/pdf"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImportPdf(file);
                e.target.value = '';
              }}
            />
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
            <button
              className="btn btn--ghost btn--full"
              type="button"
              onClick={onClearAllData}
            >
              Apagar todos os dados (mantém login)
            </button>
            <button
              className="btn btn--danger btn--full"
              type="button"
              onClick={onClearLocalData}
            >
              Apagar tudo e sair da conta
            </button>
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '6px' }}>
            <b>Mantém login:</b> apaga cargas, histórico e Supabase, mas fica logado.<br />
            <b>Apagar tudo:</b> zera o dispositivo e encerra a sessão.
          </p>
        </div>

        {/* Treino */}
        <div className="settings-card">
          <span className="settings-card__title">Treino</span>
          <label className="switch-row">
            <div className="switch-toggle">
              <input
                type="checkbox"
                checked={appState.preferences?.hideWarmupSets ?? false}
                onChange={(event) => onToggleHideWarmupSets(event.target.checked)}
              />
              <span className="switch-toggle__track" />
            </div>
            <span>Ocultar e ignorar séries de aquecimento</span>
          </label>
        </div>

        {/* Aparência */}
        <div className="settings-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="settings-card__title">Aparência</span>
            <button
              className="theme-toggle-btn"
              type="button"
              title={isDark ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
              onClick={() => onChangeTheme(isDark ? 'light' : 'dark')}
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
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
            <div className="preview-tabs">
              {(['cargas', 'feedback', 'comentarios'] as PreviewTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`preview-tab${previewTab === tab ? ' preview-tab--active' : ''}`}
                  onClick={() => setPreviewTab(tab)}
                >
                  {tab === 'cargas' ? 'Cargas' : tab === 'feedback' ? 'Feedback' : 'Comentários'}
                </button>
              ))}
            </div>
            <div className="sheet-preview-scroller">
              {previewTab === 'cargas' && (
                <WorkbookSheet cellValues={workbookCellValues} layout={workbookLayout} />
              )}
              {previewTab === 'feedback' && (
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
              )}
              {previewTab === 'comentarios' && (
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
              )}
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
