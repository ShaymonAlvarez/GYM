import type { LocalMediaAsset } from '../types';

type MediaScreenProps = {
  activeMedia: LocalMediaAsset[];
  onAddMedia: (files: FileList | null) => void;
  onRemoveMedia: (assetId: string) => void;
  formatBytes: (bytes?: number) => string;
};

function MediaScreen({ activeMedia, onAddMedia, onRemoveMedia, formatBytes }: MediaScreenProps) {
  return (
    <div className="screen" key="media">
      <div>
        <p className="section-label">Mídia local</p>
        <div className="section-title">
          <h2>Fotos e vídeos do treino</h2>
        </div>
      </div>

      <label className="upload-box">
        <input
          accept="image/*,video/*"
          multiple
          type="file"
          onChange={(event) => {
            onAddMedia(event.target.files);
            event.currentTarget.value = '';
          }}
        />
        <span>+ Adicionar foto ou vídeo</span>
      </label>

      {activeMedia.length > 0 ? (
        <div className="media-grid">
          {activeMedia.map((asset) => (
            <article key={asset.id} className="media-card">
              {asset.type === 'video' ? (
                <video controls src={asset.dataUrl} />
              ) : (
                <img alt={asset.name} src={asset.remoteUrl ?? asset.dataUrl} />
              )}
              <div className="media-card__info">
                <strong>{asset.name}</strong>
                {asset.type === 'photo' && asset.optimizedBytes ? (
                  <small>
                    {formatBytes(asset.originalBytes)} → {formatBytes(asset.optimizedBytes)}
                  </small>
                ) : null}
                <button
                  className="btn btn--danger btn--sm"
                  type="button"
                  onClick={() => onRemoveMedia(asset.id)}
                >
                  Remover
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: '32px 16px' }}>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
            Nenhuma mídia adicionada para este treino.
          </p>
        </div>
      )}
    </div>
  );
}

export default MediaScreen;
