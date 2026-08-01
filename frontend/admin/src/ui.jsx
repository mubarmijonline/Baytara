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

export function Field({ label, children }) {
  const fieldId = useId();
  const controlId = isValidElement(children) ? children.props.id || fieldId : fieldId;
  const control = isValidElement(children) ? cloneElement(children, { id: controlId }) : children;
  return (
    <div className="field">
      <label htmlFor={controlId}>{label}</label>
      {control}
    </div>
  );
}

export function ErrText({ children }) {
  return children ? <div className="error-text" style={{ marginBottom: 10 }}>{children}</div> : null;
}

export function apiError(e, fallback = 'حدث خطأ.') {
  return e && e.data && e.data.error ? e.data.error : fallback;
}
