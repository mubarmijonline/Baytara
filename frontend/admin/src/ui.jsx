import { cloneElement, isValidElement, useId } from 'react';

export function Modal({ title, onClose, children }) {
  const titleId = useId();
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal modal-xl" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <h3 id={titleId}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }) {
  const fieldId = useId();
  const controlId = isValidElement(children) ? children.props.id || fieldId : fieldId;
  const control = isValidElement(children) ? cloneElement(children, { id: controlId }) : children;
  return (
    <div className="field">
      <label htmlFor={controlId}>{label}</label>
      {control}
      {hint && <small className="field-hint">{hint}</small>}
    </div>
  );
}

export function ErrText({ children }) {
  return children ? <div className="error-text" style={{ marginBottom: 10 }}>{children}</div> : null;
}

export function apiError(e, fallback = 'حدث خطأ.') {
  return e && e.data && e.data.error ? e.data.error : fallback;
}

/** The catalogue validator answers with a list of reasons; showing only the envelope
 *  ("catalog_validation_failed") told an admin nothing about which field to fix. */
export function catalogErrorText(e, t) {
  const code = e?.data?.error;
  const reasons = Array.isArray(e?.data?.errors) ? e.data.errors : [];
  // t() hands back the key when there is no copy for it, and a key on screen tells an
  // admin nothing. Fall back to the bare code, which at least names the rule.
  const describe = (reason) => {
    const text = t(`catalog.error.${reason}`);
    return text === `catalog.error.${reason}` ? reason : text;
  };
  if (reasons.length) return reasons.map(describe).join(' · ');
  if (!code) return e?.message || t('errors.generic');
  return describe(code);
}
