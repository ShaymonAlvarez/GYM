import { useEffect, useRef } from 'react';

type Option = { value: string; label: string };

type ScrollPickerProps = {
  title?: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  onClose: () => void;
};

function ScrollPicker({ title = 'Selecione', value, options, onChange, onClose }: ScrollPickerProps) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Center the current selection when the picker opens
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'center' });
  }, []);

  return (
    <div className="picker-overlay" onClick={onClose}>
      <div
        className="picker-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="picker-sheet__header">
          <span className="picker-sheet__title">{title}</span>
          <button type="button" className="picker-sheet__close" onClick={onClose} aria-label="Fechar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="picker-sheet__list">
          {options.map((opt) => {
            const isActive = opt.value === value;
            return (
              <button
                key={opt.value}
                ref={isActive ? selectedRef : undefined}
                type="button"
                className={`picker-option${isActive ? ' picker-option--active' : ''}`}
                onClick={() => {
                  onChange(opt.value);
                  onClose();
                }}
              >
                <span>{opt.label}</span>
                {isActive && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default ScrollPicker;
