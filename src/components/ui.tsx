import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Info, Star, X, XCircle } from 'lucide-react';
import type { Diet } from '../domain/types';
import { DIET_LABEL } from '../domain/constants';
import { useApp } from '../store';

/* ---------- Modal (native dialog: focus trap + Esc for free) ---------- */
export function Modal({
  open, onClose, title, children, footer, size, labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'small' | 'wide';
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const idRef = useRef(labelledBy ?? `dlg-${Math.random().toString(36).slice(2, 8)}`);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    } else if (!open && d.open) d.close();
  }, [open]);
  if (!open) return null;
  return (
    <dialog
      ref={ref}
      className={`modal ${size ?? ''}`}
      aria-labelledby={idRef.current}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-inner">
        <div className="modal-head">
          <h2 id={idRef.current}>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </dialog>
  );
}

/* ---------- Confirm (promise based) ---------- */
interface ConfirmOpts {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  cancelLabel?: string;
}
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        title={state?.title}
        size="small"
        footer={
          <>
            <button className="btn" onClick={() => close(false)}>
              {state?.cancelLabel ?? 'Cancel'}
            </button>
            <button className={`btn ${state?.danger ? 'danger solid' : 'primary'}`} onClick={() => close(true)} autoFocus>
              {state?.confirmLabel ?? 'Confirm'}
            </button>
          </>
        }
      >
        {typeof state?.message === 'string' ? <p className="muted">{state.message}</p> : state?.message}
      </Modal>
    </ConfirmCtx.Provider>
  );
}

/* ---------- Layout helpers ---------- */
export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="stack sm">
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {actions && <div className="btn-group">{actions}</div>}
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <h3>{title}</h3>
      {children && <p className="small">{children}</p>}
      {action}
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`field ${className ?? ''}`}>
      <span>
        {label} {hint && <span className="hint">— {hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function Alert({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'danger'; children: ReactNode }) {
  const Icon = kind === 'info' ? Info : kind === 'warn' ? AlertTriangle : XCircle;
  return (
    <div className={`alert ${kind}`} role={kind === 'danger' ? 'alert' : undefined}>
      <Icon aria-hidden />
      <div className="grow">{children}</div>
    </div>
  );
}

export function DietDot({ diet, label }: { diet: Diet; label?: boolean }) {
  return (
    <span className="row gap" style={{ gap: 5 }} title={DIET_LABEL[diet]}>
      <span className={`diet-dot ${diet}`} aria-hidden />
      {label ? <span className="small">{DIET_LABEL[diet]}</span> : <span className="sr-only">{DIET_LABEL[diet]}</span>}
    </span>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs, label }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode }[]; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.value} role="tab" type="button" aria-selected={value === t.value} onClick={() => onChange(t.value)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Stars({ value, onChange, label = 'Rating' }: { value?: number; onChange?: (n: number) => void; label?: string }) {
  return (
    <div className="stars" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={(value ?? 0) >= n ? 'on' : ''}
          onClick={() => onChange?.(value === n ? 0 : n)}
          disabled={!onChange}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          aria-pressed={(value ?? 0) >= n}
        >
          <Star fill={(value ?? 0) >= n ? 'currentColor' : 'none'} />
        </button>
      ))}
    </div>
  );
}

export function Progress({ pct, level }: { pct: number; level?: 'ok' | 'warn' | 'over' | 'none' }) {
  return (
    <div className={`progress ${level === 'warn' ? 'warn' : level === 'over' ? 'over' : ''}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

export function Toasts() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="toasts" aria-live="polite" role="status">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <span className="grow">{t.message}</span>
          {t.action && (
            <button
              onClick={() => {
                t.action!.run();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Number input that allows empty while typing. */
export function NumberInput({
  value, onChange, min, step = 'any', placeholder, ariaLabel, allowEmpty,
}: {
  value: number | undefined | null;
  onChange: (n: number | undefined) => void;
  min?: number;
  step?: number | 'any';
  placeholder?: string;
  ariaLabel?: string;
  allowEmpty?: boolean;
}) {
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => {
    const cur = text === '' ? undefined : Number(text);
    if (cur !== (value ?? undefined)) setText(value == null ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      type="number"
      inputMode="decimal"
      value={text}
      min={min}
      step={step}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => {
        setText(e.target.value);
        if (e.target.value === '') {
          if (allowEmpty !== false) onChange(undefined);
        } else {
          const n = Number(e.target.value);
          if (isFinite(n)) onChange(n);
        }
      }}
    />
  );
}
