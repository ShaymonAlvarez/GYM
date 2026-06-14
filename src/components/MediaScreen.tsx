import { useState } from 'react';
import type { AppState, LocalMediaAsset } from '../types';
import CustomSelect from './CustomSelect';

type MediaScreenProps = {
  appState: AppState;
  activeWorkout: AppState['templates'][number];
  activeMedia: LocalMediaAsset[];
  onAddMedia: (files: FileList | null) => void;
  onRemoveMedia: (assetId: string) => void;
  onWeekChange: (index: number) => void;
  onWorkoutChange: (workoutId: string) => void;
  formatBytes: (bytes?: number) => string;
};

async function fetchAssetBlob(asset: LocalMediaAsset): Promise<File | null> {
  const url = asset.type === 'video' ? asset.dataUrl : (asset.remoteUrl ?? asset.dataUrl);
  if (!url) return null;
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const mime = blob.type || asset.mimeType || (asset.type === 'photo' ? 'image/jpeg' : 'video/mp4');
    const ext = mime.split('/')[1]?.split(';')[0] ?? (asset.type === 'photo' ? 'jpg' : 'mp4');
    return new File([blob], `${asset.name || asset.id}.${ext}`, { type: mime });
  } catch {
    return null;
  }
}

async function shareAssets(assets: LocalMediaAsset[], onBusy: (v: boolean) => void): Promise<void> {
  if (!assets.length) return;

  if (!navigator.share) {
    const first = assets[0];
    const url = first.remoteUrl ?? first.dataUrl;
    if (url) window.open(url, '_blank');
    return;
  }

  onBusy(true);
  try {
    const files = (await Promise.all(assets.map(fetchAssetBlob))).filter(Boolean) as File[];

    if (files.length > 0 && navigator.canShare?.({ files })) {
      await navigator.share({ files, title: 'Fotos do treino' });
    } else if (assets[0].remoteUrl ?? assets[0].dataUrl) {
      const url = assets[0].remoteUrl ?? assets[0].dataUrl!;
      await navigator.share({ url, title: assets[0].name });
    }
  } catch {
    // User cancelled — ignore
  } finally {
    onBusy(false);
  }
}

function MediaScreen({
  appState,
  activeWorkout,
  activeMedia,
  onAddMedia,
  onRemoveMedia,
  onWeekChange,
  onWorkoutChange,
  formatBytes
}: MediaScreenProps) {
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState(false);

  const lightboxAsset = lightboxId ? activeMedia.find((a) => a.id === lightboxId) ?? null : null;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleShare = (assets: LocalMediaAsset[]) => {
    void shareAssets(assets, setSharing);
  };

  return (
    <div className="screen" key="media">

      {/* Lightbox */}
      {lightboxAsset && (
        <div
          className="media-lightbox"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxId(null)}
        >
          <div className="media-lightbox__content" onClick={(e) => e.stopPropagation()}>
            <button className="media-lightbox__close" type="button" onClick={() => setLightboxId(null)}>
              ✕
            </button>
            {lightboxAsset.type === 'video' ? (
              <video
                controls
                autoPlay
                src={lightboxAsset.dataUrl}
                className="media-lightbox__media"
              />
            ) : (
              <img
                src={lightboxAsset.remoteUrl ?? lightboxAsset.dataUrl}
                alt={lightboxAsset.name}
                className="media-lightbox__media"
              />
            )}
            <div className="media-lightbox__footer">
              <span className="media-lightbox__name">{lightboxAsset.name}</span>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                disabled={sharing}
                onClick={() => handleShare([lightboxAsset])}
              >
                {sharing ? '…' : 'Compartilhar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div>
        <p className="section-label">Mídia local</p>
        <div className="section-title">
          <h2>Fotos e vídeos do treino</h2>
        </div>
      </div>

      <div className="workout-selectors">
        <CustomSelect
          value={String(appState.activeWeekIndex)}
          onChange={(val) => onWeekChange(Number(val))}
          options={appState.weeks.map((week) => ({
            value: String(week.index),
            label: week.label
          }))}
        />
        <div className="workout-letter-strip">
          {appState.templates.map((workout) => (
            <button
              key={workout.id}
              className={`workout-letter-btn${workout.id === activeWorkout.id ? ' workout-letter-btn--active' : ''}`}
              style={{ ['--wa' as string]: workout.accent }}
              type="button"
              title={workout.subtitle}
              onClick={() => onWorkoutChange(workout.id)}
            >
              {workout.name.replace('Treino ', '')}
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="media-toolbar">
        <label className="btn btn--secondary btn--sm media-toolbar__add" style={{ cursor: 'pointer' }}>
          + Adicionar
          <input
            accept="image/*,video/*"
            multiple
            type="file"
            style={{ display: 'none' }}
            onChange={(e) => {
              onAddMedia(e.target.files);
              e.currentTarget.value = '';
            }}
          />
        </label>

        {activeMedia.length > 0 && (
          selectionMode ? (
            <div className="media-toolbar__selection">
              <button type="button" className="btn btn--ghost btn--sm" onClick={exitSelectionMode}>
                Cancelar
              </button>
              {selectedIds.size > 0 && (
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  disabled={sharing}
                  onClick={() => handleShare(activeMedia.filter((a) => selectedIds.has(a.id)))}
                >
                  {sharing ? '…' : `Compartilhar (${selectedIds.size})`}
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setSelectionMode(true)}
            >
              Selecionar
            </button>
          )
        )}
      </div>

      {activeMedia.length > 0 ? (
        <div className="media-grid">
          {activeMedia.map((asset) => {
            const isSelected = selectedIds.has(asset.id);
            return (
              <article
                key={asset.id}
                className={`media-card${isSelected ? ' media-card--selected' : ''}`}
              >
                {/* Thumbnail area — click to lightbox or select */}
                <div
                  className="media-card__thumb"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (selectionMode) { toggleSelect(asset.id); return; }
                    setLightboxId(asset.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      if (selectionMode) { toggleSelect(asset.id); return; }
                      setLightboxId(asset.id);
                    }
                  }}
                >
                  {selectionMode && (
                    <div className="media-card__selection-overlay">
                      <span className={`media-card__check${isSelected ? ' media-card__check--on' : ''}`}>
                        {isSelected ? '✓' : ''}
                      </span>
                    </div>
                  )}
                  {asset.type === 'video' ? (
                    <video src={asset.dataUrl} />
                  ) : (
                    <img alt={asset.name} src={asset.remoteUrl ?? asset.dataUrl} />
                  )}
                </div>

                <div className="media-card__info">
                  <strong>{asset.name}</strong>
                  {asset.type === 'photo' && asset.optimizedBytes ? (
                    <small>
                      {formatBytes(asset.originalBytes)} → {formatBytes(asset.optimizedBytes)}
                    </small>
                  ) : null}
                  <div className="media-card__actions">
                    {!selectionMode && (
                      <button
                        className="btn btn--ghost btn--sm"
                        type="button"
                        disabled={sharing}
                        onClick={() => handleShare([asset])}
                      >
                        {sharing ? '…' : 'Compartilhar'}
                      </button>
                    )}
                    <button
                      className="btn btn--danger btn--sm"
                      type="button"
                      onClick={() => onRemoveMedia(asset.id)}
                    >
                      Remover
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: '32px 16px' }}>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
            Nenhuma mídia adicionada para esta semana/treino.
          </p>
        </div>
      )}
    </div>
  );
}

export default MediaScreen;
