
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Product, CartItem, Discount, DiscountType, View, Transaction, ShopSettings, Language, PaymentStatus, PaymentMethod, ShippingCarrier } from './types';
import { PRODUCTS as INITIAL_PRODUCTS, CATEGORIES, TRANSLATIONS } from './constants';
import { ProductCard } from './components/ProductCard';
import { DiscountSelector } from './components/DiscountSelector';
import { GoogleGenAI } from "@google/genai";

const App: React.FC = () => {
  // --- 1. CORE STATE ---
  const [lang, setLang] = useState<Language>(() => (localStorage.getItem('pos_lang') as Language) || 'TH');
  const [currentView, setCurrentView] = useState<View>(() => (localStorage.getItem('pos_view') as View) || 'dashboard');
  
  const [shopSettings, setShopSettings] = useState<ShopSettings>(() => {
    const saved = localStorage.getItem('pos_shop_settings');
    return saved ? JSON.parse(saved) : {
      name: 'Gemini POS Pro',
      address: 'Skyline Plaza, Vientiane',
      phone: '020-XXXX-XXXX',
      logo: '💎',
      logoType: 'emoji'
    };
  });

  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem('pos_products');
    return saved ? JSON.parse(saved) : INITIAL_PRODUCTS;
  });

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('pos_transactions');
    if (!saved) return [];
    try {
      return JSON.parse(saved).map((tx: any) => ({ ...tx, timestamp: new Date(tx.timestamp) }));
    } catch { return []; }
  });

  // --- 2. POS STATE ---
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState<Discount | null>(null);
  const [customer, setCustomer] = useState({ name: '', phone: '', address: '' });
  const [payment, setPayment] = useState({ status: 'paid' as PaymentStatus, method: 'transfer' as PaymentMethod });
  const [shipping, setShipping] = useState({ carrier: '' as ShippingCarrier, branch: '' });
  const [pendingEditId, setPendingEditId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [aiAdvice, setAiAdvice] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  // --- 3. UI STATE ---
  const [printingTx, setPrintingTx] = useState<Transaction | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [editingReportTx, setEditingReportTx] = useState<Transaction | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const t = TRANSLATIONS[lang];

  // --- 4. PERSISTENCE ---
  useEffect(() => { localStorage.setItem('pos_lang', lang); }, [lang]);
  useEffect(() => { localStorage.setItem('pos_view', currentView); }, [currentView]);
  useEffect(() => { localStorage.setItem('pos_products', JSON.stringify(products)); }, [products]);
  useEffect(() => { localStorage.setItem('pos_transactions', JSON.stringify(transactions)); }, [transactions]);
  useEffect(() => { localStorage.setItem('pos_shop_settings', JSON.stringify(shopSettings)); }, [shopSettings]);

  // --- 5. CALCULATIONS ---
  const summary = useMemo(() => {
    const subtotal = cart.reduce((acc, item) => {
      const itemPrice = item.price * item.quantity;
      const idisc = item.itemDiscount;
      const idiscAmt = idisc ? (idisc.type === DiscountType.PERCENTAGE ? (itemPrice * idisc.value / 100) : idisc.value) : 0;
      return acc + (itemPrice - idiscAmt);
    }, 0);

    const costTotal = cart.reduce((acc, item) => acc + (item.cost * item.quantity), 0);
    const billDiscountAmt = discount 
      ? (discount.type === DiscountType.PERCENTAGE ? (subtotal * discount.value / 100) : discount.value)
      : 0;
    
    const total = Math.max(0, subtotal - billDiscountAmt);
    return { subtotal, total, billDiscountAmount: billDiscountAmt, profit: total - costTotal };
  }, [cart, discount]);

  const analytics = useMemo(() => {
    const active = transactions.filter(t => t.status === 'completed');
    const totalSales = active.reduce((a, b) => a + b.total, 0);
    const totalProfit = active.reduce((a, b) => a + b.profit, 0);
    const stockValue = products.reduce((a, b) => a + (b.cost * b.stock), 0);

    const months = Array.from({length: 6}, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      return d.toLocaleString('en-US', { month: 'short' });
    }).reverse();

    const monthlyData = months.map(m => {
      const sales = active
        .filter(t => t.timestamp.toLocaleString('en-US', { month: 'short' }) === m)
        .reduce((a, b) => a + b.total, 0);
      return { month: m, sales };
    });

    return { totalSales, totalProfit, stockValue, monthlyData };
  }, [transactions, products]);

  // --- 6. ACTIONS ---
  const handleApproveBill = () => {
    if (cart.length === 0) return;

    for (const item of cart) {
      const p = products.find(prod => prod.id === item.id);
      let currentInOld = 0;
      if (pendingEditId) {
        const oldTx = transactions.find(tx => tx.id === pendingEditId);
        currentInOld = oldTx?.items.find(i => i.id === item.id)?.quantity || 0;
      }
      if (!p || (p.stock + currentInOld) < item.quantity) {
        return alert(`สินค้า ${item.name} สต็อกไม่พอ (ขาดอีก ${(item.quantity - (p?.stock || 0) - currentInOld).toLocaleString()})`);
      }
    }

    let updatedProducts = [...products];
    let updatedTransactions = [...transactions];

    if (pendingEditId) {
      const old = updatedTransactions.find(tx => tx.id === pendingEditId);
      if (old && old.status !== 'cancelled') {
        updatedProducts = updatedProducts.map(p => {
          const inOld = old.items.find(i => i.id === p.id);
          return inOld ? { ...p, stock: p.stock + inOld.quantity } : p;
        });
        updatedTransactions = updatedTransactions.map(tx => tx.id === pendingEditId ? { ...tx, status: 'cancelled' } : tx);
      }
    }

    updatedProducts = updatedProducts.map(p => {
      const inCart = cart.find(i => i.id === p.id);
      return inCart ? { ...p, stock: p.stock - inCart.quantity } : p;
    });

    const newTx: Transaction = {
      id: `INV-${Date.now()}`,
      timestamp: new Date(),
      items: cart.map(it => ({ ...it })),
      status: 'completed',
      paymentStatus: payment.status,
      paymentMethod: payment.method,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerAddress: customer.address,
      shippingCarrier: shipping.carrier,
      shippingBranch: shipping.branch,
      appliedDiscount: discount,
      ...summary,
      itemDiscountTotal: 0
    };

    setProducts(updatedProducts);
    setTransactions([newTx, ...updatedTransactions]);
    setPrintingTx(newTx);
    setTimeout(() => {
      window.print();
      setPrintingTx(null);
      resetPOS();
    }, 500);
  };

  const resetPOS = () => {
    setCart([]); setDiscount(null); setPendingEditId(null);
    setCustomer({ name: '', phone: '', address: '' });
    setPayment({ status: 'paid', method: 'transfer' });
    setShipping({ carrier: '' as ShippingCarrier, branch: '' });
    setAiAdvice('');
  };

  // Add the reloadToEdit function to handle editing existing bills
  const reloadToEdit = (tx: Transaction) => {
    setCart(tx.items.map(it => ({ ...it })));
    setDiscount(tx.appliedDiscount);
    setCustomer({ name: tx.customerName, phone: tx.customerPhone, address: tx.customerAddress });
    setPayment({ status: tx.paymentStatus, method: tx.paymentMethod });
    setShipping({ carrier: tx.shippingCarrier, branch: tx.shippingBranch });
    setPendingEditId(tx.id);
    setCurrentView('pos');
  };

  const clearInventory = () => {
    if (window.confirm('⚠️ ยืนยันการล้างคลังสินค้าทั้งหมด?')) {
      setProducts([]);
      localStorage.removeItem('pos_products');
    }
  };

  const cancelBill = (txId: string) => {
    if (!window.confirm('ยกเลิกบิลคืนสต็อก?')) return;
    const tx = transactions.find(t => t.id === txId);
    if (!tx || tx.status === 'cancelled') return;

    setProducts(prev => prev.map(prod => {
      const inTx = tx.items.find(i => i.id === prod.id);
      return inTx ? { ...prod, stock: prod.stock + inTx.quantity } : prod;
    }));
    setTransactions(prev => prev.map(t => t.id === txId ? { ...t, status: 'cancelled' } : t));
  };

  const getAiAdvice = async () => {
    if (cart.length === 0) return;
    setIsAiLoading(true);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    try {
      const prompt = `Cart: ${cart.map(i => `${i.name} x${i.quantity}`).join(', ')}. Suggest a professional discount or bundle deal for this specific order. Keep it short.`;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
      });
      setAiAdvice(response.text || '');
    } catch (e) { setAiAdvice('Unable to get advice right now.'); }
    finally { setIsAiLoading(false); }
  };

  const importCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      const newItems: Product[] = lines.slice(1).map(l => {
        const [id, name, cost, price, category, stock] = l.split(',').map(s => s.trim());
        return { id, name, cost: Number(cost), price: Number(price), category, stock: Number(stock) };
      });
      setProducts(prev => {
        const map = new Map(prev.map(p => [p.id, p]));
        newItems.forEach(i => map.set(i.id, i));
        return Array.from(map.values());
      });
      alert('Import Success!');
    };
    reader.readAsText(file);
  };

  // --- 7. UI RENDER ---
  const NavItem = ({ view, icon, label }: any) => (
    <button onClick={() => setCurrentView(view)} className={`w-full flex items-center gap-5 px-8 py-5 rounded-4xl text-[15px] font-extrabold transition-all duration-300 ${currentView === view ? 'bg-primary text-white shadow-2xl shadow-primary/30 scale-105' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}>
      <span className="text-2xl">{icon}</span><span>{label}</span>
    </button>
  );

  return (
    <div className="flex h-screen overflow-hidden text-[#1e293b]">
      
      {/* 🧾 PRINT LAYER */}
      <div id="print-area" className={`${printingTx ? 'block' : 'hidden'} print:block fixed inset-0 bg-white z-[9999] p-10 font-mono text-sm`}>
        {printingTx && (
          <div className="max-w-[80mm] mx-auto text-center">
            <h2 className="text-2xl font-black uppercase mb-1">{shopSettings.name}</h2>
            <p className="text-[10px] opacity-60 mb-4">{shopSettings.address} | Tel: {shopSettings.phone}</p>
            <div className="border-y border-black/20 py-4 text-left space-y-1 mb-4">
              <p>No: {printingTx.id}</p>
              <p>Date: {printingTx.timestamp.toLocaleString()}</p>
              <p>Client: {printingTx.customerName || 'Walk-in'}</p>
            </div>
            <table className="w-full text-left mb-6">
              <thead><tr className="border-b border-black font-bold"><th>Item</th><th className="text-right">Qty</th><th className="text-right">Price</th></tr></thead>
              <tbody>
                {printingTx.items.map(it => (
                  <tr key={it.id} className="border-b border-dotted border-black/10">
                    <td className="py-2 pr-2">{it.name}</td>
                    <td className="text-right py-2">{it.quantity.toLocaleString()}</td>
                    <td className="text-right py-2">{(it.price * it.quantity).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-right space-y-1 font-bold">
              <p className="opacity-50 text-xs">Subtotal: {printingTx.subtotal.toLocaleString()}</p>
              {printingTx.billDiscountAmount > 0 && <p className="text-danger">Discount: -{printingTx.billDiscountAmount.toLocaleString()}</p>}
              <p className="text-xl pt-2 border-t border-black/20">TOTAL: {printingTx.total.toLocaleString()} LAK</p>
            </div>
            <p className="mt-10 text-[10px] opacity-40 uppercase tracking-widest">Power by Gemini POS Pro</p>
          </div>
        )}
      </div>

      {/* 📁 SIDEBAR (Modern Dark) */}
      <aside className="w-80 bg-dark text-slate-400 flex flex-col shrink-0 shadow-2xl z-20">
        <div className="p-10 flex flex-col items-center">
          <div className="w-24 h-24 bg-gradient-to-tr from-primary to-accent rounded-5xl mb-6 flex items-center justify-center shadow-3xl shadow-primary/40 ring-4 ring-white/5 animate-float overflow-hidden">
             {shopSettings.logoType === 'image' ? <img src={shopSettings.logo} className="w-full h-full object-cover" /> : <span className="text-5xl">{shopSettings.logo}</span>}
          </div>
          <h1 className="text-xs font-black text-white text-center uppercase tracking-[0.5em] opacity-90">{shopSettings.name}</h1>
        </div>
        <nav className="flex-1 px-6 space-y-3">
          <NavItem view="dashboard" icon="⚡" label={t.dashboard} />
          <NavItem view="pos" icon="🛍️" label={t.pos} />
          <NavItem view="stock" icon="📦" label={t.stock} />
          <NavItem view="reports" icon="📝" label={t.reports} />
          <NavItem view="settings" icon="⚙️" label={t.settings} />
        </nav>
        <div className="p-8 border-t border-white/5 flex flex-col gap-4">
           <div className="flex justify-center gap-2">
             {['TH','LA','EN'].map(l => <button key={l} onClick={()=>setLang(l as any)} className={`px-4 py-2 rounded-2xl text-[10px] font-black tracking-widest transition-all ${lang === l ? 'bg-primary text-white shadow-xl shadow-primary/20' : 'hover:bg-white/5'}`}>{l}</button>)}
           </div>
           <button onClick={() => { if(confirm('Reset all data?')) { localStorage.clear(); location.reload(); }}} className="text-[9px] font-black uppercase tracking-[0.2em] text-danger/50 hover:text-danger transition-colors text-center">Master Reset System</button>
        </div>
      </aside>

      {/* 💻 MAIN STAGE */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="h-24 glass border-b border-slate-200/60 px-12 flex items-center justify-between z-10 shrink-0 shadow-sm">
          <div>
            <h2 className="text-3xl font-black text-slate-800 tracking-tighter uppercase">{t[currentView]}</h2>
            <div className="flex items-center gap-2 mt-1">
               <span className="w-2 h-2 bg-success rounded-full animate-pulse"></span>
               <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Core 1.2</span>
            </div>
          </div>
          <div className="flex items-center gap-6">
             {pendingEditId && <div className="bg-amber-100/80 backdrop-blur-md text-amber-700 px-6 py-2 rounded-full text-[10px] font-black border border-amber-200 animate-pulse uppercase tracking-[0.2em]">Editing Mode: {pendingEditId.split('-')[1]}</div>}
             <div className="text-right hidden sm:block">
               <p className="text-xs font-black text-slate-800">{new Date().toLocaleDateString(lang === 'TH' ? 'th-TH' : 'en-US', { dateStyle: 'long' })}</p>
               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">System Cloud Synced</p>
             </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-12 scrollbar-hide bg-[#f8fafc]/50">
          
          {/* DASHBOARD VIEW */}
          {currentView === 'dashboard' && (
            <div className="space-y-12 animate-in fade-in slide-in-from-bottom duration-700">
               <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                  <MetricCard title={t.total_sales} value={analytics.totalSales} icon="💰" color="indigo" />
                  <MetricCard title="กำไรจริง (Profit)" value={analytics.totalProfit} icon="✨" color="emerald" />
                  <MetricCard title="มูลค่าสต็อก" value={analytics.stockValue} icon="📊" color="sky" />
                  <MetricCard title="บิลทั้งหมด" value={transactions.length} icon="🧾" color="slate" />
               </div>

               <div className="bg-white p-12 rounded-5xl border border-slate-200/60 shadow-xl shadow-slate-200/40">
                  <div className="flex justify-between items-center mb-12">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.4em]">วิเคราะห์รายเดือน (Revenue Forecast)</h3>
                    <div className="px-4 py-2 bg-slate-50 rounded-2xl border border-slate-100 text-[10px] font-black text-slate-400 uppercase">Trend Analysis v1.0</div>
                  </div>
                  <div className="h-96 flex items-end justify-between gap-6 px-6">
                     {analytics.monthlyData.map((d, i) => {
                       const max = Math.max(...analytics.monthlyData.map(m => m.sales), 1);
                       const height = (d.sales / max) * 100;
                       return (
                         <div key={i} className="flex-1 flex flex-col items-center gap-6 group">
                           <div className="relative w-full flex flex-col justify-end h-72">
                              <div style={{ height: `${height}%` }} className="w-full bg-slate-100 group-hover:bg-primary group-hover:shadow-2xl group-hover:shadow-primary/40 rounded-4xl transition-all duration-1000 relative flex justify-center">
                                 <div className="absolute -top-12 bg-dark text-white text-[10px] px-4 py-2 rounded-2xl opacity-0 group-hover:opacity-100 transition-all font-black shadow-2xl z-20 whitespace-nowrap">
                                    {d.sales.toLocaleString()} LAK
                                 </div>
                              </div>
                           </div>
                           <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{d.month}</span>
                         </div>
                       );
                     })}
                  </div>
               </div>
            </div>
          )}

          {/* POS VIEW */}
          {currentView === 'pos' && (
            <div className="flex h-full gap-12 animate-in slide-in-from-right duration-500 overflow-hidden">
               <div className="flex-1 flex flex-col min-w-0">
                  <div className="flex gap-3 mb-8 overflow-x-auto pb-4 scrollbar-hide">
                    {CATEGORIES.map(cat => <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-10 py-4 rounded-4xl text-[11px] font-black uppercase transition-all shrink-0 ${selectedCategory === cat ? 'bg-primary text-white shadow-2xl shadow-primary/30 scale-105' : 'bg-white text-slate-400 border border-slate-200 hover:border-primary shadow-sm'}`}>{cat}</button>)}
                  </div>
                  <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-8 overflow-y-auto pb-32 scrollbar-hide">
                    {products.filter(p => selectedCategory === 'All' || p.category === selectedCategory).map(p => (
                      <ProductCard key={p.id} product={p} onAdd={(pd) => setCart(prev => {
                        const ex = prev.find(i => i.id === pd.id);
                        if (ex) return prev.map(i => i.id === pd.id ? {...i, quantity: i.quantity + 1} : i);
                        return [...prev, {...pd, quantity: 1}];
                      })} />
                    ))}
                  </div>
               </div>

               <aside className="w-[38rem] bg-white border border-slate-200/60 flex flex-col rounded-5xl shadow-2xl overflow-hidden shrink-0">
                  <div className="p-10 border-b bg-slate-50/50 flex justify-between items-center">
                    <h3 className="font-black text-slate-800 text-sm uppercase tracking-[0.2em]">ตะกร้าชำระเงิน</h3>
                    <button onClick={() => { if(confirm('Clear Basket?')) resetPOS(); }} className="w-10 h-10 flex items-center justify-center rounded-2xl bg-rose-50 text-danger hover:bg-danger hover:text-white transition-all shadow-sm">🗑️</button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-10 space-y-8 scrollbar-hide">
                    <div className="space-y-6">
                      {cart.map(item => (
                        <div key={item.id} className="bg-slate-50/50 p-8 rounded-4xl space-y-6 border border-slate-100 hover:bg-white hover:shadow-xl transition-all group">
                           <div className="flex justify-between items-start">
                              <div className="flex-1 pr-4">
                                <p className="font-black text-xl text-slate-800 line-clamp-1">{item.name}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">ID: {item.id} • {item.price.toLocaleString()} / Unit</p>
                              </div>
                              <div className="flex items-center gap-3 bg-white p-2 rounded-3xl shadow-sm border border-slate-100">
                                 <button onClick={()=>setCart(p=>p.map(i=>i.id===item.id?{...i,quantity:Math.max(0,i.quantity-1)}:i).filter(i=>i.quantity>0))} className="w-10 h-10 flex items-center justify-center text-xl font-black text-slate-300 hover:text-danger hover:bg-rose-50 rounded-2xl transition-all">-</button>
                                 <input 
                                    type="number"
                                    value={item.quantity}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value) || 0;
                                      setCart(p=>p.map(i=>i.id===item.id?{...i, quantity: Math.max(0, val)}:i).filter(i=>i.quantity>0));
                                    }}
                                    className="text-xl font-black w-24 text-center bg-transparent border-none outline-none focus:ring-0 text-primary"
                                 />
                                 <button onClick={()=>setCart(p=>p.map(i=>i.id===item.id?{...i,quantity:i.quantity+1}:i))} className="w-10 h-10 flex items-center justify-center text-xl font-black text-slate-300 hover:text-primary hover:bg-indigo-50 rounded-2xl transition-all">+</button>
                              </div>
                           </div>
                           <div className="flex justify-between items-center pt-4 border-t border-slate-200/50">
                              <div className="flex items-center gap-2">
                                <input type="number" placeholder="ส่วนลด" className="text-xs w-32 bg-white px-4 py-2 rounded-2xl border border-slate-200 outline-none focus:ring-4 focus:ring-primary/10 font-black shadow-inner"
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setCart(p=>p.map(it=>it.id===item.id?{...it, itemDiscount: {type: DiscountType.FIXED, value: val}}:it));
                                  }}
                                />
                              </div>
                              <p className="text-2xl font-black text-primary">{(item.price * item.quantity).toLocaleString()} <span className="text-[10px] text-slate-400 ml-1">LAK</span></p>
                           </div>
                        </div>
                      ))}
                      {cart.length === 0 && (
                        <div className="py-24 text-center space-y-4">
                           <div className="text-6xl opacity-10 grayscale">🛒</div>
                           <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">ตะกร้าว่างเปล่า</p>
                        </div>
                      )}
                    </div>

                    {cart.length > 0 && (
                      <div className="pt-10 border-t-2 border-slate-100 space-y-10">
                         <div className="grid grid-cols-2 gap-6">
                            <InputField label={t.customer_name} value={customer.name} onChange={v=>setCustomer(p=>({...p, name:v}))} placeholder="ชื่อ..." />
                            <InputField label={t.phone} value={customer.phone} onChange={v=>setCustomer(p=>({...p, phone:v}))} placeholder="020..." />
                         </div>
                         <InputField label={t.address} value={customer.address} onChange={v=>setCustomer(p=>({...p, address:v}))} placeholder="ที่อยู่..." isTextarea />
                         <div className="grid grid-cols-2 gap-8">
                            <SelectField label={t.shipping} value={shipping.carrier} onChange={v=>setShipping(p=>({...p, carrier:v as any}))}>
                                <option value="">ไม่ระบุ</option><option value="roung_aloun">รุ่งอรุณ</option><option value="anouchit">อนุชิต</option><option value="mixay">มีไช</option><option value="pickup">รับเอง</option>
                            </SelectField>
                            <SelectField label={t.payment} value={payment.method} onChange={v=>setPayment(p=>({...p, method:v as any}))}>
                                <option value="transfer">โอนเงิน</option><option value="cod">COD</option><option value="cash">เงินสด</option>
                            </SelectField>
                         </div>
                         <DiscountSelector currentDiscount={discount} onApply={setDiscount} />

                         <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-6 rounded-4xl border border-blue-100 space-y-4 shadow-inner group">
                            <div className="flex items-center justify-between">
                               <div className="flex items-center gap-3">
                                  <span className="text-2xl group-hover:rotate-12 transition-transform">✨</span>
                                  <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">AI Smart Discount</span>
                               </div>
                               <button onClick={getAiAdvice} disabled={isAiLoading} className="px-5 py-2 bg-white rounded-2xl text-[10px] font-black text-indigo-500 border border-indigo-100 shadow-sm hover:bg-indigo-50 transition-all disabled:opacity-50">
                                 {isAiLoading ? 'Analyzing...' : 'Get Advice'}
                               </button>
                            </div>
                            {aiAdvice && <p className="text-sm font-bold text-slate-600 leading-relaxed italic animate-in fade-in">"{aiAdvice}"</p>}
                         </div>
                      </div>
                    )}
                  </div>

                  {cart.length > 0 && (
                    <div className="p-12 bg-slate-50/80 backdrop-blur-xl border-t-2 shrink-0">
                       <div className="flex justify-between items-end mb-10">
                          <span className="text-sm font-black text-slate-400 uppercase tracking-[0.4em]">{t.total}:</span>
                          <div className="text-right">
                             {summary.billDiscountAmount > 0 && <p className="text-danger text-lg font-black italic animate-bounce">- {summary.billDiscountAmount.toLocaleString()}</p>}
                             <p className="text-6xl font-black text-primary tracking-tighter drop-shadow-2xl">{summary.total.toLocaleString()} <span className="text-sm text-slate-400 tracking-[0.2em] ml-2 font-bold">LAK</span></p>
                          </div>
                       </div>
                       <button disabled={cart.length === 0} onClick={handleApproveBill} className="w-full py-8 rounded-5xl font-black text-xl shadow-[0_30px_60px_-15px_rgba(99,102,241,0.5)] transition-all active:scale-95 hover:scale-[1.02] bg-primary text-white uppercase tracking-[0.4em]">
                          {pendingEditId ? 'ยืนยันการแก้ไข' : t.approve}
                       </button>
                    </div>
                  )}
               </aside>
            </div>
          )}

          {/* STOCK VIEW */}
          {currentView === 'stock' && (
            <div className="space-y-10 animate-in fade-in duration-500">
               <div className="flex justify-between items-center">
                  <div className="flex gap-4">
                    <button onClick={() => { setEditingProduct(null); setShowAddProduct(true); }} className="bg-primary text-white px-10 py-5 rounded-4xl font-black text-sm shadow-2xl shadow-primary/30 hover:bg-secondary transition-all uppercase tracking-[0.2em]">+ New Item</button>
                    <button onClick={() => fileInputRef.current?.click()} className="bg-white text-emerald-600 border-2 border-emerald-100 px-10 py-5 rounded-4xl font-black text-sm hover:bg-emerald-50 transition-all uppercase tracking-widest">📥 Import CSV</button>
                    <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={importCsv} />
                  </div>
                  <button onClick={clearInventory} className="bg-white text-danger border-2 border-rose-100 px-10 py-5 rounded-4xl font-black text-sm hover:bg-rose-50 transition-all uppercase tracking-widest">🗑️ Clear Inventory</button>
               </div>
               <div className="bg-white rounded-5xl border border-slate-200/60 shadow-2xl overflow-hidden overflow-x-auto">
                  <table className="w-full text-left min-w-[1200px]">
                     <thead className="bg-slate-50 border-b-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.5em]"><tr className="border-b"><th className="px-12 py-10">Ref ID</th><th className="px-12 py-10">Item Name</th><th className="px-12 py-10 text-right">Cost</th><th className="px-12 py-10 text-right">Price</th><th className="px-12 py-10 text-right">Stock</th><th className="px-12 py-10 text-center">Manage</th></tr></thead>
                     <tbody className="divide-y text-sm font-bold text-slate-600 divide-slate-100">
                        {products.map(p => (
                          <tr key={p.id} className="hover:bg-slate-50/50 transition-colors group">
                            <td className="px-12 py-8 font-mono text-primary group-hover:scale-110 transition-transform origin-left">#{p.id}</td>
                            <td className="px-12 py-8">
                               <p className="text-slate-900 font-black text-lg">{p.name}</p>
                               <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded-lg">{p.category}</span>
                            </td>
                            <td className="px-12 py-8 text-right text-slate-400">{p.cost.toLocaleString()}</td>
                            <td className="px-12 py-8 text-right font-black text-slate-900 text-lg">{p.price.toLocaleString()}</td>
                            <td className={`px-12 py-8 text-right font-black text-lg ${p.stock < 10 ? 'text-danger' : 'text-slate-800'}`}>{p.stock.toLocaleString()}</td>
                            <td className="px-12 py-8 text-center flex justify-center gap-4">
                               <button onClick={() => { setEditingProduct(p); setShowAddProduct(true); }} className="w-14 h-14 bg-amber-50 text-amber-600 rounded-3xl flex items-center justify-center hover:bg-amber-500 hover:text-white transition-all shadow-sm">✏️</button>
                               <button onClick={() => { if(confirm('Delete permanently?')) setProducts(ps=>ps.filter(x=>x.id!==p.id))}} className="w-14 h-14 bg-rose-50 text-danger rounded-3xl flex items-center justify-center hover:bg-danger hover:text-white transition-all shadow-sm">🗑️</button>
                            </td>
                          </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </div>
          )}

          {/* REPORTS */}
          {currentView === 'reports' && (
             <div className="bg-white rounded-5xl border border-slate-200/60 shadow-2xl overflow-x-auto animate-in fade-in duration-500">
                <table className="w-full text-left min-w-[1200px]">
                   <thead className="bg-slate-50 border-b-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.5em]">
                      <tr><th className="px-12 py-10">Invoice ID</th><th className="px-12 py-10">Customer</th><th className="px-12 py-10">Carrier</th><th className="px-12 py-10 text-right">Total Net</th><th className="px-12 py-10 text-center">Manage</th></tr>
                   </thead>
                   <tbody className="divide-y text-base font-bold text-slate-600 divide-slate-100">
                      {transactions.map(tx => (
                        <tr key={tx.id} className={`hover:bg-slate-50 transition-colors ${tx.status === 'cancelled' ? 'opacity-30 grayscale' : ''}`}>
                           <td className="px-12 py-8"><p className="font-black text-primary text-sm font-mono tracking-tighter">#{tx.id.split('-')[1]}</p><p className="text-[10px] text-slate-400 mt-1 uppercase font-black">{tx.timestamp.toLocaleString()}</p></td>
                           <td className="px-12 py-8"><p className="text-slate-900 font-black text-lg">{tx.customerName || 'Walk-in'}</p><p className="text-xs text-slate-400 mt-1 font-bold">{tx.customerPhone}</p></td>
                           <td className="px-12 py-8"><span className="px-4 py-2 bg-indigo-50 text-primary rounded-2xl text-[10px] font-black uppercase tracking-widest">{t[tx.shippingCarrier] || 'Standard'}</span></td>
                           <td className="px-12 py-8 text-right text-slate-900 font-black text-2xl tracking-tighter">{tx.total.toLocaleString()}</td>
                           <td className="px-12 py-8 text-center flex justify-center gap-4">
                              <button onClick={() => { setPrintingTx(tx); setTimeout(() => { window.print(); setPrintingTx(null); }, 500); }} className="w-14 h-14 bg-indigo-50 text-primary rounded-3xl flex items-center justify-center hover:bg-primary hover:text-white transition-all">🖨️</button>
                              {tx.status === 'completed' && (
                                <>
                                  <button onClick={() => reloadToEdit(tx)} className="w-14 h-14 bg-amber-50 text-amber-600 rounded-3xl flex items-center justify-center hover:bg-amber-600 hover:text-white transition-all">🔄</button>
                                  <button onClick={() => cancelBill(tx.id)} className="w-14 h-14 bg-rose-50 text-danger rounded-3xl flex items-center justify-center hover:bg-danger hover:text-white transition-all">🚫</button>
                                </>
                              )}
                           </td>
                        </tr>
                      ))}
                   </tbody>
                </table>
             </div>
          )}

          {/* SETTINGS */}
          {currentView === 'settings' && (
            <div className="max-w-4xl animate-in zoom-in-95 bg-white p-20 rounded-5xl border border-slate-200/60 shadow-2xl space-y-16 mx-auto">
               <div className="space-y-10">
                  <h4 className="text-sm font-black text-primary uppercase tracking-[0.5em] border-l-8 border-primary pl-8">Shop Configuration</h4>
                  <div className="grid grid-cols-2 gap-10">
                    <InputField label="ชื่อร้าน (Shop Name)" value={shopSettings.name} onChange={v=>setShopSettings(p=>({...p, name:v}))} />
                    <InputField label="เบอร์โทร (Phone)" value={shopSettings.phone} onChange={v=>setShopSettings(p=>({...p, phone:v}))} />
                  </div>
                  <InputField label="ที่อยู่ (Address)" value={shopSettings.address} onChange={v=>setShopSettings(p=>({...p, address:v}))} isTextarea />
               </div>
               <div className="space-y-10">
                  <h4 className="text-sm font-black text-emerald-500 uppercase tracking-[0.5em] border-l-8 border-emerald-500 pl-8">Brand Identity</h4>
                  <div className="flex items-center gap-12 p-8 bg-slate-50 rounded-4xl border border-slate-100">
                     <div className="w-40 h-40 bg-white border-4 border-dashed border-slate-200 rounded-[3.5rem] flex items-center justify-center overflow-hidden shadow-inner group">
                        {shopSettings.logoType === 'image' ? <img src={shopSettings.logo} className="w-full h-full object-cover" /> : <span className="text-7xl group-hover:scale-125 transition-transform">{shopSettings.logo}</span>}
                     </div>
                     <div className="flex-1 space-y-6">
                        <div className="flex gap-4">
                           <input placeholder="Emoji..." className="flex-1 px-8 py-5 bg-white border-2 rounded-3xl text-xl font-bold outline-none focus:ring-8 focus:ring-primary/10 transition-all" 
                             onChange={(e) => { if(e.target.value) setShopSettings(p=>({...p, logo: e.target.value, logoType: 'emoji'})); }}
                           />
                           <button onClick={() => logoInputRef.current?.click()} className="px-10 py-5 bg-dark text-white rounded-3xl text-xs font-black uppercase tracking-[0.2em] hover:bg-black transition-all">Upload Photo</button>
                           <input type="file" ref={logoInputRef} className="hidden" accept="image/*" onChange={(e) => {
                             const file = e.target.files?.[0];
                             if(file) {
                               const reader = new FileReader();
                               reader.onloadend = () => setShopSettings(p => ({ ...p, logo: reader.result as string, logoType: 'image' }));
                               reader.readAsDataURL(file);
                             }
                           }} />
                        </div>
                     </div>
                  </div>
               </div>
               <button onClick={() => alert('Settings Saved!')} className="w-full bg-primary text-white py-8 rounded-5xl font-black text-xl shadow-2xl shadow-primary/30 hover:bg-secondary transition-all uppercase tracking-[0.4em]">Update Settings</button>
            </div>
          )}
        </main>
      </div>

      {/* MODAL: ADD PRODUCT */}
      {(showAddProduct || editingProduct) && (
        <div className="fixed inset-0 bg-dark/60 backdrop-blur-2xl z-[100] flex items-center justify-center p-12">
           <form onSubmit={(e) => {
             e.preventDefault();
             const fd = new FormData(e.currentTarget);
             const id = (fd.get('id') as string).trim();
             const np: Product = { id, name: fd.get('name') as string, cost: parseFloat(fd.get('cost') as string) || 0, price: parseFloat(fd.get('price') as string) || 0, stock: parseInt(fd.get('stock') as string) || 0, category: fd.get('category') as string };
             if (editingProduct) setProducts(p => p.map(x => x.id === editingProduct.id ? np : x));
             else { if (products.some(x=>x.id===id)) return alert('Duplicate ID!'); setProducts(p => [...p, np]); }
             setShowAddProduct(false); setEditingProduct(null);
           }} className="bg-white w-full max-w-2xl rounded-5xl p-16 shadow-2xl space-y-10 animate-in zoom-in duration-300">
              <h3 className="text-3xl font-black text-slate-800 uppercase tracking-tighter">{editingProduct ? 'Edit Item' : 'New Product'}</h3>
              <InputField name="id" defaultValue={editingProduct?.id} label="Product ID" required placeholder="Ex: BAG-001" />
              <InputField name="name" defaultValue={editingProduct?.name} label="Display Name" required />
              <div className="grid grid-cols-2 gap-8">
                 <InputField name="cost" type="number" defaultValue={editingProduct?.cost} label="Unit Cost" />
                 <InputField name="price" type="number" defaultValue={editingProduct?.price} label="Price" required />
              </div>
              <div className="grid grid-cols-2 gap-8">
                 <InputField name="stock" type="number" defaultValue={editingProduct?.stock} label="Current Stock" required />
                 <SelectField name="category" label="Category" defaultValue={editingProduct?.category || 'General'}>
                    {CATEGORIES.filter(c=>c!=='All').map(c => <option key={c} value={c}>{c}</option>)}
                 </SelectField>
              </div>
              <div className="flex gap-8 mt-12 pt-4">
                 <button type="button" onClick={() => { setShowAddProduct(false); setEditingProduct(null); }} className="flex-1 text-slate-400 font-black uppercase text-sm tracking-[0.4em] hover:text-danger">Cancel</button>
                 <button type="submit" className="flex-1 py-8 bg-primary text-white rounded-4xl font-black text-lg shadow-2xl transition-all uppercase tracking-[0.2em]">Save Product</button>
              </div>
           </form>
        </div>
      )}

    </div>
  );
};

const MetricCard = ({ title, value, icon, color }: any) => {
  const themes: any = {
    indigo: 'from-indigo-500 to-primary text-white',
    emerald: 'from-emerald-400 to-emerald-600 text-white',
    sky: 'from-sky-400 to-sky-600 text-white',
    slate: 'from-slate-600 to-dark text-white'
  };
  return (
    <div className={`p-10 rounded-4xl bg-gradient-to-br ${themes[color]} shadow-2xl relative group hover:-translate-y-4 transition-all duration-300`}>
      <div className="text-5xl mb-8 group-hover:scale-110 transition-transform origin-left">{icon}</div>
      <p className="text-[10px] font-black uppercase opacity-70 tracking-[0.4em] mb-3">{title}</p>
      <p className="text-4xl font-black tracking-tighter">{value.toLocaleString()}</p>
    </div>
  );
};

const InputField = ({ label, isTextarea, name, ...props }: any) => (
  <div className="space-y-3">
    <label className="text-xs font-black text-slate-400 uppercase ml-6 tracking-widest">{label}</label>
    {isTextarea ? (
      <textarea rows={2} className="w-full px-8 py-6 bg-slate-50 border-2 border-slate-100 rounded-3xl text-lg font-bold outline-none focus:ring-8 focus:ring-primary/10 transition-all shadow-inner" {...props} />
    ) : (
      <input type="text" className="w-full px-8 py-6 bg-slate-50 border-2 border-slate-100 rounded-3xl text-lg font-bold outline-none focus:ring-8 focus:ring-primary/10 transition-all shadow-inner" {...props} />
    )}
  </div>
);

const SelectField = ({ label, children, ...props }: any) => (
  <div className="space-y-3">
    <label className="text-xs font-black text-slate-400 uppercase ml-6 tracking-widest">{label}</label>
    <select className="w-full px-8 py-6 bg-slate-50 border-2 border-slate-100 rounded-3xl text-lg font-bold outline-none focus:ring-8 focus:ring-primary/10 transition-all appearance-none shadow-inner" {...props}>
      {children}
    </select>
  </div>
);

export default App;
