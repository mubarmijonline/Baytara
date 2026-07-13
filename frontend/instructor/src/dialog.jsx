import { useEffect, useState } from 'react';

let resolver = null;
let listeners = [];
function open(req) {
  return new Promise((res) => { resolver = res; listeners.forEach((l) => l(req)); });
}
export function confirmDialog(message) { return open({ type: 'confirm', message }); }
export function promptDialog(message, def = '') { return open({ type: 'prompt', message, def }); }

export function DialogHost() {
  const [req, setReq] = useState(null);
  const [val, setVal] = useState('');
  useEffect(() => {
    const fn = (r) => { setReq(r); setVal(r.def || ''); };
    listeners.push(fn);
    return () => { listeners = listeners.filter((l) => l !== fn); };
  }, []);
  if (!req) return null;
  const done = (result) => { setReq(null); if (resolver) { resolver(result); resolver = null; } };
  const cancel = () => done(req.type === 'prompt' ? null : false);
  return (
    <div className="modal-bg" onClick={cancel} style={{ zIndex: 10000 }}>
      <div className="modal" style={{ width: 400 }} onClick={(e) => e.stopPropagation()}>
        <p style={{ fontWeight: 700, marginBottom: 16, fontSize: 15 }}>{req.message}</p>
        {req.type === 'prompt' && (
          <input autoFocus value={val} onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && done(val)}
            style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 16, font: 'inherit' }} />
        )}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-text" onClick={cancel}>إلغاء</button>
          <button className="btn btn-filled" onClick={() => done(req.type === 'prompt' ? val : true)}>تأكيد</button>
        </div>
      </div>
    </div>
  );
}
