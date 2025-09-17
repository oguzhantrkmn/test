import React from "react";
import { createRoot } from "react-dom/client";

function Modal({ open, title, message, confirmText, cancelText, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="modal" onClick={onCancel}>
      <div className="modal-card" onClick={(e)=>e.stopPropagation()}>
        {title && <h3>{title}</h3>}
        {message && <p>{message}</p>}
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          {cancelText && <button className="btn-ghost" onClick={onCancel}>{cancelText}</button>}
          <button className="btn-primary" onClick={onConfirm}><span className="btn-label">{confirmText || 'Tamam'}</span></button>
        </div>
      </div>
    </div>
  );
}

function renderModal(props) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const cleanup = () => { try { root.unmount(); } catch(_) {} try { document.body.removeChild(host); } catch(_) {} };
  root.render(<Modal {...props} />);
  return cleanup;
}

export function confirmDialog({ title = 'Onay', message = '', confirmText = 'Evet', cancelText = 'İptal' } = {}) {
  return new Promise((resolve) => {
    const onConfirm = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    const cleanup = renderModal({ open: true, title, message, confirmText, cancelText, onConfirm, onCancel });
  });
}

export function alertDialog({ title = 'Bilgi', message = '', okText = 'Tamam' } = {}) {
  return new Promise((resolve) => {
    const onConfirm = () => { cleanup(); resolve(); };
    const cleanup = renderModal({ open: true, title, message, confirmText: okText, cancelText: '', onConfirm, onCancel: onConfirm });
  });
}

// Özel: Kargo firması ve takip numarası isteyen form
export function shippingDialog({ title = 'Kargo Bilgileri', carrier = '', trackingNumber = '' } = {}) {
  return new Promise((resolve) => {
    function ShippingModal({ open }) {
      const [car, setCar] = React.useState(carrier);
      const [tn, setTn] = React.useState(trackingNumber);
      if (!open) return null;
      return (
        <div className="modal" onClick={() => { cleanup(); resolve(null); }}>
          <div className="modal-card" onClick={(e)=>e.stopPropagation()}>
            <h3>{title}</h3>
            <div className="form" style={{ gap: 8 }}>
              <label className="label">Kargo firması</label>
              <input className="input" placeholder="Yurtiçi, Aras, MNG..." value={car} onChange={(e)=>setCar(e.target.value)} />
              <label className="label">Takip No</label>
              <input className="input" placeholder="TRXXXXXXXX" value={tn} onChange={(e)=>setTn(e.target.value)} />
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:10 }}>
              <button className="btn-ghost" onClick={() => { cleanup(); resolve(null); }}>İptal</button>
              <button className="btn-primary" onClick={() => { const out = { carrier:car.trim(), trackingNumber: tn.trim() }; cleanup(); resolve(out); }}>
                <span className="btn-label">Kaydet</span>
              </button>
            </div>
          </div>
        </div>
      );
    }
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const cleanup = () => { try { root.unmount(); } catch(_) {} try { document.body.removeChild(host); } catch(_) {} };
    root.render(<ShippingModal open={true} />);
  });
}


