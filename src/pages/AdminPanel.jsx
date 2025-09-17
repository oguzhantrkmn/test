// src/pages/AdminPanel.jsx
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { fetchProducts, fetchAllRaw, saveProduct, deleteProduct, fetchOrders, fetchUsers, updateOrderStatus, setOrderShippingInfo } from "../api/product";
import { confirmDialog } from "../components/Dialog";
import { shippingDialog } from "../components/Dialog";

/* Basit toast (Home’daki ile uyumlu konteyner sınıfı) */
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const push = (t) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((x) => [...x, { id, ...t }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 2600);
  };
  const close = (id) => setToasts((x) => x.filter((y) => y.id !== id));
  return { toasts, push, close };
}
function Toasts({ items, onClose }) {
  return (
    <div className="toast-container">
      {items.map((t) => (
        <div
          key={t.id}
          className={`toast ${t.type || "success"}`}
          onClick={() => onClose(t.id)}
        >
          {t.title}
          {t.message ? ` — ${t.message}` : ""}
        </div>
      ))}
    </div>
  );
}

export default function AdminPanel() {
  // yetki
  useEffect(() => {
    if (localStorage.getItem("adminAuthed") !== "1") {
      window.location.assign("/admin");
    }
  }, []);

  const { toasts, push, close } = useToasts();

  // kategoriler
  const [categories, setCategories] = useState(() => {
    const x = localStorage.getItem("categories");
    return x
      ? JSON.parse(x)
      : ["Kulaklık", "Klavye", "Mouse", "Hoparlör", "Aksesuar", "Kablo"];
  });
  useEffect(() => {
    localStorage.setItem("categories", JSON.stringify(categories));
    try { window.dispatchEvent(new Event('categories-updated')); } catch(e) {}
  }, [categories]);

  // markalar
  const [brands, setBrands] = useState(() => {
    const x = localStorage.getItem("brands");
    return x ? JSON.parse(x) : ["Logitech", "Corsair", "Aurora", "Razer", "SteelSeries", "HyperX"];
  });
  useEffect(() => {
    localStorage.setItem("brands", JSON.stringify(brands));
    try { window.dispatchEvent(new Event('brands-updated')); } catch(e) {}
  }, [brands]);

  // ürünler
  const [list, setList] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // all | active | passive
  const reload = async () => setList(await fetchAllRaw());
  useEffect(() => {
    reload();
  }, []);

  // ürün formu
  const empty = {
    id: "",
    name: "",
    price: "",
    image: "", // geriye dönük uyumluluk için korunur (ilk görsel)
    images: [],  // yeni çoklu görseller
    category: categories[0] || "",
    description: "",
    active: true,
    specs: [],
    stock: 10,
    maxPerUser: 0,
    variantName: "",
    variants: [], // [{label, price, stock}]
  };
  const [form, setForm] = useState(empty);
  const editing = !!form.id;

  // siparişler/kullanıcılar
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const reloadOrdersUsers = async () => {
    const [o, u] = await Promise.all([fetchOrders(), fetchUsers()]);
    setOrders(o);
    setUsers(u);
  };
  useEffect(() => {
    reloadOrdersUsers();
  }, []);

  const [tab, setTab] = useState("products"); // products | orders | users | settings
  const [showLogout, setShowLogout] = useState(false);

  // site ayarları (KDV / kargo)
  const [siteSettings, setSiteSettings] = useState(() => {
    try { return JSON.parse(localStorage.getItem("siteSettings") || "{}"); } catch(e){ return {}; }
  });
  useEffect(() => { localStorage.setItem("siteSettings", JSON.stringify(siteSettings)); }, [siteSettings]);

  // kuponlar
  const [coupons, setCoupons] = useState(() => {
    try { return JSON.parse(localStorage.getItem("coupons") || "[]"); } catch(e){ return []; }
  });
  const saveCoupons = (next) => { setCoupons(next); localStorage.setItem("coupons", JSON.stringify(next)); };

  // Dinamik filtre grupları (örn. Bağlantı Türü, RGB, Kablosuz vs.)
  const [filterGroups, setFilterGroups] = useState(() => {
    try { return JSON.parse(localStorage.getItem('filterGroups') || '[]'); } catch(e){ return []; }
  });
  const saveFilterGroups = (next) => {
    setFilterGroups(next);
    localStorage.setItem('filterGroups', JSON.stringify(next));
    try { window.dispatchEvent(new Event('filter-groups-updated')); } catch(e) {}
  };

  // Kategori/Marka yeniden adlandırma yardımcıları
  const renameCategory = (oldLabel) => {
    const next = prompt('Yeni kategori adı', oldLabel)?.trim();
    if (!next || next === oldLabel) return;
    const cats = categories.map(c => c === oldLabel ? next : c);
    setCategories(cats);
    const products = JSON.parse(localStorage.getItem('products') || '[]');
    const updated = products.map(p => p.category === oldLabel ? { ...p, category: next } : p);
    localStorage.setItem('products', JSON.stringify(updated));
    reload();
  };
  const renameBrand = (oldLabel) => {
    const next = prompt('Yeni marka adı', oldLabel)?.trim();
    if (!next || next === oldLabel) return;
    const bs = brands.map(b => b === oldLabel ? next : b);
    setBrands(bs);
    const products = JSON.parse(localStorage.getItem('products') || '[]');
    const updated = products.map(p => (p.brand === oldLabel ? { ...p, brand: next } : p));
    localStorage.setItem('products', JSON.stringify(updated));
    reload();
  };

  // Çoklu görsel yükleme (localStorage kota sorunlarını azaltmak için sıkıştırma uygular)
  const onPickImages = async (files) => {
    if (!files || files.length === 0) return;

    const compressImage = (file) => new Promise((resolve) => {
      try {
        const img = new Image();
        const reader = new FileReader();
        reader.onload = () => {
          img.onload = () => {
            const maxSide = 1280; // uzun kenarı 1280px'e düşür
            let { width, height } = img;
            if (width > height && width > maxSide) {
              height = Math.round((height * maxSide) / width);
              width = maxSide;
            } else if (height > maxSide) {
              width = Math.round((width * maxSide) / height);
              height = maxSide;
            }
            const canvas = document.createElement('canvas');
            canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            // jpeg olarak %0.7 kaliteyle kaydet (metadatasız, çok daha küçük)
            const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
            resolve(dataUrl);
          };
          img.onerror = () => resolve(reader.result);
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      } catch {
        // Herhangi bir hata olursa orijinali dön
        const r2 = new FileReader();
        r2.onload = () => resolve(r2.result);
        r2.readAsDataURL(file);
      }
    });

    const arr = [];
    for (const f of files) {
      // 5MB üzeri dosyaları mutlaka sıkıştır
      const compressed = await compressImage(f);
      arr.push(compressed);
    }

    // Toplam tahmini boyutu kontrol et (localStorage sınırları ~5-10MB civarıdır)
    const estimateBytes = (s) => Math.ceil((s.length * 3) / 4); // base64 -> bytes yakınsama
    const nextTotal = (form.images||[]).reduce((a,b)=>a+estimateBytes(b),0) + arr.reduce((a,b)=>a+estimateBytes(b),0);
    const limit = 45 * 1024 * 1024; // ~45MB güvenli sınır (tarayıcıya göre değişir)
    if (nextTotal > limit) {
      push({ title: 'Uyarı', message: 'Görseller çok büyük. Daha küçük görseller yükleyin.', type: 'error' });
    }

    setForm((prev) => {
      const nextImages = [ ...(prev.images||[]), ...arr ];
      return { ...prev, images: nextImages, image: nextImages[0] || prev.image || "" };
    });
  };

  const addSpec = () =>
    setForm((f) => ({
      ...f,
      specs: [...(f.specs || []), { label: "", value: "" }],
    }));
  const setSpec = (i, key, val) =>
    setForm((f) => {
      const specs = [...(f.specs || [])];
      specs[i] = { ...specs[i], [key]: val };
      return { ...f, specs };
    });
  const removeSpec = (i) =>
    setForm((f) => ({ ...f, specs: (f.specs || []).filter((_, idx) => idx !== i) }));

  // Varyant işlemleri
  const addVariantRow = () => setForm((f)=>({ ...f, variants: [ ...(f.variants||[]), { label: "", price: Number(f.price)||0, stock: 0 } ] }));
  const setVariantRow = (i, key, val) => setForm((f)=>{ const vs=[...(f.variants||[])]; vs[i] = { ...vs[i], [key]: key==='price'||key==='stock' ? Number(val)||0 : val }; return { ...f, variants: vs }; });
  const removeVariantRow = (i) => setForm((f)=>({ ...f, variants: (f.variants||[]).filter((_,x)=>x!==i) }));

  const onEdit = (p) => setForm({ ...p });
  const onDelete = async (id) => {
    const ok = await confirmDialog({ title:'Silinsin mi?', message:'Bu ürünü kalıcı olarak sileceksiniz.' });
    if (!ok) return;
    await deleteProduct(id);
    push({ title: "Ürün silindi" });
    setForm(empty);
    reload();
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.name) return;
    // negatif fiyat ve stok doğrulaması
    const priceNum = Number(form.price || 0);
    if (isNaN(priceNum) || priceNum < 0) {
      push({ title: "Hata", message: "Fiyat 0'dan küçük olamaz.", type: "error" });
      return;
    }
    const stockNum = Number(form.stock || 0);
    if (stockNum < 0) {
      push({ title: "Hata", message: "Stok 0'dan küçük olamaz.", type: "error" });
      return;
    }
    await saveProduct({ ...form });
    push({ title: editing ? "Ürün güncellendi" : "Ürün eklendi" });
    setForm(empty);
    reload();
  };

  const doLogout = () => {
    localStorage.removeItem("adminAuthed");
    window.location.assign("/admin");
  };

  const orderStats = useMemo(() => {
    const total = orders.reduce((a, o) => a + (o.total || 0), 0);
    return { count: orders.length, total };
  }, [orders]);

  const STATUSES = [
    "Sipariş Onay Bekliyor",
    "Sipariş Onaylandı",
    "Hazırlanıyor",
    "Kargoda",
    "Tamamlandı",
    "İptal Edildi",
  ];

  const setOrderStatus = async (id, status) => {
    await updateOrderStatus(id, status);
    await reloadOrdersUsers();
  };

  const setShippingAndStatus = async (o) => {
    const current = o.status || "Sipariş Onay Bekliyor";
    const filtered = STATUSES.filter(s => s !== "İptal Edildi");
    const idx = filtered.indexOf(current);
    const next = filtered[Math.min(idx + 1, filtered.length - 1)];

    if (next === "Kargoda") {
      const res = await shippingDialog({ carrier: o.shipping?.carrier || '', trackingNumber: o.shipping?.trackingNumber || '' });
      if (!res) return; // vazgeçti
      await setOrderShippingInfo(o.id, res);
    }
    await setOrderStatus(o.id, next);
  };

  const [userEdit, setUserEdit] = useState(null);
  const [userDelete, setUserDelete] = useState(null);

  return (
    <div className="ecommerce-layout">
      {/* Admin Header Navigation */}
      <header className="main-header">
        <div className="header-content">
          <div className="logo-section">
            <h1 className="site-logo">YKKshop Admin</h1>
            <span className="welcome-text">Yönetim Paneli</span>
          </div>
          
          <div className="header-search">
            <div className="admin-stats">
              <div className="stat-item">
                <span className="stat-number">{list.length}</span>
                <span className="stat-label">Ürün</span>
              </div>
              <div className="stat-item">
                <span className="stat-number">{orderStats.count}</span>
                <span className="stat-label">Sipariş</span>
              </div>
              <div className="stat-item">
                <span className="stat-number">{users.length}</span>
                <span className="stat-label">Kullanıcı</span>
              </div>
            </div>
          </div>
          
          <div className="header-actions">
            <button className="btn-ghost" onClick={()=>setShowLogout(true)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                <polyline points="16,17 21,12 16,7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Çıkış
            </button>
          </div>
        </div>
      </header>

      {/* Admin Navigation */}
      <nav className="main-nav">
        <div className="nav-content">
          <div className="nav-tabs">
            <button className={`nav-tab ${tab === "products" ? "active" : ""}`} onClick={() => setTab("products")}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
              </svg>
              Ürün Yönetimi
            </button>
            <button className={`nav-tab ${tab === "orders" ? "active" : ""}`} onClick={() => setTab("orders")}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
              </svg>
              Siparişler
            </button>
            <button className={`nav-tab ${tab === "users" ? "active" : ""}`} onClick={() => setTab("users")}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"/>
              </svg>
              Kullanıcılar
            </button>
            <button className={`nav-tab ${tab === "settings" ? "active" : ""}`} onClick={() => setTab("settings")}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              Ayarlar
            </button>
          </div>
        </div>
      </nav>

      <main className="main-content">

        {/* ÜRÜNLER */}
        {tab === "products" && (
          <div className="admin-products-layout">
            {/* Form */}
            <div className="admin-form-section">
              <form className="admin-form" onSubmit={onSubmit}>
              <h3 className="form-title">
                {editing ? "Ürün Düzenle" : "Yeni Ürün Ekle"}
              </h3>

              <label className="label">Ad</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />

              <label className="label">Fiyat (₺)</label>
              <input
                className="input"
                type="number"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                required
              />

              <label className="label">İndirim Oranı (%)</label>
              <input
                className="input"
                type="number"
                min="0"
                max="100"
                step="1"
                value={form.discountPercent ?? 0}
                onChange={(e) => setForm({ ...form, discountPercent: Math.max(0, Math.min(100, e.target.valueAsNumber || 0)) })}
              />

              <label className="label">Kategori</label>
              <select
                className="input"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <label className="label">Marka</label>
              <select
                className="input"
                value={form.brand || ''}
                onChange={(e)=>setForm({ ...form, brand: e.target.value })}
              >
                <option value="">Seçiniz</option>
                {brands.map((b)=> (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>

              <label className="label">Stok</label>
              <input
                className="input"
                type="number"
                min="0"
                step="1"
                value={form.stock ?? 0}
                onChange={(e) => setForm({ ...form, stock: Math.max(0, e.target.valueAsNumber || 0) })}
              />

              <label className="label">Max Alış (kullanıcı başına)</label>
              <input
                className="input"
                type="number"
                min="0"
                step="1"
                value={form.maxPerUser ?? 0}
                onChange={(e) => setForm({ ...form, maxPerUser: Math.max(0, e.target.valueAsNumber || 0) })}
              />

              <label className="label">Görseller</label>
              <div className="file-upload-modern" style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <input
                  type="file"
                  id="file-upload-multi"
                  accept="image/*"
                  multiple
                  onChange={(e) => onPickImages(Array.from(e.target.files||[]))}
                  style={{ display: 'none' }}
                />
                <label htmlFor="file-upload-multi" className="file-upload-btn">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                    <polyline points="7,10 12,15 17,10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Görsel(ler) Ekle
                </label>
                {(form.images||[]).length>0 && (
                  <div style={{ display:'flex', gap:8, overflowX:'auto', padding:'6px 2px' }}>
                    {(form.images||[]).map((src, idx)=> (
                      <div
                        key={idx}
                        draggable
                        onDragStart={(e)=>{ e.dataTransfer.setData('text/plain', String(idx)); }}
                        onDragOver={(e)=> e.preventDefault()}
                        onDrop={(e)=>{
                          e.preventDefault();
                          const from = Number(e.dataTransfer.getData('text/plain'));
                          if (Number.isNaN(from) || from===idx) return;
                          setForm(f=>{
                            const arr=[...(f.images||[])];
                            const [it]=arr.splice(from,1);
                            arr.splice(idx,0,it);
                            return { ...f, images: arr, image: arr[0] };
                          });
                        }}
                        title={idx===0? 'Birincil görsel' : 'Taşı (sürükle) / Tıkla: birincil yap'}
                        style={{ position:'relative', flex:'0 0 auto', cursor:'grab' }}
                        onClick={()=>{
                          if (idx===0) return;
                          setForm(f=>{ const arr=[...(f.images||[])]; const [it]=arr.splice(idx,1); arr.unshift(it); return { ...f, images: arr, image: arr[0] }; });
                        }}
                      >
                        <img src={src} alt="preview" style={{ width:72, height:72, objectFit:'cover', borderRadius:10, border:'1px solid var(--border)' }} />
                        {/* Sil butonu */}
                        <button
                          type="button"
                          aria-label="Görseli kaldır"
                          onClick={(e)=>{ e.stopPropagation(); setForm(f=>{ const arr=[...(f.images||[])]; arr.splice(idx,1); return { ...f, images: arr, image: (arr[0]||"") }; }); }}
                          style={{ position:'absolute', left: -6, top: -6, width:20, height:20, borderRadius:999, border:'1px solid var(--border)', background:'#fff', color:'#000', display:'grid', placeItems:'center', boxShadow:'0 2px 8px rgba(0,0,0,.2)' }}
                        >
                          ×
                        </button>
                        {idx===0 && (
                          <span style={{ position:'absolute', right: -4, top: -4, background:'var(--accent)', color:'#fff', borderRadius:8, fontSize:10, padding:'2px 6px', boxShadow:'0 2px 6px rgba(0,0,0,.2)' }}>Ana</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <label className="label">Açıklama</label>
              <textarea
                className="input"
                rows={3}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />

              {/* Dinamik filtre grubuna göre seçenekler */}
              {(filterGroups||[]).map((g, idx)=> (
                <div key={idx}>
                  <label className="label">{g.name}</label>
                  <select className="input" value={(form.filters?.[g.name])||''} onChange={(e)=>{
                    setForm(f=>({ ...f, filters: { ...(f.filters||{}), [g.name]: e.target.value } }));
                  }}>
                    <option value="">Seçiniz</option>
                    {(g.options||[]).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
              ))}

              <div
                className="label"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>Ürün Özellikleri</span>
                <button type="button" className="link" onClick={addSpec}>
                  + özellik ekle
                </button>
              </div>

              {(form.specs || []).map((s, i) => (
                <div key={i} className="row2">
                  <input
                    className="input"
                    placeholder="Etiket (örn: Renk)"
                    value={s.label}
                    onChange={(e) => setSpec(i, "label", e.target.value)}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      className="input"
                      placeholder="Değer (örn: Beyaz)"
                      value={s.value}
                      onChange={(e) => setSpec(i, "value", e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => removeSpec(i)}
                    >
                      Sil
                    </button>
                  </div>
                </div>
              ))}

              <label className="label">Durum</label>
              <select
                className="input"
                value={form.active ? "1" : "0"}
                onChange={(e) =>
                  setForm({ ...form, active: e.target.value === "1" })
                }
              >
                <option value="1">Aktif</option>
                <option value="0">Pasif</option>
              </select>

              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="btn-primary" type="submit">
                  <span className="btn-label">
                    {editing ? "Güncelle" : "Ekle"}
                  </span>
                </button>
                {editing && (
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setForm(empty)}
                  >
                    Temizle
                  </button>
                )}
              </div>
              </form>
            </div>

            {/* Liste */}
            <div className="admin-list-section">
              <h3 className="admin-section-title">Ürün Listesi</h3>
              <div className="row2" style={{ alignItems: 'center', marginBottom: 8 }}>
                <input className="input" placeholder="Ara: ad, açıklama, kategori" value={search} onChange={(e)=>setSearch(e.target.value)} />
                <select className="input" value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value)}>
                  <option value="all">Tümü</option>
                  <option value="active">Aktif</option>
                  <option value="passive">Pasif</option>
                </select>
              </div>
              <div className="adm-table">
                <div className="adm-head">
                  <div>Görsel</div>
                  <div>Ürün</div>
                  <div>Fiyat</div>
                  <div>İndirim</div>
                  <div>Kat.</div>
                  <div>Stok</div>
                  <div>Durum</div>
                  <div>İşlem</div>
                </div>
                {list
                  .filter(p => {
                    const okStatus = statusFilter === 'all' ? true : statusFilter === 'active' ? p.active !== false : p.active === false;
                    const q = search.trim().toLowerCase();
                    const okSearch = !q || [p.name, p.description, p.category].some(v => String(v||"").toLowerCase().includes(q));
                    return okStatus && okSearch;
                  })
                  .map((p) => (
                  <div key={p.id} className="adm-row">
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {(p.image||p.images?.[0]) ? (
                        <img src={p.image || p.images?.[0]} alt="thumb" style={{ width:44, height:44, objectFit:'cover', borderRadius:8, border:'1px solid var(--border)' }} />
                      ) : (
                        <div style={{ width:44, height:44, borderRadius:8, border:'1px dashed var(--border)', display:'grid', placeItems:'center', color:'var(--muted)' }}>—</div>
                      )}
                    </div>
                    <div title={p.name} className="ellipsis">
                      {p.name}
                    </div>
                    <div>₺{Number(p.price).toLocaleString("tr-TR")}</div>
                    <div>₺{Number(p.price * (1 - (p.discountPercent || 0) / 100)).toLocaleString("tr-TR")}</div>
                    <div>{p.category || "-"}</div>
                    <div>{p.stock ?? 0}</div>
                    {/* Durum (sadece aktif/pasif butonu) */}
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-start' }}>
                      <button className={`chip ${p.active!==false?"state-active":"state-passive"}`} onClick={async()=>{
                        const next = { ...p, active: p.active===false ? true : false };
                        await saveProduct(next);
                        push({ title: next.active?"Aktifleştirildi":"Pasife alındı" });
                        reload();
                      }}>{p.active!==false?"Aktif":"Pasif"}</button>
                    </div>
                    {/* İşlem sütunu */}
                    <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                      <button className="link" onClick={() => onEdit(p)}>Düzenle</button>
                      <button className="link" onClick={() => onDelete(p.id)}>Sil</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SİPARİŞLER */}
        {tab === "orders" && (
          <div className="admin-section">
            <div className="admin-section-header">
              <h2 className="admin-section-title">Sipariş Yönetimi</h2>
              <div className="admin-stats-inline">
                {orderStats.count} sipariş • Toplam:{" "}
                {orderStats.total.toLocaleString("tr-TR", {
                  style: "currency",
                  currency: "TRY",
                })}
              </div>
            </div>
            <div className="adm-table orders-grid">
              <div className="adm-head">
                <div>#</div>
                <div>Tarih</div>
                <div>Müşteri</div>
                <div>Toplam</div>
                <div>Durum</div>
                <div>İşlem</div>
              </div>
              {orders.map((o) => (
                <div key={o.id} className="adm-row order-row" style={{ alignItems: "center" }}>
                  <div>{o.id}</div>
                  <div>{new Date(o.date).toLocaleString("tr-TR")}</div>
                  <div>{o.email || "-"}</div>
                  <div>
                    {(o.total || 0).toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}
                  </div>
                  <div>
                    <span className="chip">{o.status || "Sipariş Onay Bekliyor"}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button className="btn-ghost" onClick={() => window.location.assign(`/order/${o.id}`)}>Detay</button>
                    <button className="btn-primary" onClick={() => setShippingAndStatus(o)}>
                      <span className="btn-label">Sonraki Aşama</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* KULLANICILAR */}
        {tab === "users" && (
          <div className="admin-section">
            <h2 className="admin-section-title">Kullanıcı Yönetimi</h2>
            <div className="adm-table">
              <div className="adm-head" style={{ gridTemplateColumns: '1.1fr 1.6fr 1fr 1fr 2fr auto' }}>
                <div>Ad</div>
                <div>E-posta</div>
                <div>Tel</div>
                <div>Şehir</div>
                <div>Adres</div>
                <div style={{ textAlign:'right' }}>İşlem</div>
              </div>
              {users.map((u, i) => (
                <div key={i} className="adm-row" style={{ gridTemplateColumns: '1.1fr 1.6fr 1fr 1fr 2fr auto' }}>
                  <div>{u.name || '-'}</div>
                  <div>{u.email}</div>
                  <div>{u.phone || '-'}</div>
                  <div>{u.city || '-'}</div>
                  <div className="ellipsis">{u.address || '-'}</div>
                  <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                    <button className="btn-ghost" onClick={()=>setUserEdit({ ...u })}>Düzenle</button>
                    <button className="btn-ghost" onClick={()=>setUserDelete(u.email)}>Sil</button>
                  </div>
                </div>
              ))}
              {users.length === 0 && (
                <div className="adm-row" style={{ gridTemplateColumns:'1fr' }}>
                  <div>Henüz kullanıcı yok.</div>
                </div>
              )}
            </div>

            {userEdit && (
              <div className="admin-section" style={{ marginTop:12 }}>
                <h3 className="admin-section-title">Kullanıcı Düzenle</h3>
                <form className="form" onSubmit={(e)=>{ e.preventDefault();
                  const all = JSON.parse(localStorage.getItem('users') || '[]');
                  const idx = all.findIndex(x => x.email === userEdit.email);
                  if (idx >= 0) {
                    all[idx] = { ...all[idx], name: userEdit.name, phone: userEdit.phone, city: userEdit.city, address: userEdit.address };
                    localStorage.setItem('users', JSON.stringify(all));
                  }
                  const profiles = JSON.parse(localStorage.getItem('profiles') || '{}');
                  profiles[userEdit.email] = { ...(profiles[userEdit.email]||{}), name: userEdit.name, phone: userEdit.phone, city: userEdit.city, address: userEdit.address, email: userEdit.email };
                  localStorage.setItem('profiles', JSON.stringify(profiles));
                  push({ title:'Kullanıcı güncellendi' });
                  setUserEdit(null);
                  reloadOrdersUsers();
                }}>
                  <div className="row2">
                    <input className="input" placeholder="Ad" value={userEdit.name||''} onChange={(e)=>setUserEdit({ ...userEdit, name: e.target.value })} />
                    <input className="input" placeholder="E-posta" value={userEdit.email} disabled />
                  </div>
                  <div className="row2">
                    <input className="input" placeholder="Telefon" value={userEdit.phone||''} onChange={(e)=>setUserEdit({ ...userEdit, phone: e.target.value })} />
                    <input className="input" placeholder="Şehir" value={userEdit.city||''} onChange={(e)=>setUserEdit({ ...userEdit, city: e.target.value })} />
                  </div>
                  <input className="input" placeholder="Adres" value={userEdit.address||''} onChange={(e)=>setUserEdit({ ...userEdit, address: e.target.value })} />
                  <div style={{ display:'flex', gap:8, marginTop:8 }}>
                    <button className="btn-primary" type="submit"><span className="btn-label">Kaydet</span></button>
                    <button className="btn-ghost" type="button" onClick={()=>setUserEdit(null)}>Vazgeç</button>
                  </div>
                </form>
              </div>
            )}

            {/* Silme onay modali */}
            {userDelete && createPortal(
              (
                <div className="modal" onClick={()=>setUserDelete(null)}>
                  <div className="modal-card" onClick={(e)=>e.stopPropagation()}>
                    <h3>Kullanıcı silinsin mi?</h3>
                    <p>{userDelete} adresli kullanıcının kaydı silinecek.</p>
                    <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                      <button className="btn-ghost" onClick={()=>setUserDelete(null)}>İptal</button>
                      <button className="btn-primary" onClick={()=>{
                        const mail = userDelete;
                        const us = JSON.parse(localStorage.getItem('users')||'[]').filter(x=>x.email!==mail);
                        localStorage.setItem('users', JSON.stringify(us));
                        const pr = JSON.parse(localStorage.getItem('profiles')||'{}');
                        delete pr[mail];
                        localStorage.setItem('profiles', JSON.stringify(pr));
                        const del = new Set(JSON.parse(localStorage.getItem('deletedEmails')||'[]')); del.add(mail);
                        localStorage.setItem('deletedEmails', JSON.stringify(Array.from(del)));
                        push({ title:'Kullanıcı silindi' });
                        setUserDelete(null);
                        reloadOrdersUsers();
                      }}><span className="btn-label">Sil</span></button>
                    </div>
                  </div>
                </div>
              ),
              document.body
            )}
          </div>
        )}

        {/* AYARLAR */}
        {tab === "settings" && (
          <div className="settings-layout">
            {/* Excel (CSV) Dışa Aktarım */}
            <div className="admin-section">
              <h2 className="admin-section-title">Dışa Aktarım</h2>
              <div className="row2">
                <button className="btn-primary" onClick={async () => {
                  const XLSX = await import('xlsx-js-style');
                  const rows = list.map(p => ({ id:p.id, ad:p.name, fiyat:p.price, kategori:p.category, stok:p.stock??0, aktif:p.active!==false, maxAlis:p.maxPerUser??0 }));
                  const wb = XLSX.utils.book_new();
                  const ws = XLSX.utils.json_to_sheet(rows);

                  const headers = rows[0] ? Object.keys(rows[0]) : [];
                  const border = { top:{style:'thin', color:{rgb:'FFB7CBC6'}}, bottom:{style:'thin', color:{rgb:'FFB7CBC6'}}, left:{style:'thin', color:{rgb:'FFB7CBC6'}}, right:{style:'thin', color:{rgb:'FFB7CBC6'}} };
                  headers.forEach((_, i) => {
                    const addr = XLSX.utils.encode_cell({ r: 0, c: i });
                    if (ws[addr]) ws[addr].s = {
                      font: { bold: true, color: { rgb: 'FFFFFFFF' } },
                      fill: { patternType: 'solid', fgColor: { rgb: 'FF1F7A6F' } },
                      alignment: { horizontal: 'center', vertical: 'center' },
                      border
                    };
                  });

                  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
                  for (let r = 1; r <= range.e.r; r++) {
                    const bg = r % 2 === 0 ? 'FFF2FBF9' : 'FFFFFFFF';
                    for (let c = 0; c <= range.e.c; c++) {
                      const addr = XLSX.utils.encode_cell({ r, c });
                      if (ws[addr]) ws[addr].s = {
                        ...(ws[addr].s || {}),
                        fill: { patternType: 'solid', fgColor: { rgb: bg } },
                        border,
                        alignment: { vertical: 'center' }
                      };
                    }
                  }

                  const keyToCol = Object.fromEntries(headers.map((h, i) => [h, i]));
                  const range2 = XLSX.utils.decode_range(ws['!ref'] || 'A1');
                  const currencyCols = ['fiyat'];
                  currencyCols.forEach((k) => {
                    const c = keyToCol[k];
                    if (c == null) return;
                    for (let r = 1; r <= range2.e.r; r++) {
                      const addr = XLSX.utils.encode_cell({ r, c });
                      if (ws[addr]) {
                        ws[addr].z = '#,##0.00 [$₺-tr-TR]';
                        ws[addr].s = { ...(ws[addr].s||{}), alignment: { horizontal:'right', vertical:'center' } };
                      }
                    }
                  });

                  ws['!cols'] = headers.map((h) => {
                    if (h === 'email') return { wch: 28 };
                    if (h === 'ad') return { wch: 28 };
                    if (h === 'kategori') return { wch: 18 };
                    if (h === 'fiyat') return { wch: 14 };
                    return { wch: Math.max(12, h.length + 2) };
                  });

                  XLSX.utils.book_append_sheet(wb, ws, 'Urunler');
                  XLSX.writeFile(wb, `urunler-${new Date().toISOString().slice(0,10)}.xlsx`);
                }}><span className="btn-label">Ürünleri Excel indir</span></button>
                <button className="btn-ghost" onClick={async () => {
                  const XLSX = await import('xlsx-js-style');
                  const rows = orders.map(o => ({ id:o.id, tarih:new Date(o.date).toLocaleString('tr-TR'), email:o.email||'', toplam:o.total||0, durum:o.status||'' }));
                  const wb = XLSX.utils.book_new();
                  const ws = XLSX.utils.json_to_sheet(rows);

                  const headers = rows[0] ? Object.keys(rows[0]) : [];
                  const border = { top:{style:'thin', color:{rgb:'FFB7CBC6'}}, bottom:{style:'thin', color:{rgb:'FFB7CBC6'}}, left:{style:'thin', color:{rgb:'FFB7CBC6'}}, right:{style:'thin', color:{rgb:'FFB7CBC6'}} };
                  headers.forEach((_, i) => {
                    const addr = XLSX.utils.encode_cell({ r: 0, c: i });
                    if (ws[addr]) ws[addr].s = {
                      font: { bold: true, color: { rgb: 'FFFFFFFF' } },
                      fill: { patternType: 'solid', fgColor: { rgb: 'FF3B7C8A' } },
                      alignment: { horizontal: 'center', vertical: 'center' },
                      border
                    };
                  });

                  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
                  for (let r = 1; r <= range.e.r; r++) {
                    const bg = r % 2 === 0 ? 'FFF5F9FB' : 'FFFFFFFF';
                    for (let c = 0; c <= range.e.c; c++) {
                      const addr = XLSX.utils.encode_cell({ r, c });
                      if (ws[addr]) ws[addr].s = {
                        ...(ws[addr].s || {}),
                        fill: { patternType: 'solid', fgColor: { rgb: bg } },
                        border,
                        alignment: { vertical: 'center' }
                      };
                    }
                  }

                  const keyToCol = Object.fromEntries(headers.map((h, i) => [h, i]));
                  const range2 = XLSX.utils.decode_range(ws['!ref'] || 'A1');
                  const currencyCols = ['toplam'];
                  currencyCols.forEach((k) => {
                    const c = keyToCol[k];
                    if (c == null) return;
                    for (let r = 1; r <= range2.e.r; r++) {
                      const addr = XLSX.utils.encode_cell({ r, c });
                      if (ws[addr]) {
                        ws[addr].z = '#,##0.00 [$₺-tr-TR]';
                        ws[addr].s = { ...(ws[addr].s||{}), alignment: { horizontal:'right', vertical:'center' } };
                      }
                    }
                  });

                  ws['!cols'] = headers.map((h) => {
                    if (h === 'email') return { wch: 30 };
                    if (h === 'tarih') return { wch: 22 };
                    if (h === 'durum') return { wch: 22 };
                    if (h === 'toplam') return { wch: 16 };
                    return { wch: Math.max(12, h.length + 2) };
                  });

                  XLSX.utils.book_append_sheet(wb, ws, 'Siparisler');
                  XLSX.writeFile(wb, `siparisler-${new Date().toISOString().slice(0,10)}.xlsx`);
                }}>Siparişleri Excel indir</button>
              </div>
            </div>
            {/* Kategori Yönetimi */}
            <div className="admin-section">
              <h2 className="admin-section-title">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
                </svg>
                Kategori Yönetimi
              </h2>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  marginBottom: 10,
                }}
              >
                {categories.map((c, i) => (
                  <div
                    key={i}
                    className="chip"
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    {c}
                    <button
                      className="link"
                      onClick={() => renameCategory(c)}
                      title="Yeniden adlandır"
                    >
                      ✎
                    </button>
                    <button
                      className="link"
                      onClick={() => setCategories(categories.filter((_, idx) => idx !== i))}
                      title="Sil"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <form
                className="form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const val = e.target.cat.value.trim();
                  if (!val) return;
                  if (!categories.includes(val))
                    setCategories([...categories, val]);
                  e.target.reset();
                }}
              >
                <div style={{ display: "flex", gap: 8 }}>
                  <input name="cat" className="input" placeholder="Yeni kategori adı" />
                  <button className="btn-primary" style={{ width: 180 }}>
                    <span className="btn-label">Ekle</span>
                  </button>
                </div>
                <div className="muted mt8">
                  Kategoriler ürün formundaki seçim kutusunda görünür.
                </div>
              </form>
            </div>

            {/* Marka Yönetimi */}
            <div className="admin-section">
              <h2 className="admin-section-title">Marka Yönetimi</h2>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                {brands.map((b, i) => (
                  <div key={i} className="chip" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {b}
                    <button className="link" title="Yeniden adlandır" onClick={() => renameBrand(b)}>✎</button>
                    <button className="link" title="Sil" onClick={() => setBrands(brands.filter((_, idx) => idx !== i))}>×</button>
                  </div>
                ))}
              </div>
              <form className="form" onSubmit={(e)=>{ e.preventDefault(); const val = e.target.brand.value.trim(); if(!val) return; if(!brands.includes(val)) setBrands([...brands, val]); e.target.reset(); }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <input name="brand" className="input" placeholder="Yeni marka adı" />
                  <button className="btn-primary" style={{ width: 180 }}><span className="btn-label">Ekle</span></button>
                </div>
                <div className="muted mt8">Markalar ürün formundaki marka seçiminde görünür.</div>
              </form>
            </div>

            {/* Site Ayarları */}
            <div className="admin-section">
              <h2 className="admin-section-title">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
                </svg>
                Site Ayarları
              </h2>
              <div className="settings-grid">
                <div className="setting-item">
                  <label className="setting-label">KDV Oranı (%)</label>
                  <input className="input" type="number" min="0" step="1" value={siteSettings.vatRate ?? 20}
                    onChange={(e)=>setSiteSettings({ ...siteSettings, vatRate: e.target.valueAsNumber || 0 })} />
                  <p className="setting-description">Örn: 20 → %20</p>
                </div>
                <div className="setting-item">
                  <label className="setting-label">Kargo Ücreti</label>
                  <input className="input" type="number" min="0" step="1" value={siteSettings.shippingCost ?? 0}
                    onChange={(e)=>setSiteSettings({ ...siteSettings, shippingCost: e.target.valueAsNumber || 0 })} />
                </div>
                <div className="setting-item">
                  <label className="setting-label">Ücretsiz Kargo Eşiği</label>
                  <input className="input" type="number" min="0" step="1" value={siteSettings.freeShippingThreshold ?? 0}
                    onChange={(e)=>setSiteSettings({ ...siteSettings, freeShippingThreshold: e.target.valueAsNumber || 0 })} />
                </div>
              </div>

              <h3 className="admin-section-title" style={{ marginTop: 16 }}>Kupon Yönetimi</h3>
              <div className="cart-table">
                {coupons.map((c, i) => (
                  <div key={i} className="cart-row" style={{ gridTemplateColumns: "1fr .6fr .6fr .6fr .6fr" }}>
                    <div><strong>{c.code}</strong> <span className="muted">{c.desc || ""}</span></div>
                    <div>{c.type === 'rate' ? `%${c.value}` : `${c.value}₺`}</div>
                    <div className="muted">Min: {c.min ?? 0}₺</div>
                    <div className="muted">Son: {c.exp ? new Date(c.exp).toLocaleDateString('tr-TR') : '-'}</div>
                    <div style={{ textAlign: 'right' }}>
                      <button className="btn-ghost" onClick={() => saveCoupons(coupons.filter((_,x)=>x!==i))}>Sil</button>
                    </div>
                  </div>
                ))}
                {coupons.length === 0 && <p>Henüz kupon yok.</p>}
              </div>
              <form className="form" onSubmit={(e)=>{ e.preventDefault();
                const code = e.target.couponCode.value.trim().toUpperCase();
                const type = e.target.couponType.value;
                const value = Number(e.target.couponValue.value || 0);
                const min = Number(e.target.couponMin.value || 0);
                const desc = e.target.couponDesc.value.trim();
                const exp = e.target.couponExp.value ? new Date(e.target.couponExp.value).toISOString() : null;
                if(!code || value<=0) return;
                saveCoupons([...coupons, { code, type, value, min, desc, exp }]);
                e.target.reset();
              }}>
                <div className="row2">
                  <input name="couponCode" className="input" placeholder="KUPONKODU" />
                  <select name="couponType" className="input"><option value="rate">Yüzde</option><option value="amount">Tutar</option></select>
                </div>
                <div className="row2">
                  <input name="couponValue" className="input" type="number" placeholder="Değer (örn %10 için 10)" />
                  <input name="couponMin" className="input" type="number" placeholder="Min. Sepet (₺)" />
                </div>
                <div className="row2">
                  <input name="couponDesc" className="input" placeholder="Açıklama" />
                  <input name="couponExp" className="input" type="date" />
                </div>
                <button className="btn-primary" style={{ marginTop: 6 }}><span className="btn-label">Kupon Ekle</span></button>
              </form>
            </div>

            {/* Dinamik Filtre Grupları (yeniden düzenlendi) */}
            <div className="admin-section">
              <h2 className="admin-section-title">Filtre Başlıkları</h2>

              {(filterGroups || []).map((g, i) => (
                <div key={i} className="filter-group-card">
                  <div className="fg-header">
                    <div>
                      <div className="fg-title">{g.name}</div>
                      <div className="fg-sub muted">{(g.options||[]).length} seçenek</div>
                    </div>
                    <div className="fg-actions">
                      <button className="btn-ghost" onClick={()=>{
                        const nm = prompt('Başlık adı', g.name) || g.name;
                        const next = [...filterGroups];
                        next[i] = { ...g, name: nm.trim() };
                        saveFilterGroups(next);
                      }}>Düzenle</button>
                      <button className="btn-ghost" onClick={()=>saveFilterGroups(filterGroups.filter((_,x)=>x!==i))}>Sil</button>
                    </div>
                  </div>

                  <div className="fg-options">
                    {(g.options||[]).map((opt, j) => (
                      <span key={j} className="chip" style={{ display:'flex', alignItems:'center', gap:6 }}>
                        {opt}
                        <button className="link" title="Sil" onClick={()=>{ const next=[...filterGroups]; next[i] = { ...g, options: (g.options||[]).filter((_,x)=>x!==j) }; saveFilterGroups(next); }}>×</button>
                      </span>
                    ))}
                    {(g.options||[]).length===0 && <span className="muted">Henüz seçenek yok.</span>}
                  </div>

                  <form className="fg-form" onSubmit={(e)=>{ e.preventDefault(); const raw = e.target.multi.value || ''; const arr = raw.split(',').map(s=>s.trim()).filter(Boolean); if(arr.length===0) return; const next=[...filterGroups]; const set = new Set([...(g.options||[]), ...arr]); next[i] = { ...g, options: Array.from(set) }; saveFilterGroups(next); e.target.reset(); }}>
                    <input name="multi" className="input" placeholder="Yeni seçenek(ler) – virgülle ayırın" />
                    <button className="btn-primary"><span className="btn-label">Ekle</span></button>
                  </form>
                </div>
              ))}
              {(filterGroups||[]).length===0 && <p className="muted">Henüz özel başlık yok.</p>}

              <div className="filter-group-new">
                <h3 className="admin-section-title" style={{ marginTop: 12 }}>Yeni Başlık</h3>
                <form className="fg-create" onSubmit={(e)=>{ e.preventDefault(); const name = e.target.gname.value.trim(); const opts = e.target.gopts.value.split(',').map(s=>s.trim()).filter(Boolean); if(!name) return; saveFilterGroups([...(filterGroups||[]), { name, options: opts }]); e.target.reset(); }}>
                  <input name="gname" className="input" placeholder="Başlık adı (örn. Bağlantı Türü)" />
                  <input name="gopts" className="input" placeholder="Varsayılan seçenekler (virgülle) — opsiyonel" />
                  <button className="btn-primary"><span className="btn-label">Başlık Ekle</span></button>
                </form>
                <div className="muted mt8">Bu başlıklar ürün formuna ve kullanıcı filtrelerine yansır.</div>
              </div>
            </div>

            {/* Sistem Bilgileri */}
            <div className="admin-section">
              <h2 className="admin-section-title">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                Sistem Bilgileri
              </h2>
              <div className="system-info">
                <div className="info-row">
                  <span className="info-label">Sistem Versiyonu:</span>
                  <span className="info-value">YKKshop v1.0.0</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Veritabanı:</span>
                  <span className="info-value">LocalStorage</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Toplam Ürün:</span>
                  <span className="info-value">{list.length} adet</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Toplam Sipariş:</span>
                  <span className="info-value">{orders.length} adet</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Kayıtlı Kullanıcı:</span>
                  <span className="info-value">{users.length} kişi</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Son Güncelleme:</span>
                  <span className="info-value">{new Date().toLocaleDateString("tr-TR")}</span>
                </div>
              </div>
            </div>

            {/* Yedekleme ve Geri Yükleme */}
            <div className="admin-section">
              <h2 className="admin-section-title">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2h3a1 1 0 110 2h-1v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6H4a1 1 0 110-2h3zM9 3v1h6V3H9zm0 5v8a1 1 0 102 0V8a1 1 0 10-2 0zm4 0v8a1 1 0 102 0V8a1 1 0 10-2 0z"/>
                </svg>
                Veri Yönetimi
              </h2>
              <div className="backup-actions">
                <button 
                  className="btn-primary backup-btn"
                  onClick={() => {
                    const data = {
                      products: list,
                      orders,
                      users,
                      categories,
                      timestamp: new Date().toISOString()
                    };
                    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `ykkshop-backup-${new Date().toISOString().split('T')[0]}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    push({ title: "Yedek dosyası indirildi" });
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                    <polyline points="7,10 12,15 17,10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  <span className="btn-label">Verileri Yedekle</span>
                </button>
                
                <button 
                  className="btn-ghost backup-btn"
                  onClick={async () => {
                    const ok = await confirmDialog({ title:'Sıfırlansın mı?', message:'Tüm veriler silinecek ve varsayılan veriler yüklenecek.' });
                    if (ok) {
                      localStorage.clear();
                      window.location.reload();
                    }
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="1,4 1,10 7,10"/>
                    <path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
                  </svg>
                  Sıfırla
                </button>
              </div>
              <div className="muted mt8">
                <strong>Dikkat:</strong> Yedekleme işlemi tüm ürünler, siparişler ve kullanıcı verilerini içerir.
              </div>
            </div>

          </div>
        )}

        <Toasts items={toasts} onClose={close} />
      </main>

      {/* Çıkış Onay Modalı */}
      {showLogout && createPortal(
        (
          <div className="modal" onClick={()=>setShowLogout(false)}>
            <div className="modal-card" onClick={(e)=>e.stopPropagation()}>
              <h3>Çıkış yapılsın mı?</h3>
              <p>Yönetici paneline çıkış yapmak üzeresiniz.</p>
              <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                <button className="btn-ghost" onClick={()=>setShowLogout(false)}>İptal</button>
                <button className="btn-primary" onClick={doLogout}><span className="btn-label">Çıkış Yap</span></button>
              </div>
            </div>
          </div>
        ),
        document.body
      )}
    </div>
  );
}
