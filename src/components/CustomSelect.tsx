import { useState, useRef, useEffect } from 'react';

type Option = { value: string; label: string };

type CustomSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
};

function CustomSelect({ value, onChange, options, placeholder = 'Selecione', className }: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? '';

  return (
    <div ref={ref} className={`custom-select${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className="custom-select__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="custom-select__value">{selectedLabel || placeholder}</span>
        <svg className={`custom-select__arrow${open ? ' custom-select__arrow--open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M7 10l5 5 5-5z" />
        </svg>
      </button>
      {open && (
        <ul className="custom-select__list" role="listbox">
          {options.map((opt) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              className={`custom-select__option${opt.value === value ? ' custom-select__option--active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default CustomSelect;
