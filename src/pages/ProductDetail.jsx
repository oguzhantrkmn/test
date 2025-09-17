// src/pages/ProductDetail.jsx
import React, { useEffect, useState } from "react";
import { fetchProducts } from "../api/product";

/* basit para formatlayıcı */
const nf = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });

/* küçük toast helper'ı (Home'dakinin hafif versiyonu) */
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const push = (t) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((x) => [...x, { id, ...t }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 2500);
  };
  const close = (id) => setToasts((x) => x.filter((y) => y.id !== id));
  return { toasts, push, close };
}
function Toasts({ items, onClose }) {
  return (
    <div className="toast-wrap">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.type || "success"}`} onClick={() => onClose(t.id)}>
          <div className="t-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <div className="t-content">
            <strong className="t-title">{t.title}</strong>
            {t.message && <div className="t-msg">{t.message}</div>}
          </div>
          <div className="t-bar" />
        </div>
      ))}
    </div>
  );
}

export default function ProductDetail() {
  const { toasts, push, close } = useToasts();

  const id = decodeURIComponent(window.location.pathname.split("/product/")[1] || "");
  const [p, setP] = useState(null);
  const [qty, setQty] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState("");
  const [imgIndex, setImgIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const list = await fetchProducts();
      if (!alive) return;
      const prod = list.find((x) => String(x.id) === String(id));
      setP(prod);
      setImgIndex(0);
      setLoading(false);
      try { window.dispatchEvent(new Event('route-ready')); } catch(e) {}
    })();
    return () => (alive = false);
  }, [id]);

  const absSrc = (src) => {
    if (!src) return "";
    if (/^https?:\/\//.test(src) || src.startsWith("/") || src.startsWith("data:")) return src;
    return `/products/${src}`;
  };

  const addToCart = () => {
    const old = JSON.parse(localStorage.getItem("cart") || "[]");
    const ex = old.find((x) => x.id === p.id && x.variant === (selectedVariant||""));
    const price = selectedVariant ? (p.variants?.find(v=>v.label===selectedVariant)?.price || p.price) : p.price;
    const itemLabel = selectedVariant ? `${p.name} (${selectedVariant})` : p.name;
    const stock = selectedVariant ? Number(p.variants?.find(v=>v.label===selectedVariant)?.stock || 0) : Number(p.stock ?? 0);
    const maxPerUser = Number(p.maxPerUser || 0);
    const currentQty = ex ? ex.qty : 0;
    if (maxPerUser > 0 && currentQty + qty > maxPerUser) {
      push({ title: "Limit", message: `Max alış sayısı ${maxPerUser}'dır`, type: "error" });
      return;
    }
    if (stock > 0 && currentQty + qty > stock) {
      push({ title: "Stok Yetersiz", message: `En fazla ${stock} adet ekleyebilirsiniz.`, type: "error" });
      return;
    }
    if (ex) ex.qty += qty; else old.push({ id: p.id, name: itemLabel, price, qty, category: p.category, variant: selectedVariant || "", image: p.image || "" });
    // Büyük verileri saklamadan güvenli yazım
    let next = old;
    try {
      // Kullanıcıya özel sepet kaydetme
      const authedEmail = localStorage.getItem("authedEmail") || sessionStorage.getItem("authedEmail");
      const userCarts = JSON.parse(localStorage.getItem("userCarts") || "{}");
      userCarts[authedEmail] = next;
      localStorage.setItem("userCarts", JSON.stringify(userCarts));
    } catch (e) {
      try {
        next = next.map((it) => ({ id: it.id, name: it.name, price: it.price, qty: it.qty, category: it.category, variant: it.variant || "", image: it.image || "" }));
        const authedEmail = localStorage.getItem("authedEmail") || sessionStorage.getItem("authedEmail");
        const userCarts = JSON.parse(localStorage.getItem("userCarts") || "{}");
        userCarts[authedEmail] = next;
        localStorage.setItem("userCarts", JSON.stringify(userCarts));
        push({ title: "Bilgi", message: "Tarayıcı hafızası optimize edildi.", type: "info" });
      } catch (_) {
        // yoksay
      }
    }
    window.dispatchEvent(new Event("cart-changed"));
    window.dispatchEvent(new Event("cart-updated"));
    push({ title: "Sepete eklendi", message: `${p.name} x${qty}` });
  };

  // Yalnızca global loader kullanılacak (App.jsx RouteGate).
  // Bu sayfa kendi spinnerını göstermeyecek.
  if (loading) return <div className="page-wrapper" />;

  if (!p)
    return (
      <div className="page-wrapper">
        <div className="home-card">Ürün bulunamadı.</div>
      </div>
    );

  return (
    <div className="ecommerce-layout">
      {/* Header Navigation */}
      <header className="main-header">
        <div className="header-content">
          <div className="logo-section">
            <h1 className="site-logo">YKKshop</h1>
            <span className="welcome-text">Ürün Detayı</span>
          </div>
          
          <div className="header-search">
            <div className="breadcrumb">
              <button className="breadcrumb-link" onClick={() => window.location.assign("/home")}>Ana Sayfa</button>
              <span className="breadcrumb-separator">/</span>
              <button className="breadcrumb-link" onClick={() => window.location.assign("/home")}>Ürünler</button>
              <span className="breadcrumb-separator">/</span>
              <span className="breadcrumb-current">{p?.name}</span>
            </div>
          </div>
          
          <div className="header-actions">
            <button className="btn-ghost" onClick={() => window.location.assign("/cart")}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17"/>
                <circle cx="17" cy="20" r="1"/>
                <circle cx="9" cy="20" r="1"/>
              </svg>
              Sepete Git
            </button>
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="product-detail-container">

        <div className="product-detail-layout">
          {/* Product Images */}
          <div className="product-gallery">
            <div className="main-image">
              {(() => {
                const arr = Array.isArray(p.images) && p.images.length>0 ? p.images : (p.image ? [p.image] : []);
                const current = absSrc(arr[imgIndex] || arr[0] || "");
                return current ? (
                  <img src={current} alt={p.name} loading="lazy" onError={(e)=> (e.currentTarget.style.display='none')} />
                ) : null;
              })()}
            </div>
            {Array.isArray(p.images) && p.images.length>1 && (
              <div style={{ display:'flex', gap:8, marginTop:8, flexWrap:'wrap' }}>
                {p.images.map((src,i)=> (
                  <img key={i} src={absSrc(src)} alt={`thumb-${i}`} onClick={()=>setImgIndex(i)}
                       style={{ width:64, height:64, objectFit:'cover', borderRadius:8, border: i===imgIndex? '2px solid var(--accent)' : '1px solid var(--border)', cursor:'pointer' }} />
                ))}
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className="product-info-detail">
            <div className="product-category-badge">{p.category}</div>
            <h1 className="product-title-detail">{p.name}</h1>
            {Array.isArray(p.variants) && p.variants.length>0 && (
              <div className="form" style={{ maxWidth: 320 }}>
                <label className="label">{p.variantName || "Varyant"}</label>
                <select className="input" value={selectedVariant} onChange={(e)=>setSelectedVariant(e.target.value)}>
                  <option value="">Seçin…</option>
                  {p.variants.map((v,i)=> <option key={i} value={v.label} disabled={v.stock<=0}>{v.label} {v.stock<=0?"(stok yok)":""} — {nf.format(v.price)}</option>)}
                </select>
              </div>
            )}
            
            <div className="price-section-detail">
              <span className="current-price">{nf.format(selectedVariant ? (p.variants?.find(v=>v.label===selectedVariant)?.price || p.price) : p.price)}</span>
              <span className="price-note">KDV Dahil</span>
            </div>

            {p.description && (
              <div className="product-description-detail">
                <h3>Ürün Açıklaması</h3>
                <p>{p.description}</p>
              </div>
            )}

            {Array.isArray(p.specs) && p.specs.length > 0 && (
              <div className="product-specs-detail">
                <h3>Teknik Özellikler</h3>
                <div className="specs-grid-detail">
                  {p.specs.map((s, i) => (
                    <div key={i} className="spec-item">
                      <span className="spec-label">{s.label}</span>
                      <span className="spec-value">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="purchase-section">
              <div className="quantity-section">
                <label className="quantity-label">Adet</label>
                <div className="quantity-selector">
                  <button 
                    className="qty-btn-detail" 
                    onClick={() => setQty(Math.max(1, qty - 1))}
                    disabled={qty <= 1}
                  >
                    -
                  </button>
                  <span className="qty-display-detail">{qty}</span>
                  <button 
                    className="qty-btn-detail" 
                    onClick={() => setQty(qty + 1)}
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="purchase-actions">
                <button className="add-to-cart-detail" onClick={addToCart}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17"/>
                  </svg>
                  <span>Sepete Ekle</span>
                  <span className="btn-price">({nf.format(p.price * qty)})</span>
                </button>
                
                
              </div>
              
              <div className="product-features">
                <div className="feature-item">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  <span>Ücretsiz Kargo</span>
                </div>
                <div className="feature-item">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                  </svg>
                  <span>30 Gün İade Garantisi</span>
                </div>
                <div className="feature-item">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                  </svg>
                  <span>Güvenli Ödeme</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        </div>
        </main>
        
        <Toasts items={toasts} onClose={close} />
      </div>
  );
}
