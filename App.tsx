
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Product, CartItem, Discount, DiscountType, View, Transaction, ShopSettings, Language, PaymentStatus, PaymentMethod, ShippingCarrier, Promotion } from './types.ts';
import { PRODUCTS as INITIAL_PRODUCTS, CATEGORIES, TRANSLATIONS } from './constants.tsx';
import { ProductCard } from './components/ProductCard.tsx';
import { DiscountSelector } from './components/DiscountSelector.tsx';

const App: React.FC = () => {
  // --- STORAGE ---
  const getSafeStorage = useCallback((key: string, defaultValue: any) => {
    try {
      const saved = localStorage.getItem(key);
      if (!saved) return defaultValue;
      return JSON.parse(saved);
    } catch (e) {
      return defaultValue;
    }
  }, []);

  // --- STATE ---
  const [lang, setLang] = useState<Language>(() => (localStorage.getItem('pos_lang') as Language) || 'TH');
  const [currentView, setCurrentView] = useState<View>(() => (localStorage.getItem('pos_view') as View) || 'dashboard');
  const [shopSettings, setShopSettings] = useState<ShopSettings>(() => getSafeStorage('pos_shop_settings', {
    name: 'Coffee Please POS',
    address: 'Vientiane Capital, Laos',
    phone: '020-XXXX-XXXX',
    logo: '💎',
    logoType: 'emoji'
  }));
  const [products, setProducts] = useState<Product[]>(() => getSafeStorage('pos_products', INITIAL_PRODUCTS));
  const [promotions, setPromotions] = useState<Promotion[]>(() => getSafeStorage('pos_promotions', []));
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = getSafeStorage('pos_transactions', []);
    return saved.map((tx: any) => ({ ...tx, timestamp: tx.timestamp ? new Date(tx.timestamp) : new Date() }));
  });

  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState<Discount | null>(null);
  const [customer, setCustomer] = useState({ name: '', phone: '', address: '' });
  const [payment, setPayment] = useState({ status: 'paid' as PaymentStatus, method: 'transfer' as PaymentMethod });
  const [shipping, setShipping] = useState({ carrier: '' as ShippingCarrier, branch: '' });
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const t = useMemo(() => TRANSLATIONS[lang] || TRANSLATIONS.EN, [lang]);

  // --- PERSISTENCE ---
  useEffect(() => { localStorage.setItem('pos_products', JSON.stringify(products)); }, [products]);
  useEffect(() => { localStorage.setItem('pos_transactions', JSON.stringify(transactions)); }, [transactions]);
  useEffect(() => { localStorage.setItem('pos_shop_settings', JSON.stringify(shopSettings)); }, [shopSettings]);
  useEffect(() => { localStorage.setItem('pos_promotions', JSON.stringify(promotions)); }, [promotions]);
  useEffect(() => { localStorage.setItem('pos_lang', lang); }, [lang]);
  useEffect(() => { localStorage.setItem('pos_view', currentView); }, [currentView]);

  // --- PRINT CORE ---
  const printAction = (tx: Transaction) => {
    const printEl = document.getElementById('print-receipt');
    if (printEl) {
      printEl.innerHTML = generateReceiptHTML(tx);
      // Timeout is essential to allow DOM to render before print dialog opens
      setTimeout(() => {
        window.print();
      }, 250);
    }
  };

  const generateReceiptHTML = (tx: Transaction) => {
    const itemsRows = tx.items.map(it => `
      <tr style="border-bottom: 1px dotted #ccc; font-size: 10pt;">
        <td style="padding: 4px 0;">${it.name}</td>
        <td style="text-align: right;">${it.quantity}</td>
        <td style="text-align: right;">${(it.price * it.quantity).toLocaleString()}</td>
      </tr>
    `).join('');

    return `
      <div style="width: 58mm; padding: 10px; color: black; background: white; font-family: sans-serif;">
        <div style="text-align: center; margin-bottom: 10px;">
          <h2 style="margin: 0; font-size: 14pt;">${shopSettings.name}</h2>
          <p style="font-size: 8pt; margin: 2px 0;">${shopSettings.address}</p>
          <p style="font-size: 8pt; margin: 0;">Tel: ${shopSettings.phone}</p>
        </div>
        <div style="font-size: 8pt; margin: 10px 0; border-top: 1px solid #000; padding-top: 5px;">
          <p>INV: ${tx.id}</p>
          <p>DATE: ${tx.timestamp.toLocaleString()}</p>
          <p>PAY: ${tx.paymentMethod.toUpperCase()} (${tx.status.toUpperCase()})</p>
        </div>
        <table style="width: 100%; border-collapse: collapse;">
          <thead style="border-bottom: 1px solid #000; font-size: 9pt;">
            <tr><th align="left">ITEM</th><th align="right">QTY</th><th align="right">LAK</th></tr>
          </thead>
          <tbody>${itemsRows}</tbody>
        </table>
        <div style="text-align: right; margin-top: 10px; border-top: 1px solid #000; padding-top: 5px;">
          ${tx.billDiscountAmount > 0 ? `<p style="font-size: 9pt; margin:0;">Discount: -${tx.billDiscountAmount.toLocaleString()}</p>` : ''}
          <h3 style="margin: 5px 0; font-size: 12pt;">TOTAL: ${tx.total.toLocaleString()}</h3>
        </div>
        <p style="text-align: center; font-size: 7pt; margin-top: 15px;">--- Thank You ---</p>
      </div>
    `;
  };

  // --- ACTIONS ---
  const handleApproveBill = () => {
    if (cart.length === 0) return;
    const newTx: Transaction = {
      id: `INV-${Date.now()}`,
      timestamp: new Date(),
      items: cart,
      status: 'completed',
      paymentStatus: payment.status,
      paymentMethod: payment.method,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerAddress: customer.address,
      shippingCarrier: shipping.carrier,
      shippingBranch: shipping.branch,
      appliedDiscount: discount,
      ...summary
    };

    setProducts(prev => prev.map(p => {
      const inCart = cart.find(i => i.id === p.id);
      return inCart ? { ...p, stock: p.stock - inCart.quantity } : p;
    }));
    setTransactions([newTx, ...transactions]);
    printAction(newTx);
    resetPOS();
  };

  const handleCancelBill = (txId: string) => {
    const tx = transactions.find(t => t.id === txId);
    if (!tx || tx.status === 'cancelled') return;
    if (!confirm('ยืนยันยกเลิกบิลนี้และคืนสต็อกสินค้า?')) return;

    // Return stock
    setProducts(prev => prev.map(p => {
      const soldItem = tx.items.find(it => it.id === p.id);
      return soldItem ? { ...p, stock: p.stock + soldItem.quantity } : p;
    }));

    // Update status
    setTransactions(prev => prev.map(t => t.id === txId ? { ...t, status: 'cancelled' } : t));
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split(/\r?\n/).filter(line => line.trim());
        const importedProducts: Product[] = [];
        
        for (let i = 1; i < lines.length; i++) {
          const columns = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
          if (columns.length < 5) continue;
          
          importedProducts.push({
            id: columns[0] || `CSV-${Date.now()}-${i}`,
            name: columns[1] || 'Unknown Item',
            cost: parseFloat(columns[2]) || 0,
            price: parseFloat(columns[3]) || 0,
            stock: parseInt(columns[4]) || 0,
            category: columns[5] || 'General'
          });
        }
        
        setProducts(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const onlyNew = importedProducts.filter(p => !existingIds.has(p.id));
          return [...prev, ...onlyNew];
        });
        alert(`นำเข้าสำเร็จ ${importedProducts.length} รายการ`);
      } catch (err) {
        alert('เกิดข้อผิดพลาดในการอ่านไฟล์ กรุณาตรวจสอบรูปแบบ CSV');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  const resetPOS = () => {
    setCart([]); setDiscount(null);
    setCustomer({ name: '', phone: '', address: '' });
    setPayment({ status: 'paid', method: 'transfer' });
    setShipping({ carrier: '', branch: '' });
  };

  const summary = useMemo(() => {
    const subtotal = cart.reduce((acc, it) => acc + (it.price * it.quantity), 0);
    const costTotal = cart.reduce((acc, it) => acc + (it.cost * it.quantity), 0);
    const billDiscountAmt = discount ? (discount.type === DiscountType.PERCENTAGE ? (subtotal * discount.value / 100) : discount.value) : 0;
    const total = Math.max(0, subtotal - billDiscountAmt);
    return { subtotal, total, billDiscountAmount: billDiscountAmt, profit: total - costTotal, itemDiscountTotal: 0 };
  }, [cart, discount]);

  const analytics = useMemo(() => {
    return transactions.reduce((acc, tx) => {
      if (tx.status === 'completed') {
        acc.totalSales += tx.total;
        acc.totalProfit += tx.profit;
      }
      return acc;
    }, { totalSales: 0, totalProfit: 0 });
  }, [transactions]);

  const NavItem = ({ view, icon, label }: any) => (
    <button onClick={() => setCurrentView(view)} className={`w-full flex items-center gap-5 px-8 py-5 rounded-4xl text-[14px] font-black transition-all ${currentView === view ? 'bg-primary text-white shadow-2xl' : 'text-slate-400 hover:bg-white/10'}`}>
      <span className="text-2xl">{icon}</span><span>{label}</span>
    </button>
  );

  return (
    <div className="flex h-screen overflow-hidden text-slate-800 bg-[#f8fafc]">
      <aside className="w-80 bg-dark text-slate-300 flex flex-col shrink-0 z-20">
        <div className="p-12 flex flex-col items-center">
          <div className="w-20 h-20 bg-primary rounded-5xl flex items-center justify-center text-4xl shadow-xl">{shopSettings.logo || '☕'}</div>
          <h1 className="mt-4 text-xs font-black text-white text-center uppercase tracking-widest">{shopSettings.name}</h1>
        </div>
        <nav className="flex-1 px-6 space-y-2">
          <NavItem view="dashboard" icon="📊" label={t.dashboard} />
          <NavItem view="pos" icon="🛍️" label={t.pos} />
          <NavItem view="stock" icon="📦" label={t.stock} />
          <NavItem view="reports" icon="📝" label={t.reports} />
          <NavItem view="settings" icon="⚙️" label={t.settings} />
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-24 glass border-b px-12 flex items-center justify-between">
          <h2 className="text-2xl font-black uppercase tracking-tight">{t[currentView]}</h2>
          <span className="text-xs font-bold text-slate-400">{new Date().toLocaleDateString()}</span>
        </header>

        <main className="flex-1 overflow-y-auto p-12">
          {currentView === 'pos' && (
            <div className="flex h-full gap-8">
              <div className="flex-1 flex flex-col gap-6 overflow-hidden">
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                  {CATEGORIES.map(c => (
                    <button key={c} onClick={() => setSelectedCategory(c)} className={`px-6 py-3 rounded-full text-xs font-black uppercase transition-all shrink-0 ${selectedCategory === c ? 'bg-primary text-white' : 'bg-white border'}`}>{c}</button>
                  ))}
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto pb-20">
                  {products.filter(p => selectedCategory === 'All' || p.category === selectedCategory).map(p => (
                    <ProductCard key={p.id} product={p} onAdd={(pd) => setCart(prev => {
                      const ex = prev.find(i => i.id === pd.id);
                      if (ex) return prev.map(i => i.id === pd.id ? {...i, quantity: i.quantity + 1} : i);
                      return [...prev, {...pd, quantity: 1, originalPrice: pd.price}];
                    })} />
                  ))}
                </div>
              </div>

              <aside className="w-[400px] bg-white border rounded-4xl flex flex-col shadow-xl overflow-hidden shrink-0">
                <div className="p-6 border-b flex justify-between items-center bg-slate-50">
                   <h3 className="font-black text-xs uppercase">{t.order_summary}</h3>
                   <button onClick={resetPOS} className="text-danger text-[10px] font-black uppercase">Clear</button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {cart.map(item => (
                    <div key={item.id} className="flex items-center gap-3 bg-slate-50 p-3 rounded-2xl border">
                      <div className="flex-1">
                        <p className="font-black text-sm">{item.name}</p>
                        <p className="text-[10px] text-slate-400">{item.price.toLocaleString()} LAK</p>
                      </div>
                      <input 
                        type="number" 
                        className="w-12 text-center bg-white border rounded-lg font-black text-sm p-1"
                        value={item.quantity}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          setCart(p => p.map(i => i.id === item.id ? {...i, quantity: val} : i).filter(i => i.quantity > 0));
                        }}
                      />
                    </div>
                  ))}
                  {cart.length > 0 && (
                    <div className="pt-4 border-t space-y-4">
                      <div className="grid grid-cols-2 gap-2">
                        <input className="bg-slate-50 border p-3 rounded-xl text-xs" placeholder={t.customer_name} value={customer.name} onChange={e=>setCustomer(p=>({...p, name: e.target.value}))} />
                        <input className="bg-slate-50 border p-3 rounded-xl text-xs" placeholder={t.phone} value={customer.phone} onChange={e=>setCustomer(p=>({...p, phone: e.target.value}))} />
                      </div>
                      <DiscountSelector currentDiscount={discount} onApply={setDiscount} />
                    </div>
                  )}
                </div>
                {cart.length > 0 && (
                  <div className="p-6 bg-dark text-white">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-[10px] font-black uppercase opacity-60">Total</span>
                      <span className="text-2xl font-black">{summary.total.toLocaleString()} LAK</span>
                    </div>
                    <button onClick={handleApproveBill} className="w-full py-4 bg-primary rounded-2xl font-black uppercase tracking-widest text-sm shadow-lg">Checkout & Print</button>
                  </div>
                )}
              </aside>
            </div>
          )}

          {currentView === 'stock' && (
            <div className="space-y-6">
              <div className="flex gap-4">
                <button onClick={() => setShowAddProduct(true)} className="bg-primary text-white px-8 py-3 rounded-2xl font-black text-xs">+ Add SKU</button>
                <button onClick={() => fileInputRef.current?.click()} className="bg-white border px-8 py-3 rounded-2xl font-black text-xs uppercase">Import CSV</button>
                <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleImportCSV} />
              </div>
              <div className="bg-white rounded-3xl border overflow-hidden shadow-sm">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400">
                    <tr><th className="p-6">SKU</th><th className="p-6">Name</th><th className="p-6 text-right">Cost</th><th className="p-6 text-right">Price</th><th className="p-6 text-right">Stock</th><th className="p-6 text-center">Actions</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {products.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="p-6 text-xs font-mono">{p.id}</td>
                        <td className="p-6 font-black">{p.name}</td>
                        <td className="p-6 text-right text-slate-400 italic">{p.cost.toLocaleString()}</td>
                        <td className="p-6 text-right font-black">{p.price.toLocaleString()}</td>
                        <td className={`p-6 text-right font-black ${p.stock < 10 ? 'text-danger' : ''}`}>{p.stock}</td>
                        <td className="p-6 text-center">
                          <button onClick={()=>{setEditingProduct(p); setShowAddProduct(true);}} className="text-blue-500 mr-2">Edit</button>
                          <button onClick={()=>{if(confirm('ลบ?')) setProducts(ps=>ps.filter(x=>x.id!==p.id))}} className="text-danger">Del</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {currentView === 'reports' && (
            <div className="bg-white rounded-3xl border overflow-hidden shadow-xl">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400">
                   <tr><th className="p-6">Invoice</th><th className="p-6">Customer</th><th className="p-6 text-right">Total</th><th className="p-6">Status</th><th className="p-6 text-center">Actions</th></tr>
                </thead>
                <tbody className="divide-y">
                  {transactions.map(tx => (
                    <tr key={tx.id} className={tx.status === 'cancelled' ? 'opacity-40 grayscale' : ''}>
                      <td className="p-6"><p className="font-mono text-xs">#{tx.id.split('-')[1]}</p><p className="text-[10px]">{tx.timestamp.toLocaleString()}</p></td>
                      <td className="p-6 font-black">{tx.customerName || 'Standard'}</td>
                      <td className="p-6 text-right font-black">{tx.total.toLocaleString()}</td>
                      <td className="p-6"><span className={`text-[10px] font-black px-2 py-1 rounded-lg ${tx.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{tx.status.toUpperCase()}</span></td>
                      <td className="p-6 text-center flex justify-center gap-2">
                        <button onClick={() => printAction(tx)} className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200">🖨️</button>
                        {tx.status === 'completed' && (
                          <button onClick={() => handleCancelBill(tx.id)} className="p-2 bg-rose-50 text-danger rounded-lg hover:bg-rose-100">🚫</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {currentView === 'dashboard' && (
            <div className="grid grid-cols-2 gap-8">
               <div className="bg-primary p-12 rounded-5xl text-white shadow-xl">
                 <p className="text-xs uppercase font-black opacity-60">Total Revenue</p>
                 <p className="text-5xl font-black mt-4">{analytics.totalSales.toLocaleString()} LAK</p>
               </div>
               <div className="bg-dark p-12 rounded-5xl text-white shadow-xl">
                 <p className="text-xs uppercase font-black opacity-60">Total Profit</p>
                 <p className="text-5xl font-black mt-4">{analytics.totalProfit.toLocaleString()} LAK</p>
               </div>
            </div>
          )}

          {currentView === 'settings' && (
            <div className="bg-white p-12 rounded-5xl border shadow-xl max-w-2xl mx-auto space-y-8">
               <div className="space-y-4">
                 <label className="text-xs font-black uppercase text-slate-400">Store Name</label>
                 <input className="w-full p-4 bg-slate-50 border rounded-2xl font-black" value={shopSettings.name} onChange={e=>setShopSettings(p=>({...p, name: e.target.value}))} />
               </div>
               <div className="space-y-4">
                 <label className="text-xs font-black uppercase text-slate-400">Address</label>
                 <textarea className="w-full p-4 bg-slate-50 border rounded-2xl font-black" value={shopSettings.address} onChange={e=>setShopSettings(p=>({...p, address: e.target.value}))} />
               </div>
               <div className="space-y-4">
                 <label className="text-xs font-black uppercase text-slate-400">Phone</label>
                 <input className="w-full p-4 bg-slate-50 border rounded-2xl font-black" value={shopSettings.phone} onChange={e=>setShopSettings(p=>({...p, phone: e.target.value}))} />
               </div>
               <button onClick={()=>alert('Saved')} className="w-full py-5 bg-primary text-white rounded-3xl font-black uppercase tracking-widest shadow-lg">Save Profile</button>
            </div>
          )}
        </main>
      </div>

      {showAddProduct && (
        <div className="fixed inset-0 bg-dark/50 backdrop-blur-sm z-50 flex items-center justify-center p-6">
           <form onSubmit={(e) => {
             e.preventDefault();
             const fd = new FormData(e.currentTarget);
             const np: Product = {
               id: (fd.get('id') as string) || `SKU-${Date.now()}`,
               name: fd.get('name') as string,
               cost: parseFloat(fd.get('cost') as string) || 0,
               price: parseFloat(fd.get('price') as string) || 0,
               stock: parseInt(fd.get('stock') as string) || 0,
               category: fd.get('category') as string
             };
             if(editingProduct) setProducts(ps => ps.map(p => p.id === editingProduct.id ? np : p));
             else setProducts(ps => [...ps, np]);
             setShowAddProduct(false); setEditingProduct(null);
           }} className="bg-white p-10 rounded-5xl w-full max-w-lg shadow-2xl space-y-6">
              <h3 className="text-2xl font-black uppercase">{editingProduct ? 'Edit' : 'Add'} SKU</h3>
              <input name="id" defaultValue={editingProduct?.id} className="w-full p-4 bg-slate-50 border rounded-2xl" placeholder="SKU ID" required />
              <input name="name" defaultValue={editingProduct?.name} className="w-full p-4 bg-slate-50 border rounded-2xl" placeholder="Name" required />
              <div className="grid grid-cols-2 gap-4">
                <input name="cost" type="number" defaultValue={editingProduct?.cost} className="w-full p-4 bg-slate-50 border rounded-2xl" placeholder="Cost" />
                <input name="price" type="number" defaultValue={editingProduct?.price} className="w-full p-4 bg-slate-50 border rounded-2xl" placeholder="Price" required />
              </div>
              <input name="stock" type="number" defaultValue={editingProduct?.stock} className="w-full p-4 bg-slate-50 border rounded-2xl" placeholder="Stock Qty" required />
              <div className="flex gap-4">
                <button type="button" onClick={()=>{setShowAddProduct(false); setEditingProduct(null);}} className="flex-1 text-slate-400 font-black uppercase">Cancel</button>
                <button type="submit" className="flex-1 py-4 bg-primary text-white rounded-2xl font-black uppercase">Save</button>
              </div>
           </form>
        </div>
      )}
    </div>
  );
};

const InputField = ({ label, isTextarea, ...props }: any) => (
  <div className="space-y-2">
    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</label>
    {isTextarea ? (
      <textarea rows={2} className="w-full px-4 py-3 bg-slate-50 border rounded-2xl text-sm outline-none focus:ring-2 focus:ring-primary/20" {...props} />
    ) : (
      <input className="w-full px-4 py-3 bg-slate-50 border rounded-2xl text-sm outline-none focus:ring-2 focus:ring-primary/20" {...props} />
    )}
  </div>
);

const SelectField = ({ label, children, ...props }: any) => (
  <div className="space-y-2">
    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</label>
    <select className="w-full px-4 py-3 bg-slate-50 border rounded-2xl text-sm outline-none" {...props}>{children}</select>
  </div>
);

export default App;
