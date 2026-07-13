export function Modal({ title, onClose, children }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>{children}
      </div>
    </div>
  );
}
export function Field({ label, children }) {
  return <div className="field"><label>{label}</label>{children}</div>;
}
export function ErrText({ children }) {
  return children ? <div className="error-text" style={{ marginBottom: 10 }}>{children}</div> : null;
}
export const apiError = (e, f = 'حدث خطأ.') => (e && e.data && e.data.error ? e.data.error : f);
