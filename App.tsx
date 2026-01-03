
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Product, CartItem, Discount, DiscountType, View, Transaction, ShopSettings, Language, PaymentStatus, PaymentMethod, ShippingCarrier } from './types';
import { PRODUCTS as INITIAL_PRODUCTS, CATEGORIES, TRANSLATIONS } from './constants';
import { ProductCard } from './components/ProductCard';
import { DiscountSelector } from './components/DiscountSelector';
import { GoogleGenAI } from "@google/genai";

const App: React.FC = () => {
  // --- HELPER FOR SAFE STORAGE ---
  const getSafeStorage = (key: string, defaultValue: any) => {
    try {
      const saved = localStorage.getItem(key);
      if (!saved) return defaultValue;
      return JSON.parse(saved);
    } catch (e) {
      console.warn(`Storage Reset for ${key}: Data was corrupted.`);
      return defaultValue;
    }
  };

  // --- 1. CORE STATE ---
  const [lang, setLang] = useState<Language>(() => (localStorage.getItem('pos_lang') as Language) || 'TH');
  const [currentView, setCurrentView] = useState<View>(() => (localStorage.getItem('pos_view') as View) || 'dashboard');
  
  const [shopSettings, setShopSettings] = useState<ShopSettings>(() => getSafeStorage('pos_shop_settings', {
    name: 'Gemini POS Pro',
    address: 'Skyline Plaza, Vientiane',
    phone: '020-XXXX-XXXX',
    logo: '💎',
    logoType: 'emoji'
  }));

  const [products, setProducts] = useState<Product[]>(() => getSafeStorage('pos_products', INITIAL_PRODUCTS));

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = getSafeStorage('pos_transactions', []);
    return saved.map((tx: any) => ({ 
      ...tx, 
      timestamp: tx.timestamp ? new Date(tx.timestamp) : new Date() 
    }));
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const t = TRANSLATIONS[lang] || TRANSLATIONS.EN;

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
    const totalProfit = active.reduce((a, b) => a + (b.profit || 0), 0);
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
        return alert(`สต็อกไม่พอ: ${item.name}`);
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

  const getAiAdvice = async () => {
    if (cart.length === 0) return;
    setIsAiLoading(true);
    
    try {
      // Use process.env.API_KEY directly to initialize GoogleGenAI client as per guidelines
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      const cartDesc = cart.map(i => `${i.name} x${i.quantity}`).join(', ');
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Cart: ${cartDesc}. Suggest a logical POS discount deal. Short.`
      });
      setAiAdvice(response.text || '');
    } catch (e) { 
      setAiAdvice('AI unreachable.'); 
    } finally { 
      setIsAiLoading(false); 
    }
  };

  const importCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
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
        alert('Import Success');
      } catch (err) {
        alert('CSV Format Error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Added missing clearInventory function to wipe products stock list
  const clearInventory = () => {
    if (window.confirm('Are you sure you want to clear all products from inventory?')) {
      setProducts([]);
    }
  };

  // --- 7. UI RENDER ---
  const NavItem = ({ view, icon, label }: any) => (
    <button onClick={() => setCurrentView(view)} className={`w-full flex items-center gap-5 px-8 py-5 rounded-4xl text-[14px] font-black transition-all duration-300 ${currentView === view ? 'bg-primary text-white shadow-2xl scale-105' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}>
      <span className="text-2xl">{icon}</span><span>{label}</span>
    </button>
  );

  return (
    <div className="flex h-screen overflow-hidden text-slate-800 font-sans bg-[#f8fafc]">
      
      {/* 🧾 PRINT LAYER */}
      <div id="print-area" className={`${printingTx ? 'block' : 'hidden'} print:block fixed inset-0 bg-white z-[9999] p-10 font-mono text-sm`}>
        {printingTx && (
          <div className="max-w-[80mm] mx-auto text-center">
            <h2 className="text-2xl font-black uppercase mb-1">{shopSettings.name}</h2>
            <p className="text-[10px] opacity-60 mb-4">{shopSettings.address}</p>
            <div className="border-y border-black/20 py-4 text-left space-y-1 mb-4">
              <p>Invoice: {printingTx.id}</p>
              <p>Date: {printingTx.timestamp.toLocaleString()}</p>
            </div>
            <table className="w-full text-left mb-6">
              <thead><tr className="border-b border-black font-bold"><th>Item</th><th className="text-right">Qty</th><th className="text-right">Price</th></tr></thead>
              <tbody>
                {printingTx.items.map(it => (
                  <tr key={it.id} className="border-b border-dotted border-black/10">
                    <td className="py-2">{it.name}</td>
                    <td className="text-right py-2">{it.quantity.toLocaleString()}</td>
                    <td className="text-right py-2">{(it.price * it.quantity).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-right border-t-2 border-black pt-2">
              <p className="text-xl font-bold">TOTAL: {printingTx.total.toLocaleString()} LAK</p>
            </div>
          </div>
        )}
      </div>

      {/* 📁 SIDEBAR */}
      <aside className="w-80 bg-dark text-slate-300 flex flex-col shrink-0 shadow-2xl z-20">
        <div className="p-12 flex flex-col items-center">
          <div className="w-20 h-20 bg-gradient-to-tr from-primary to-accent rounded-5xl mb-6 flex items-center justify-center shadow-3xl shadow-primary/40 ring-4 ring-white/5 animate-float overflow-hidden">
             {shopSettings.logoType === 'image' ? <img src={shopSettings.logo} className="w-full h-full object-cover" /> : <span className="text-4xl">{shopSettings.logo}</span>}
          </div>
          <h1 className="text-[9px] font-black text-white text-center uppercase tracking-[0.6em] opacity-80">{shopSettings.name}</h1>
        </div>
        <nav className="flex-1 px-6 space-y-2">
          <NavItem view="dashboard" icon="⚡" label={t.dashboard} />
          <NavItem view="pos" icon="🛍️" label={t.pos} />
          <NavItem view="stock" icon="📦" label={t.stock} />
          <NavItem view="reports" icon="📝" label={t.reports} />
          <NavItem view="settings" icon="⚙️" label={t.settings} />
        </nav>
        <div className="p-8 border-t border-white/5 flex flex-col gap-4">
           <div className="flex justify-center gap-2">
             {['TH','LA','EN'].map(l => <button key={l} onClick={()=>setLang(l as any)} className={`px-4 py-2 rounded-2xl text-[9px] font-black tracking-widest transition-all ${lang === l ? 'bg-primary text-white' : 'hover:bg-white/5'}`}>{l}</button>)}
           </div>
           <button onClick={() => { if(confirm('Factory Reset?')) { localStorage.clear(); location.reload(); }}} className="text-[9px] font-black text-danger/50 hover:text-danger uppercase tracking-widest text-center">Reset System</button>
        </div>
      </aside>

      {/* 💻 MAIN */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="h-24 glass border-b border-slate-200/50 px-12 flex items-center justify-between z-10 shrink-0">
          <div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">{t[currentView]}</h2>
            <p className="text-[9px] font-black uppercase tracking-widest opacity-40">System Online</p>
          </div>
          <div className="flex items-center gap-6">
             {pendingEditId && <div className="bg-amber-100 text-amber-700 px-6 py-2 rounded-full text-[10px] font-black border border-amber-200 animate-pulse">EDITING: #{pendingEditId.split('-')[1]}</div>}
             <div className="text-right">
               <p className="text-xs font-black">{new Date().toLocaleDateString()}</p>
             </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-12 scrollbar-hide">
          
          {currentView === 'dashboard' && (
            <div className="space-y-12 animate-in fade-in duration-700">
               <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                  <MetricCard title={t.total_sales} value={analytics.totalSales} icon="💰" color="indigo" />
                  <MetricCard title="กำไรสุทธิ" value={analytics.totalProfit} icon="✨" color="emerald" />
                  <MetricCard title="มูลค่าสต็อก" value={analytics.stockValue} icon="📊" color="sky" />
                  <MetricCard title="บิลทั้งหมด" value={transactions.length} icon="🧾" color="slate" />
               </div>
               <div className="bg-white p-10 rounded-5xl border border-slate-200/50 shadow-2xl">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-10">Sales Analytics</h3>
                  <div className="h-72 flex items-end justify-between gap-4 px-4">
                     {analytics.monthlyData.map((d, i) => {
                       const max = Math.max(...analytics.monthlyData.map(m => m.sales), 1);
                       const h = (d.sales / max) * 100;
                       return (
                         <div key={i} className="flex-1 flex flex-col items-center gap-4 group">
                           <div style={{ height: `${h}%` }} className="w-full bg-slate-100 group-hover:bg-primary rounded-3xl transition-all duration-700 relative">
                               <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-[9px] font-black opacity-0 group-hover:opacity-100 transition-all">{d.sales.toLocaleString()}</div>
                           </div>
                           <span className="text-[10px] font-black text-slate-300 uppercase">{d.month}</span>
                         </div>
                       );
                     })}
                  </div>
               </div>
            </div>
          )}

          {currentView === 'pos' && (
            <div className="flex h-full gap-10 animate-in slide-in-from-right duration-500 overflow-hidden">
               <div className="flex-1 flex flex-col min-w-0">
                  <div className="flex gap-2 mb-8 overflow-x-auto pb-4 scrollbar-hide">
                    {CATEGORIES.map(cat => <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-8 py-3 rounded-4xl text-[10px] font-black uppercase transition-all shrink-0 ${selectedCategory === cat ? 'bg-primary text-white shadow-xl' : 'bg-white text-slate-400 border border-slate-100'}`}>{cat}</button>)}
                  </div>
                  <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6 overflow-y-auto pb-32 scrollbar-hide">
                    {products.filter(p => selectedCategory === 'All' || p.category === selectedCategory).map(p => (
                      <ProductCard key={p.id} product={p} onAdd={(pd) => setCart(prev => {
                        const ex = prev.find(i => i.id === pd.id);
                        if (ex) return prev.map(i => i.id === pd.id ? {...i, quantity: i.quantity + 1} : i);
                        return [...prev, {...pd, quantity: 1}];
                      })} />
                    ))}
                  </div>
               </div>
               <aside className="w-[34rem] bg-white border border-slate-200/50 flex flex-col rounded-5xl shadow-2xl overflow-hidden shrink-0">
                  <div className="p-8 border-b bg-slate-50 flex justify-between items-center">
                    <h3 className="font-black text-slate-800 text-[11px] uppercase tracking-widest">Order Summary</h3>
                    <button onClick={() => { if(confirm('Clear?')) resetPOS(); }} className="text-[10px] font-black text-danger">🗑️ CLEAR</button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-8 space-y-6 scrollbar-hide">
                    {cart.map(item => (
                      <div key={item.id} className="bg-slate-50/50 p-5 rounded-3xl border border-slate-100 flex flex-col gap-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1"><p className="font-black text-slate-800 text-lg">{item.name}</p></div>
                          <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-2xl border border-slate-100 shadow-sm">
                            <button onClick={()=>setCart(p=>p.map(i=>i.id===item.id?{...i,quantity:Math.max(0,i.quantity-1)}:i).filter(i=>i.quantity>0))} className="font-black text-slate-300 hover:text-danger">-</button>
                            <input type="number" value={item.quantity} onChange={(e)=>setCart(p=>p.map(i=>i.id===item.id?{...i, quantity: Math.max(0, parseInt(e.target.value)||0)}:i).filter(i=>i.quantity>0))} className="w-16 text-center font-black text-primary bg-transparent outline-none" />
                            <button onClick={()=>setCart(p=>p.map(i=>i.id===item.id?{...i,quantity:i.quantity+1}:i))} className="font-black text-slate-300 hover:text-primary">+</button>
                          </div>
                        </div>
                        <p className="text-right font-black text-slate-900">{(item.price * item.quantity).toLocaleString()} LAK</p>
                      </div>
                    ))}
                    {cart.length > 0 && (
                      <div className="space-y-6 pt-6 animate-in fade-in">
                         <InputField label="Customer Name" value={customer.name} onChange={v=>setCustomer(p=>({...p, name:v}))} />
                         <div className="grid grid-cols-2 gap-4">
                           <SelectField label="Shipping" value={shipping.carrier} onChange={v=>setShipping(p=>({...p, carrier:v as any}))}>
                              <option value="">Standard</option><option value="roung_aloun">Roung Aloun</option><option value="pickup">Pickup</option>
                           </SelectField>
                           <SelectField label="Payment" value={payment.method} onChange={v=>setPayment(p=>({...p, method:v as any}))}>
                              <option value="transfer">Transfer</option><option value="cash">Cash</option>
                           </SelectField>
                         </div>
                         <DiscountSelector currentDiscount={discount} onApply={setDiscount} />
                         <div className="bg-indigo-50 p-5 rounded-3xl border border-indigo-100 flex flex-col gap-3">
                           <div className="flex justify-between items-center">
                             <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">✨ AI Deal Finder</span>
                             <button onClick={getAiAdvice} disabled={isAiLoading} className="text-[9px] font-black bg-white px-3 py-1 rounded-xl shadow-sm hover:scale-105 transition-all">{isAiLoading?'...':'ASK AI'}</button>
                           </div>
                           {aiAdvice && <p className="text-xs font-bold text-slate-600 italic leading-relaxed">"{aiAdvice}"</p>}
                         </div>
                      </div>
                    )}
                  </div>
                  {cart.length > 0 && (
                    <div className="p-8 bg-slate-50 border-t-2">
                       <div className="flex justify-between items-end mb-8">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Payable Total:</span>
                          <p className="text-5xl font-black text-primary tracking-tighter">{summary.total.toLocaleString()} <span className="text-xs font-bold ml-1">LAK</span></p>
                       </div>
                       <button onClick={handleApproveBill} className="w-full py-6 rounded-4xl font-black text-lg bg-primary text-white shadow-3xl shadow-primary/30 hover:bg-secondary active:scale-95 transition-all uppercase tracking-widest">
                          {pendingEditId ? 'Update Bill' : 'Approve & Print'}
                       </button>
                    </div>
                  )}
               </aside>
            </div>
          )}

          {currentView === 'stock' && (
            <div className="space-y-10 animate-in fade-in duration-500">
               <div className="flex justify-between items-center">
                  <div className="flex gap-4">
                    <button onClick={() => { setEditingProduct(null); setShowAddProduct(true); }} className="bg-primary text-white px-8 py-4 rounded-4xl font-black text-[11px] shadow-xl hover:bg-secondary transition-all uppercase">+ NEW PRODUCT</button>
                    <button onClick={() => fileInputRef.current?.click()} className="bg-white text-emerald-600 border-2 border-emerald-50 px-8 py-4 rounded-4xl font-black text-[11px] hover:bg-emerald-50 uppercase tracking-widest">📥 IMPORT CSV</button>
                    <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={importCsv} />
                  </div>
                  <button onClick={clearInventory} className="bg-white text-danger border-2 border-rose-100 px-8 py-4 rounded-4xl font-black text-[11px] hover:bg-rose-50 uppercase tracking-widest">🗑️ WIPE STOCK</button>
               </div>
               <div className="bg-white rounded-5xl border border-slate-200/50 shadow-2xl overflow-hidden overflow-x-auto">
                  <table className="w-full text-left min-w-[1000px]">
                     <thead className="bg-slate-50 border-b-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]"><tr className="border-b"><th className="px-10 py-8">ID</th><th className="px-10 py-8">Product Details</th><th className="px-10 py-8 text-right">Selling Price</th><th className="px-10 py-8 text-right">Available Stock</th><th className="px-10 py-8 text-center">Actions</th></tr></thead>
                     <tbody className="divide-y text-sm font-bold text-slate-600 divide-slate-100">
                        {products.map(p => (
                          <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-10 py-6 font-mono text-primary">#{p.id}</td>
                            <td className="px-10 py-6">
                               <p className="text-slate-900 font-black text-lg">{p.name}</p>
                               <span className="text-[9px] font-black text-slate-400 uppercase bg-slate-100 px-3 py-1 rounded-lg">{p.category}</span>
                            </td>
                            <td className="px-10 py-6 text-right font-black text-slate-900 text-lg">{p.price.toLocaleString()}</td>
                            <td className={`px-10 py-6 text-right font-black text-lg ${p.stock < 10 ? 'text-danger' : 'text-slate-800'}`}>{p.stock.toLocaleString()}</td>
                            <td className="px-10 py-6 text-center flex justify-center gap-3">
                               <button onClick={() => { setEditingProduct(p); setShowAddProduct(true); }} className="w-11 h-11 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center hover:bg-amber-500 hover:text-white transition-all shadow-sm">✏️</button>
                               <button onClick={() => { if(confirm('Delete?')) setProducts(ps=>ps.filter(x=>x.id!==p.id))}} className="w-11 h-11 bg-rose-50 text-danger rounded-2xl flex items-center justify-center hover:bg-danger hover:text-white transition-all shadow-sm">🗑️</button>
                            </td>
                          </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </div>
          )}

          {currentView === 'settings' && (
            <div className="max-w-3xl animate-in zoom-in-95 bg-white p-16 rounded-5xl border border-slate-200/50 shadow-2xl space-y-12 mx-auto">
               <div className="space-y-8">
                  <h4 className="text-[10px] font-black text-primary uppercase tracking-[0.5em] border-l-4 border-primary pl-4">General Settings</h4>
                  <div className="grid grid-cols-2 gap-8">
                    <InputField label="Shop Name" value={shopSettings.name} onChange={v=>setShopSettings(p=>({...p, name:v}))} />
                    <InputField label="Contact Phone" value={shopSettings.phone} onChange={v=>setShopSettings(p=>({...p, phone:v}))} />
                  </div>
                  <InputField label="Physical Address" value={shopSettings.address} onChange={v=>setShopSettings(p=>({...p, address:v}))} isTextarea />
               </div>
               <button onClick={() => alert('Settings Saved!')} className="w-full bg-primary text-white py-6 rounded-4xl font-black text-lg shadow-2xl hover:bg-secondary transition-all uppercase tracking-[0.3em]">Save All Changes</button>
            </div>
          )}
        </main>
      </div>

      {/* MODAL */}
      {(showAddProduct || editingProduct) && (
        <div className="fixed inset-0 bg-dark/60 backdrop-blur-2xl z-[100] flex items-center justify-center p-12">
           <form onSubmit={(e) => {
             e.preventDefault();
             const fd = new FormData(e.currentTarget);
             const id = (fd.get('id') as string).trim();
             const np: Product = { id, name: fd.get('name') as string, cost: parseFloat(fd.get('cost') as string) || 0, price: parseFloat(fd.get('price') as string) || 0, stock: parseInt(fd.get('stock') as string) || 0, category: fd.get('category') as string };
             if (editingProduct) setProducts(p => p.map(x => x.id === editingProduct.id ? np : x));
             else setProducts(p => [...p, np]);
             setShowAddProduct(false); setEditingProduct(null);
           }} className="bg-white w-full max-w-xl rounded-5xl p-12 shadow-2xl space-y-8 animate-in zoom-in duration-300">
              <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">{editingProduct ? 'Update Product' : 'Add New Product'}</h3>
              <InputField name="id" defaultValue={editingProduct?.id} label="Product ID" required />
              <InputField name="name" defaultValue={editingProduct?.name} label="Name" required />
              <div className="grid grid-cols-2 gap-6">
                 <InputField name="price" type="number" defaultValue={editingProduct?.price} label="Selling Price" required />
                 <InputField name="stock" type="number" defaultValue={editingProduct?.stock} label="Current Stock" required />
              </div>
              <div className="flex gap-6 mt-8">
                 <button type="button" onClick={() => { setShowAddProduct(false); setEditingProduct(null); }} className="flex-1 text-slate-400 font-black uppercase text-[10px] tracking-widest">Discard</button>
                 <button type="submit" className="flex-1 py-6 bg-primary text-white rounded-4xl font-black text-md shadow-2xl transition-all uppercase tracking-widest">Save Changes</button>
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
    <div className={`p-8 rounded-4xl bg-gradient-to-br ${themes[color]} shadow-xl relative group hover:-translate-y-2 transition-all duration-300`}>
      <div className="text-4xl mb-6 group-hover:scale-110 transition-transform origin-left">{icon}</div>
      <p className="text-[9px] font-black uppercase opacity-70 tracking-widest mb-2">{title}</p>
      <p className="text-3xl font-black tracking-tighter">{value.toLocaleString()}</p>
    </div>
  );
};

const InputField = ({ label, isTextarea, name, ...props }: any) => (
  <div className="space-y-2">
    <label className="text-[10px] font-black text-slate-400 uppercase ml-4 tracking-widest">{label}</label>
    {isTextarea ? (
      <textarea rows={2} className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-3xl text-md font-bold outline-none focus:ring-4 focus:ring-primary/10 transition-all shadow-inner" {...props} />
    ) : (
      <input type="text" className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-3xl text-md font-bold outline-none focus:ring-4 focus:ring-primary/10 transition-all shadow-inner" {...props} />
    )}
  </div>
);

const SelectField = ({ label, children, ...props }: any) => (
  <div className="space-y-2">
    <label className="text-[10px] font-black text-slate-400 uppercase ml-4 tracking-widest">{label}</label>
    <select className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-3xl text-md font-bold outline-none focus:ring-4 focus:ring-primary/10 transition-all appearance-none shadow-inner" {...props}>
      {children}
    </select>
  </div>
);

export default App;
