import { useEffect, useState } from 'react';

let listeners = [];
let seq = 0;
function emit(type, msg) {
  const t = { id: ++seq, type, msg: String(msg) };
  listeners.forEach((l) => l(t));
}
export const toast = {
  success: (m) => emit('success', m),
  error: (m) => emit('error', m),
  info: (m) => emit('info', m),
};

export function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const fn = (t) => {
      setItems((x) => [...x, t]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== t.id)), 4200);
    };
    listeners.push(fn);
    return () => { listeners = listeners.filter((l) => l !== fn); };
  }, []);
  return (
    <div className="toaster">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`} onClick={() => setItems((x) => x.filter((i) => i.id !== t.id))}>
          <span className="toast-icon">{t.type === 'success' ? '✓' : t.type === 'error' ? '!' : 'i'}</span>
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}
