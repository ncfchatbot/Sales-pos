
import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, ShoppingCart, Package, ClipboardList, Settings, Tag, 
  Plus, Minus, Trash2, Search, TrendingUp, Box, DollarSign, Download, 
  FileUp, Printer, Eye, X, CheckCircle2, RefreshCw, Menu, Loader2,
  User, Truck, CreditCard, Ban, FileSpreadsheet, Percent, AlertTriangle,
  Edit3, CheckSquare, Square, Image as ImageIcon, Palette, FileText, Users
} from 'lucide-react';
import { 
  AppMode, Product, CartItem, SaleRecord, Language, 
  OrderStatus, PaymentMethod, LogisticsProvider, PaymentStatus,
  Promotion, PromotionStep
} from './types';
import { TRANSLATIONS } from './constants.tsx';
import Sidebar from './components/Sidebar';
import { getDb, collection, onSnapshot, query, orderBy, doc, setDoc, updateDoc, deleteDoc, getDoc } from './services/firebase';
import * as XLSX from 'xlsx';

const App: React.FC = () => {
  const [storeId] = useState('PRO_TERMINAL_01');
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('pos_lang') as Language) || 'th');
  const t = TRANSLATIONS[language];

  const [mode, setMode] = useState<AppMode>('DASHBOARD'); 
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [storeName, setStoreName] = useState(() => localStorage.getItem('pos_store_name') || 'SMART POS PRO');
  const [logoUrl, setLogoUrl] = useState(() => localStorage.getItem('pos_logo_data') || 'https://placehold.co/200x200/4338ca/ffffff?text=POS');
  const [themeColor, setThemeColor] = useState(() => localStorage.getItem('pos_theme_color') || '#4338ca');
  
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [billDiscount, setBillDiscount] = useState(0);
  const [customer, setCustomer] = useState({
    name: '', phone: '', address: '', branch: '',
    logistics: 'รับสินค้าเอง' as LogisticsProvider,
    paymentMethod: 'Cash' as PaymentMethod,
    paymentStatus: 'Paid' as PaymentStatus,
    orderStatus: 'Completed' as OrderStatus
  });

  const [showProductModal, setShowProductModal] = useState(false);
  const [showPromotionModal, setShowPromotionModal] = useState<Partial<Promotion> | null>(null);
  const [showSaleDetailModal, setShowSaleDetailModal] = useState<SaleRecord | null>(null);
  const [editingSale, setEditingSale] = useState<Partial<SaleRecord> | null>(null);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);

  const bulkInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubP = onSnapshot(`pos_v4/${storeId}/products`, s => {
      setProducts(s.docs.map(d => ({ ...d.data(), id: d.id } as Product)));
    });
    const unsubS = onSnapshot(`pos_v4/${storeId}/sales`, s => {
      setSales(s.docs.map(d => ({ ...d.data(), id: d.id } as SaleRecord)));
    });
    const unsubPromos = onSnapshot(`pos_v4/${storeId}/promotions`, s => {
      setPromotions(s.docs.map(d => ({ ...d.data(), id: d.id } as Promotion)));
    });
    return () => { unsubP(); unsubS(); unsubPromos(); };
  }, [storeId]);

  const formatMoney = (v: number) => {
    const sym = language === 'en' ? ' LAK' : ' ກີບ';
    return `${new Intl.NumberFormat('en-US').format(v)}${sym}`;
  };

  // Helper to apply promotion logic to cart items
  const applyPromotions = (items: CartItem[]): CartItem[] => {
    return items.map(item => {
      const promo = promotions.find(p => p.active && p.targetProductIds.includes(item.code));
      if (!promo || !promo.steps || promo.steps.length === 0) {
        return { ...item, price: item.originalPrice };
      }
      
      const sortedSteps = [...promo.steps].sort((a, b) => b.minQty - a.minQty);
      const applicableStep = sortedSteps.find(s => item.quantity >= s.minQty);
      
      const targetPrice = applicableStep ? applicableStep.price : item.originalPrice;
      return { ...item, price: targetPrice };
    });
  };

  const calculateFinalTotal = () => {
    const sub = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    return Math.max(0, sub - billDiscount);
  };

  const performSave = async (col: string, id: string, data: any) => {
    const db = getDb();
    await setDoc(doc(db, `pos_v4/${storeId}/${col}`, id), data, { merge: true });
  };

  const addToCart = (p: Product) => {
    const existing = cart.find(i => i.id === p.id);
    let newCart;
    if (existing) {
      newCart = cart.map(i => i.id === p.id ? { ...i, quantity: i.quantity + 1 } : i);
    } else {
      newCart = [...cart, { ...p, quantity: 1, originalPrice: p.price, discountValue: 0, discountType: 'amount' }];
    }
    setCart(applyPromotions(newCart));
  };

  const updateCartQuantity = (id: string, delta: number) => {
    const newCart = cart.map(i => i.id === id ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i).filter(i => i.quantity > 0);
    setCart(applyPromotions(newCart));
  };

  useEffect(() => {
    if (cart.length > 0) {
      setCart(applyPromotions(cart));
    }
  }, [promotions]);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setIsSaving(true);
    try {
      const saleId = `INV-${Date.now()}`;
      const total = calculateFinalTotal();
      const record: SaleRecord = {
        id: saleId, items: cart, subtotal: cart.reduce((a, b) => a + (b.price * b.quantity), 0),
        billDiscountValue: billDiscount, billDiscountType: 'amount',
        total, timestamp: Date.now(), status: customer.orderStatus,
        paymentMethod: customer.paymentMethod, paymentStatus: customer.paymentStatus,
        customerName: customer.name || 'Walk-in', customerPhone: customer.phone,
        customerAddress: customer.address, logistics: customer.logistics,
        destinationBranch: customer.branch, createdByRole: 'OWNER' as any
      };

      if (customer.orderStatus === 'Completed') {
        for (const item of cart) {
          const p = products.find(prod => prod.id === item.id);
          if (p) await performSave('products', p.id, { stock: Math.max(0, p.stock - item.quantity) });
        }
      }

      await performSave('sales', saleId, record);
      setCart([]); setBillDiscount(0);
      setCustomer({ name: '', phone: '', address: '', branch: '', logistics: 'รับสินค้าเอง', paymentMethod: 'Cash', paymentStatus: 'Paid', orderStatus: 'Completed' });
      alert(language === 'en' ? 'Transaction Saved!' : 'บันทึกสำเร็จ!');
    } catch (e) { alert('Checkout Error'); } finally { setIsSaving(false); }
  };

  const handleBulkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const items = XLSX.utils.sheet_to_json(sheet) as any[];
        if (items.length === 0) return alert('ไม่พบข้อมูลในไฟล์ Excel');
        setIsSaving(true);
        for (const item of items) {
          const code = String(item.Code || item.SKU || item.sku || item['รหัสสินค้า'] || item['Code*'] || `P${Date.now()}${Math.floor(Math.random()*1000)}`);
          const name = String(item.Name || item.name || item['ชื่อสินค้า'] || item['Name*'] || 'สินค้าไม่มีชื่อ');
          const cost = Number(item.Cost || item.cost || item['ราคาทุน'] || 0);
          const price = Number(item.Price || item.price || item['ราคาขาย'] || 0);
          const stock = Number(item.Stock || item.stock || item['สต็อก'] || 0);
          const category = String(item.Category || item.category || item['หมวดหมู่'] || 'ทั่วไป');
          await performSave('products', code, { id: code, code, name, cost, price, stock, category });
        }
        alert(`นำเข้าสินค้า ${items.length} รายการสำเร็จ!`);
      } catch (err) { alert('เกิดข้อผิดพลาดในการนำเข้าไฟล์'); } finally {
        setIsSaving(false);
        if (bulkInputRef.current) bulkInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const printBill = (sale: SaleRecord) => {
    const win = window.open('', '_blank');
    if (!win) return;
    
    const itemsHtml = sale.items.map(i => `
      <tr>
        <td style="padding: 12px 10px; border-bottom: 1px solid #edf2f7; font-size: 14px; line-height: 1.4; vertical-align: top; width: 65%;">
          <div style="font-weight: 700; color: #1a202c;">${i.name}</div>
          <div style="font-size: 11px; color: #718096; margin-top: 2px;">${formatMoney(i.price)} x ${i.quantity}</div>
        </td>
        <td style="padding: 12px 10px; border-bottom: 1px solid #edf2f7; text-align: right; font-weight: 800; color: #2d3748; vertical-align: top;">
          ${formatMoney(i.price * i.quantity)}
        </td>
      </tr>
    `).join('');

    win.document.write(`
      <html>
        <head>
          <title>Receipt ${sale.id}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
            body { font-family: 'Plus Jakarta Sans', sans-serif; padding: 40px; color: #1a202c; max-width: 600px; margin: auto; background: #fff; }
            .card { border: 1px solid #e2e8f0; padding: 40px; border-radius: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
            .header { text-align: center; border-bottom: 2px solid #f7fafc; padding-bottom: 30px; margin-bottom: 30px; }
            .logo { width: 100px; height: 100px; border-radius: 25px; margin-bottom: 15px; object-fit: cover; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
            table { width: 100%; border-collapse: collapse; }
            .total-section { margin-top: 30px; padding-top: 25px; border-top: 2px solid #1a202c; }
            .grand-total { font-size: 24px; font-weight: 800; color: #4338ca; }
            .footer { margin-top: 40px; text-align: center; font-size: 13px; color: #a0aec0; line-height: 1.6; }
            .info-grid { display: grid; grid-template-cols: 1fr 1fr; gap: 20px; margin-bottom: 30px; font-size: 13px; background: #f8fafc; padding: 20px; border-radius: 15px; }
            @media print { body { padding: 0; } .card { border: none; box-shadow: none; padding: 20px; } }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">
              <img src="${logoUrl}" class="logo" />
              <h1 style="margin:0; font-size: 28px; font-weight: 800; letter-spacing: -0.02em;">${storeName}</h1>
              <div style="margin-top: 10px; font-weight: 600; color: #718096; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em;">
                INV: ${sale.id} &bull; ${new Date(sale.timestamp).toLocaleString()}
              </div>
            </div>
            <div class="info-grid">
              <div>
                <div style="color: #a0aec0; font-weight: 800; font-size: 10px; margin-bottom: 5px; text-transform: uppercase;">Customer Info</div>
                <div style="font-weight: 700;">${sale.customerName}</div>
                <div style="color: #4a5568;">${sale.customerPhone}</div>
              </div>
              <div>
                <div style="color: #a0aec0; font-weight: 800; font-size: 10px; margin-bottom: 5px; text-transform: uppercase;">Shipping & Destination</div>
                <div style="font-weight: 700;">${sale.logistics}</div>
                <div style="color: #4a5568; line-height: 1.2;">${sale.customerAddress}</div>
              </div>
            </div>
            <table>
              <thead><tr style="font-size: 11px; font-weight: 800; color: #a0aec0; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #edf2f7;"><th style="text-align: left; padding: 10px;">Item Description</th><th style="text-align: right; padding: 10px;">Total</th></tr></thead>
              <tbody>${itemsHtml}</tbody>
            </table>
            <div class="total-section">
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; font-weight: 600;"><span style="color: #718096;">Subtotal</span><span>${formatMoney(sale.subtotal)}</span></div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 14px; font-weight: 600; color: #f56565;"><span>Discount</span><span>-${formatMoney(sale.billDiscountValue)}</span></div>
              <div style="display: flex; justify-content: space-between; align-items: center;" class="grand-total"><span>Grand Total</span><span>${formatMoney(sale.total)}</span></div>
            </div>
            <div class="footer"><div style="color: #2d3748; font-weight: 700; margin-bottom: 5px;">Payment: ${sale.paymentMethod} (${sale.paymentStatus})</div><div>Thank you for choosing ${storeName}. We hope to see you again soon!</div></div>
          </div>
          <script>window.print(); setTimeout(() => window.close(), 1000);</script>
        </body>
      </html>
    `);
    win.document.close();
  };

  const printInventory = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    const currentT = TRANSLATIONS[language];
    const rows = products.map(p => `
      <tr>
        <td style="border: 1px solid #ddd; padding: 10px; font-family: monospace; font-size: 11px;">${p.code}</td>
        <td style="border: 1px solid #ddd; padding: 10px; font-weight: 700; font-size: 12px;">${p.name}</td>
        <td style="border: 1px solid #ddd; padding: 10px; text-align: center; font-size: 12px; font-weight: 800;">${p.stock}</td>
        <td style="border: 1px solid #222; padding: 10px; width: 120px;"></td>
      </tr>
    `).join('');
    win.document.write(`<html><head><title>${currentT.inventory_checklist}</title><style>@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;700;800&display=swap'); body { font-family: 'Plus Jakarta Sans', sans-serif; padding: 30px; } table { width: 100%; border-collapse: collapse; margin-top: 25px; } th { background: #f8fafc; border: 1px solid #cbd5e1; padding: 12px; text-align: left; font-size: 10px; text-transform: uppercase; font-weight: 800; } h1 { margin-bottom: 5px; font-size: 26px; font-weight: 900; } p { color: #64748b; font-size: 11px; margin-top: 0; } .sig { border-top: 2px solid #000; width: 220px; text-align: center; padding-top: 10px; font-size: 10px; font-weight: 800; }</style></head><body><h1>${currentT.inventory_checklist}</h1><p>${storeName} | ${new Date().toLocaleString()}</p><table><thead><tr><th>${currentT.sku_code}</th><th>${currentT.product_name}</th><th>${currentT.system_stock}</th><th>${currentT.physical_count}</th></tr></thead><tbody>${rows}</tbody></table><div style="margin-top: 60px; display: flex; justify-content: space-between;"><div class="sig">${currentT.checker_sig}</div><div class="sig">${currentT.manager_sig}</div></div><script>window.print(); setTimeout(()=>window.close(), 500);</script></body></html>`);
    win.document.close();
  };

  const renderDashboard = () => {
    const validSales = sales.filter(s => s.status !== 'Cancelled');
    const totalRev = validSales.reduce((a, b) => a + b.total, 0);
    const totalCost = validSales.reduce((a, s) => a + s.items.reduce((sum, i) => sum + (i.cost * i.quantity), 0), 0);
    const profit = totalRev - totalCost;
    const stockVal = products.reduce((a, b) => a + (b.stock * b.cost), 0);
    const custMap: any = {};
    validSales.forEach(s => custMap[s.customerName] = (custMap[s.customerName] || 0) + s.total);
    const topCust = Object.entries(custMap).sort((a:any, b:any) => b[1] - a[1]).slice(0, 10);
    const prodRevMap: any = {};
    validSales.forEach(s => s.items.forEach(i => { prodRevMap[i.name] = (prodRevMap[i.name] || 0) + (i.price * i.quantity); }));
    const topRev = Object.entries(prodRevMap).sort((a:any, b:any) => b[1] - a[1]).slice(0, 10);

    return (
      <div className="p-8 space-y-8 h-full overflow-y-auto custom-scrollbar bg-slate-50/50">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-premium border border-white flex justify-between items-center transition-all hover:scale-[1.02]">
            <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{t.total_sales}</p><p className="text-3xl font-black text-slate-900">{formatMoney(totalRev)}</p></div>
            <div className="bg-indigo-50 p-4 rounded-3xl text-indigo-500"><DollarSign size={32}/></div>
          </div>
          <div className="bg-white p-8 rounded-[2.5rem] shadow-premium border border-white flex justify-between items-center transition-all hover:scale-[1.02]">
            <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{t.total_profit}</p><p className="text-3xl font-black text-emerald-600">{formatMoney(profit)}</p></div>
            <div className="bg-emerald-50 p-4 rounded-3xl text-emerald-500"><TrendingUp size={32}/></div>
          </div>
          <div className="bg-white p-8 rounded-[2.5rem] shadow-premium border border-white flex justify-between items-center transition-all hover:scale-[1.02]">
            <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{t.stock_value}</p><p className="text-3xl font-black text-amber-600">{formatMoney(stockVal)}</p></div>
            <div className="bg-amber-50 p-4 rounded-3xl text-amber-500"><Box size={32}/></div>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white p-8 rounded-[3rem] shadow-premium border border-white space-y-6">
            <h3 className="font-black text-[10px] uppercase tracking-widest text-slate-400 flex items-center gap-2"><Tag size={14}/> {t.top_products}</h3>
            <div className="space-y-4">
              {topRev.map(([name, val]: any, idx) => (<div key={idx} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl"><span className="font-bold text-slate-700 text-xs">{idx+1}. {name}</span><span className="font-black text-indigo-600 text-xs">{formatMoney(val)}</span></div>))}
            </div>
          </div>
          <div className="bg-white p-8 rounded-[3rem] shadow-premium border border-white space-y-6">
            <h3 className="font-black text-[10px] uppercase tracking-widest text-slate-400 flex items-center gap-2"><Users size={14}/> {t.top_customers}</h3>
            <div className="space-y-4">
              {topCust.map(([name, val]: any, idx) => (<div key={idx} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl"><span className="font-bold text-slate-700 text-xs">{idx+1}. {name}</span><span className="font-black text-emerald-600 text-xs">{formatMoney(val)}</span></div>))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderPOS = () => {
    const filtered = products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.code.toLowerCase().includes(searchTerm.toLowerCase()));
    return (
      <div className="flex h-full overflow-hidden">
        <div className="flex-1 flex flex-col p-8 overflow-hidden">
          <div className="mb-8 relative">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={24} />
            <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search SKU or Name..." className="w-full pl-16 pr-8 py-5 bg-white border border-slate-100 rounded-[2.5rem] shadow-premium outline-none font-bold" />
          </div>
          <div className="flex-1 overflow-y-auto grid grid-cols-2 xl:grid-cols-4 gap-6 pr-4 custom-scrollbar">
            {filtered.map(p => (
              <button key={p.id} onClick={() => addToCart(p)} className="bg-white p-6 rounded-[2.5rem] border border-white shadow-premium hover:shadow-luxury hover:-translate-y-2 transition-all text-left flex flex-col justify-between group active:scale-95">
                <div className="space-y-2"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{p.code}</p><p className="font-black text-slate-800 line-clamp-2 leading-tight">{p.name}</p></div>
                <div className="mt-4 flex justify-between items-end"><p className="font-black text-indigo-600 text-xl tracking-tighter">{formatMoney(p.price)}</p><div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all"><Plus size={20} /></div></div>
              </button>
            ))}
          </div>
        </div>
        <div className="w-[500px] bg-white border-l shadow-luxury flex flex-col z-10 overflow-hidden">
          <div className="p-8 border-b flex justify-between items-center"><h3 className="text-xl font-black uppercase tracking-tighter">{t.pos}</h3><button onClick={() => { if(confirm(t.clear_cart + '?')) setCart([]); }} className="text-slate-300 hover:text-danger transition-colors"><Trash2 size={24}/></button></div>
          <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
            <div className="space-y-4">
              {cart.map(item => (
                <div key={item.id} className="flex justify-between items-center bg-slate-50 p-4 rounded-3xl border border-slate-100">
                  <div className="flex-1 pr-4"><p className="font-bold text-sm text-slate-800 line-clamp-1">{item.name}</p><p className="text-xs font-black text-indigo-600">{formatMoney(item.price)}</p></div>
                  <div className="flex items-center gap-3"><button onClick={() => updateCartQuantity(item.id, -1)} className="w-8 h-8 rounded-xl bg-white border flex items-center justify-center text-slate-400 hover:text-danger"><Minus size={14}/></button><span className="w-6 text-center font-black">{item.quantity}</span><button onClick={() => updateCartQuantity(item.id, 1)} className="w-8 h-8 rounded-xl bg-white border flex items-center justify-center text-slate-400 hover:text-indigo-600"><Plus size={14}/></button></div>
                </div>
              ))}
              {cart.length === 0 && <div className="text-center py-10 opacity-20"><ShoppingCart size={64} className="mx-auto mb-4"/><p className="text-[10px] font-black uppercase tracking-widest">Cart is empty</p></div>}
            </div>
            <div className="pt-6 border-t space-y-5">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.cust_name} & Info</h4>
              <div className="grid grid-cols-2 gap-4">
                <input value={customer.name} onChange={e => setCustomer({...customer, name: e.target.value})} placeholder={t.cust_name} className="p-4 bg-slate-50 rounded-2xl text-xs font-bold border-none outline-none focus:ring-2 focus:ring-indigo-500/20" />
                <input value={customer.phone} onChange={e => setCustomer({...customer, phone: e.target.value})} placeholder={t.cust_phone} className="p-4 bg-slate-50 rounded-2xl text-xs font-bold border-none outline-none focus:ring-2 focus:ring-indigo-500/20" />
              </div>
              <textarea value={customer.address} onChange={e => setCustomer({...customer, address: e.target.value})} placeholder={t.cust_address} className="w-full p-4 bg-slate-50 rounded-2xl text-xs font-bold border-none outline-none focus:ring-2 focus:ring-indigo-500/20 h-16" />
              <div className="grid grid-cols-2 gap-4">
                <input value={customer.branch} onChange={e => setCustomer({...customer, branch: e.target.value})} placeholder={t.cust_branch} className="p-4 bg-slate-50 rounded-2xl text-xs font-bold border-none outline-none focus:ring-2 focus:ring-indigo-500/20" />
                <select value={customer.logistics} onChange={e => setCustomer({...customer, logistics: e.target.value as any})} className="p-4 bg-slate-50 rounded-2xl text-xs font-bold outline-none">
                  <option value="รับสินค้าเอง">รับสินค้าเอง</option><option value="อนุชิต">อนุชิต</option><option value="มีไช">มีไช</option><option value="รุ่งอรุณ">รุ่งอรุณ</option>
                </select>
              </div>
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.payment_method} & {t.order_status}</h4>
              <div className="grid grid-cols-2 gap-4">
                <select value={customer.paymentMethod} onChange={e => setCustomer({...customer, paymentMethod: e.target.value as any})} className="p-4 bg-slate-50 rounded-2xl text-xs font-bold"><option value="Cash">Cash</option><option value="Transfer">Transfer</option><option value="COD">COD</option></select>
                <select value={customer.paymentStatus} onChange={e => setCustomer({...customer, paymentStatus: e.target.value as any})} className="p-4 bg-slate-50 rounded-2xl text-xs font-bold"><option value="Paid">Paid</option><option value="Outstanding">Outstanding</option></select>
              </div>
              <select value={customer.orderStatus} onChange={e => setCustomer({...customer, orderStatus: e.target.value as any})} className="w-full p-4 bg-indigo-50 text-indigo-700 rounded-2xl text-[10px] font-black uppercase"><option value="Completed">Auto-Complete (Cut Stock)</option><option value="Pending">Pending (No Cut Stock)</option></select>
            </div>
          </div>
          <div className="p-8 bg-slate-50 border-t space-y-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.bill_discount}</span><div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border"><span className="text-[10px] font-black text-slate-300 tracking-tighter uppercase">LAK</span><input type="number" value={billDiscount || ''} onChange={e => setBillDiscount(Number(e.target.value))} className="w-24 text-right font-black outline-none bg-transparent" placeholder="0" /></div></div>
              <div className="flex justify-between items-end"><span className="text-sm font-black text-slate-800 uppercase tracking-widest">{t.grand_total}</span><span className="text-4xl font-black text-indigo-600 tracking-tighter">{formatMoney(calculateFinalTotal())}</span></div>
            </div>
            <button onClick={handleCheckout} className="w-full py-6 bg-slate-900 text-white rounded-[2rem] font-black text-lg shadow-luxury active:scale-95 transition-all" style={{ backgroundColor: themeColor }}>{t.checkout}</button>
          </div>
        </div>
      </div>
    );
  };

  const renderStock = () => (
    <div className="p-8 space-y-8 h-full flex flex-col bg-slate-50/50">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div><h2 className="text-3xl font-black uppercase tracking-tighter">{t.stock}</h2><p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">{t.inventory_checklist}</p></div>
        <div className="flex gap-3">
          <button onClick={() => { setEditingProduct({ name: '', code: '', cost: 0, price: 0, stock: 0, category: 'ทั่วไป' }); setShowProductModal(true); }} className="px-6 py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-luxury" style={{ backgroundColor: themeColor }}><Plus size={16}/> Add Item</button>
          <button onClick={() => { const ws = XLSX.utils.json_to_sheet([{ 'รหัสสินค้า': 'SKU001', 'ชื่อสินค้า': 'ตัวอย่างสินค้า', 'ราคาทุน': 5000, 'ราคาขาย': 15000, 'สต็อก': 100, 'หมวดหมู่': 'ทั่วไป' }]); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Template"); XLSX.writeFile(wb, "Stock_Template.xlsx"); }} className="px-6 py-4 bg-white border rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-premium hover:bg-slate-50 transition-all"><Download size={16}/> {t.download_template}</button>
          <button onClick={() => bulkInputRef.current?.click()} className="px-6 py-4 bg-white border rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-premium hover:bg-slate-50 transition-all"><FileUp size={16}/> {t.import_excel}</button>
          <input type="file" ref={bulkInputRef} className="hidden" accept=".xlsx, .xls" onChange={handleBulkUpload} />
          <button onClick={printInventory} className="px-6 py-4 bg-white border rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-premium hover:bg-slate-50 transition-all"><Printer size={16}/> Print</button>
        </div>
      </div>
      <div className="flex-1 bg-white rounded-[3rem] shadow-premium border border-white overflow-hidden flex flex-col">
        <div className="p-8 border-b bg-slate-50/50 flex items-center gap-4"><Search className="text-slate-300" size={20}/><input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search Name or Code..." className="bg-transparent border-none outline-none font-bold text-sm w-full" /></div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-white border-b z-10"><tr><th className="p-6 text-[10px] font-black uppercase text-slate-400">Code</th><th className="p-6 text-[10px] font-black uppercase text-slate-400">Product Name</th><th className="p-6 text-[10px] font-black uppercase text-slate-400">Category</th><th className="p-6 text-[10px] font-black uppercase text-slate-400 text-right">Price</th><th className="p-6 text-[10px] font-black uppercase text-slate-400 text-center">Stock</th><th className="p-6 text-right">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-50">
              {products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.code.toLowerCase().includes(searchTerm.toLowerCase())).map(p => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors group"><td className="p-6 font-mono text-xs font-bold text-slate-400">{p.code}</td><td className="p-6 font-black text-slate-800">{p.name}</td><td className="p-6"><span className="px-4 py-1.5 bg-slate-100 rounded-full text-[9px] font-black uppercase text-slate-500">{p.category}</span></td><td className="p-6 text-right font-black text-indigo-600">{formatMoney(p.price)}</td><td className="p-6 text-center"><span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase ${p.stock <= 10 ? 'bg-rose-50 text-rose-600 animate-pulse' : 'bg-slate-50 text-slate-600'}`}>{p.stock} Units</span></td><td className="p-6 text-right"><div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => { setEditingProduct(p); setShowProductModal(true); }} className="p-2.5 bg-slate-50 text-slate-400 rounded-xl hover:bg-slate-900 hover:text-white transition-all"><Edit3 size={16}/></button><button onClick={async () => { if(confirm('Delete this product?')) await deleteDoc(doc(getDb(), `pos_v4/${storeId}/products`, p.id)); }} className="p-2.5 bg-rose-50 text-rose-400 rounded-xl hover:bg-rose-500 hover:text-white transition-all"><Trash2 size={16}/></button></div></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderReports = () => (
    <div className="p-8 space-y-8 h-full flex flex-col bg-slate-50/50">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div><h2 className="text-3xl font-black uppercase tracking-tighter">{t.reports}</h2><p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">{t.bill_management}</p></div>
        <div className="flex gap-3">
          <button onClick={async () => { if(confirm(t.delete_all + '?')) { for(const s of sales) await deleteDoc(doc(getDb(), `pos_v4/${storeId}/sales`, s.id)); } }} className="px-6 py-4 bg-rose-50 text-rose-600 border border-rose-100 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:bg-rose-100 transition-all"><Trash2 size={16}/> {t.delete_all}</button>
          <button className="px-6 py-4 bg-white border rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-premium hover:bg-slate-50 transition-all"><FileSpreadsheet size={16}/> Export Excel</button>
        </div>
      </div>
      <div className="flex-1 bg-white rounded-[3rem] shadow-premium border border-white overflow-hidden flex flex-col">
        <div className="p-8 border-b bg-slate-50/50 flex items-center gap-4"><Search className="text-slate-300" size={20}/><input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search ID, Customer, Phone..." className="bg-transparent border-none outline-none font-bold text-sm w-full" /></div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-white border-b z-10"><tr><th className="p-6 text-[10px] font-black uppercase text-slate-400">Order ID / Date</th><th className="p-6 text-[10px] font-black uppercase text-slate-400">Customer Info</th><th className="p-6 text-[10px] font-black uppercase text-slate-400">{t.status}</th><th className="p-6 text-[10px] font-black uppercase text-slate-400 text-right">{t.grand_total}</th><th className="p-6 text-right">Operations</th></tr></thead>
            <tbody className="divide-y divide-slate-50">
              {sales.filter(s => s.id.toLowerCase().includes(searchTerm.toLowerCase()) || s.customerName.toLowerCase().includes(searchTerm.toLowerCase()) || s.customerPhone.includes(searchTerm)).map(s => (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors group"><td className="p-6"><p className="font-mono text-xs font-bold text-slate-400 mb-1">{s.id}</p><p className="text-[10px] font-black text-slate-300 uppercase">{new Date(s.timestamp).toLocaleString()}</p></td><td className="p-6"><p className="font-black text-slate-800">{s.customerName}</p><p className="text-[10px] font-bold text-slate-400">{s.customerPhone}</p></td><td className="p-6"><span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase ${s.status === 'Completed' ? 'bg-emerald-50 text-emerald-600' : s.status === 'Cancelled' ? 'bg-rose-50 text-rose-500' : 'bg-amber-50 text-amber-600'}`}>{s.status}</span></td><td className="p-6 text-right font-black text-indigo-600">{formatMoney(s.total)}</td><td className="p-6 text-right"><div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">{s.status === 'Pending' && (<button onClick={async () => { if(confirm(t.confirm_approve)) await updateDoc(doc(getDb(), `pos_v4/${storeId}/sales`, s.id), { status: 'Completed' }); }} className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all"><CheckCircle2 size={16}/></button>)}<button onClick={() => setEditingSale(s)} className="p-2.5 bg-slate-50 text-slate-400 rounded-xl hover:bg-slate-900 hover:text-white transition-all"><Edit3 size={16}/></button><button onClick={() => printBill(s)} className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all"><Printer size={16}/></button><button onClick={async () => { if(confirm(t.confirm_cancel)) await updateDoc(doc(getDb(), `pos_v4/${storeId}/sales`, s.id), { status: 'Cancelled' }); }} className="p-2.5 bg-rose-50 text-rose-400 rounded-xl hover:bg-rose-500 hover:text-white transition-all"><Ban size={16}/></button></div></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar currentMode={mode} onModeChange={setMode} isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} language={language} setLanguage={(l) => { setLanguage(l); localStorage.setItem('pos_lang', l); }} storeName={storeName} onLogout={() => window.location.reload()} logoUrl={logoUrl} themeColor={themeColor} />
      <main className="flex-1 flex flex-col overflow-hidden bg-white relative">
        <div className="flex-1 overflow-hidden">
          {mode === 'DASHBOARD' && renderDashboard()}
          {mode === 'ORDERS' && renderPOS()}
          {mode === 'STOCK' && renderStock()}
          {mode === 'REPORTS' && renderReports()}
          {mode === 'PROMOTIONS' && (
             <div className="p-8 space-y-8 h-full flex flex-col bg-slate-50/50">
                <div className="flex justify-between items-center"><div><h2 className="text-3xl font-black uppercase tracking-tighter">{t.promotions}</h2><p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Pricing Rules</p></div><button onClick={()=>setShowPromotionModal({name:'',active:true,targetProductIds:[],steps:[{minQty:1,price:0}]})} className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-luxury" style={{ backgroundColor: themeColor }}>+ Create Promo</button></div>
                <div className="flex-1 bg-white rounded-[3rem] shadow-premium border border-white overflow-hidden overflow-y-auto custom-scrollbar">
                   <table className="w-full text-left"><thead className="bg-white border-b sticky top-0"><tr><th className="p-6 text-[10px] font-black uppercase text-slate-400">Name</th><th className="p-6 text-[10px] font-black uppercase text-slate-400">Steps</th><th className="p-6 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-50">{promotions.map(p=>(<tr key={p.id} className="hover:bg-slate-50"><td className="p-6 font-black text-slate-800">{p.name}</td><td className="p-6">{p.steps.map((s,i)=>(<div key={i} className="text-[10px] font-bold text-indigo-600">{s.minQty}+: {formatMoney(s.price)}</div>))}</td><td className="p-6 text-right"><button onClick={()=>setShowPromotionModal(p)} className="p-3 text-slate-300 hover:text-indigo-600"><Edit3 size={18}/></button><button onClick={async()=>await deleteDoc(doc(getDb(),`pos_v4/${storeId}/promotions`,p.id))} className="p-3 text-slate-300 hover:text-rose-500"><Trash2 size={18}/></button></td></tr>))}</tbody></table>
                </div>
             </div>
          )}
          {mode === 'SETTINGS' && (
             <div className="p-12 max-w-4xl mx-auto space-y-12 h-full overflow-y-auto custom-scrollbar">
               <h2 className="text-4xl font-black uppercase tracking-tighter">{t.settings}</h2>
               <div className="bg-white p-12 rounded-[3.5rem] border shadow-luxury space-y-10">
                 <div className="flex flex-col items-center gap-6">
                    <div className="w-40 h-40 rounded-[2.5rem] bg-slate-50 p-2 relative group overflow-hidden border-2 border-dashed border-slate-200 shadow-premium"><img src={logoUrl} className="w-full h-full object-cover rounded-[2rem]" alt="Store Logo" /><button onClick={() => logoInputRef.current?.click()} className="absolute inset-0 bg-black/60 text-white opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-2 transition-opacity"><ImageIcon size={24}/><span className="text-[10px] font-black uppercase tracking-widest">Change Logo</span></button></div>
                    <input type="file" ref={logoInputRef} className="hidden" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const r = new FileReader(); r.onload = (ev) => { const d = ev.target?.result as string; setLogoUrl(d); localStorage.setItem('pos_logo_data', d); }; r.readAsDataURL(file); }} />
                 </div>
                 <div className="space-y-4"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">Store Display Name</label><input value={storeName} onChange={e => { setStoreName(e.target.value); localStorage.setItem('pos_store_name', e.target.value); }} className="w-full p-6 bg-slate-50 border-none rounded-[2rem] font-black outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all" /></div>
                 <div className="space-y-4">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">{t.theme_choice}</label>
                   <div className="flex flex-wrap gap-4 px-4 items-center">{['#4338ca', '#f43f5e', '#10b981', '#f59e0b', '#000000'].map(c => (<button key={c} onClick={() => { setThemeColor(c); localStorage.setItem('pos_theme_color', c); }} className={`w-12 h-12 rounded-full border-4 transition-all ${themeColor === c ? 'scale-125 border-slate-900 shadow-xl' : 'border-transparent'}`} style={{backgroundColor: c}} />))}<div className="flex items-center gap-3 ml-4 bg-slate-100 px-5 py-3 rounded-2xl border border-slate-200"><Palette size={18} className="text-slate-400" /><input type="color" value={themeColor} onChange={(e) => { setThemeColor(e.target.value); localStorage.setItem('pos_theme_color', e.target.value); }} className="w-10 h-10 rounded border-none cursor-pointer p-0 bg-transparent" /><span className="text-[11px] font-black font-mono text-slate-600 uppercase tracking-widest">{themeColor}</span></div></div>
                 </div>
               </div>
             </div>
          )}
        </div>
      </main>

      {editingSale && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/80 p-6 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-[3.5rem] p-12 space-y-8 shadow-luxury max-h-[90vh] overflow-y-auto custom-scrollbar relative">
            <div className="flex justify-between items-center mb-4"><h3 className="text-2xl font-black uppercase tracking-tighter">{t.edit_details} : {editingSale.id}</h3><button onClick={() => setEditingSale(null)} className="text-slate-300 hover:text-slate-800 transition-colors"><X size={32}/></button></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.cust_name}</label><input value={editingSale.customerName || ''} onChange={e=>setEditingSale({...editingSale, customerName:e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl font-bold" /></div>
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.cust_phone}</label><input value={editingSale.customerPhone || ''} onChange={e=>setEditingSale({...editingSale, customerPhone:e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl font-bold" /></div>
              <div className="md:col-span-2 space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.cust_address}</label><textarea value={editingSale.customerAddress || ''} onChange={e=>setEditingSale({...editingSale, customerAddress:e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl font-bold h-24" /></div>
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.shipping}</label><select value={editingSale.logistics} onChange={e=>setEditingSale({...editingSale, logistics:e.target.value as any})} className="w-full p-4 bg-slate-50 rounded-2xl font-bold"><option value="รับสินค้าเอง">รับสินค้าเอง</option><option value="อนุชิต">อนุชิต</option><option value="มีไช">มีไช</option><option value="รุ่งอรุณ">รุ่งอรุณ</option></select></div>
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.payment_method}</label><select value={editingSale.paymentMethod} onChange={e=>setEditingSale({...editingSale, paymentMethod:e.target.value as any})} className="w-full p-4 bg-slate-50 rounded-2xl font-bold"><option value="Cash">Cash</option><option value="Transfer">Transfer</option><option value="COD">COD</option></select></div>
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.payment_status}</label><select value={editingSale.paymentStatus} onChange={e=>setEditingSale({...editingSale, paymentStatus:e.target.value as any})} className="w-full p-4 bg-slate-50 rounded-2xl font-bold"><option value="Paid">Paid</option><option value="Outstanding">Outstanding</option></select></div>
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.status}</label><select value={editingSale.status} onChange={e=>setEditingSale({...editingSale, status:e.target.value as any})} className="w-full p-4 bg-slate-900 text-white rounded-2xl font-black uppercase"><option value="Pending">Pending</option><option value="Completed">Completed</option><option value="Cancelled">Cancelled</option></select></div>
            </div>
            <div className="flex gap-4 pt-6"><button onClick={()=>setEditingSale(null)} className="flex-1 py-5 bg-slate-100 text-slate-500 rounded-3xl font-black uppercase text-[10px]">Cancel</button><button onClick={async()=>{await performSave('sales', editingSale.id!, editingSale); setEditingSale(null);}} className="flex-1 py-5 bg-slate-900 text-white rounded-3xl font-black uppercase text-[10px] shadow-luxury" style={{ backgroundColor: themeColor }}>Save Update</button></div>
          </div>
        </div>
      )}

      {showProductModal && editingProduct && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/80 p-6 backdrop-blur-sm"><div className="bg-white w-full max-w-xl rounded-[3.5rem] p-12 space-y-10 shadow-luxury"><h3 className="text-2xl font-black uppercase tracking-tighter">Edit Product</h3><div className="space-y-6"><input value={editingProduct.name || ''} onChange={e => setEditingProduct({...editingProduct, name: e.target.value})} placeholder="Product Name" className="w-full p-6 bg-slate-50 border-none rounded-[2rem] font-black outline-none" /><div className="grid grid-cols-2 gap-4"><input value={editingProduct.code || ''} onChange={e => setEditingProduct({...editingProduct, code: e.target.value})} placeholder="SKU / Code" className="w-full p-6 bg-slate-50 border-none rounded-[2rem] font-black outline-none" /><input type="number" value={editingProduct.stock || ''} onChange={e => setEditingProduct({...editingProduct, stock: Number(e.target.value)})} placeholder="Stock" className="w-full p-6 bg-slate-50 border-none rounded-[2rem] font-black outline-none" /></div><input type="number" value={editingProduct.price || ''} onChange={e => setEditingProduct({...editingProduct, price: Number(e.target.value)})} placeholder="Sale Price (LAK)" className="w-full p-6 bg-slate-50 border-none rounded-[2rem] font-black outline-none text-indigo-600" /></div><div className="flex gap-4"><button onClick={() => setShowProductModal(false)} className="flex-1 py-5 bg-slate-100 text-slate-500 rounded-[1.5rem] font-black uppercase text-[10px]">Cancel</button><button onClick={async () => { const id = editingProduct.id || `p-${Date.now()}`; await performSave('products', id, { ...editingProduct, id }); setShowProductModal(false); }} className="flex-1 py-5 bg-slate-900 text-white rounded-[1.5rem] font-black uppercase text-[10px] shadow-luxury" style={{ backgroundColor: themeColor }}>Save Item</button></div></div></div>
      )}

      {showPromotionModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/80 p-6 backdrop-blur-sm">
          <div className="bg-white w-full max-w-3xl rounded-[3.5rem] p-12 space-y-10 shadow-luxury max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6"><h3 className="text-2xl font-black uppercase tracking-tighter">{t.promo_editor}</h3><button onClick={() => setShowPromotionModal(null)} className="text-slate-300 hover:text-slate-800 transition-colors"><X size={32}/></button></div>
            <div className="space-y-6">
              <input value={showPromotionModal.name || ''} onChange={e => setShowPromotionModal({...showPromotionModal, name: e.target.value})} placeholder="Promo Name" className="w-full p-6 bg-slate-50 border-none rounded-[2rem] font-black outline-none" />
              <div className="space-y-2">
                <div className="flex justify-between px-4"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Target SKUs (Comma separated)</label><span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Count: {showPromotionModal.targetProductIds?.length || 0} / 50</span></div>
                <textarea 
                  value={showPromotionModal.targetProductIds?.join(', ') || ''} 
                  onChange={e => {
                    const ids = e.target.value.split(',').map(s=>s.trim()).filter(s=>s);
                    setShowPromotionModal({...showPromotionModal, targetProductIds: ids.slice(0, 50)});
                  }} 
                  placeholder="Enter SKUs separated by comma (e.g. A01, A02, B05...)" 
                  className="w-full p-6 bg-slate-50 border-none rounded-[2rem] font-bold outline-none h-40 resize-none shadow-inner" 
                />
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center px-4"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Price Steps ({showPromotionModal.steps?.length || 0}/10)</p>{(showPromotionModal.steps?.length || 0) < 10 && (<button onClick={() => setShowPromotionModal({...showPromotionModal, steps: [...(showPromotionModal.steps || []), {minQty: (showPromotionModal.steps?.length || 0) + 1, price: 0}]})} className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline">+ {t.add_step}</button>)}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {showPromotionModal.steps?.map((step, idx) => (
                    <div key={idx} className="flex gap-2 items-center bg-slate-50 p-4 rounded-[2rem] border border-slate-100 relative group">
                      <div className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-black flex-shrink-0">{idx+1}</div>
                      <div className="flex-1 space-y-1"><label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.min_qty}</label><input type="number" value={step.minQty} onChange={e => { const ns = [...(showPromotionModal.steps || [])]; ns[idx].minQty = Number(e.target.value); setShowPromotionModal({...showPromotionModal, steps: ns}); }} className="w-full p-2 bg-white rounded-xl font-black text-xs outline-none shadow-sm" /></div>
                      <div className="flex-[2] space-y-1"><label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.price_per_unit}</label><input type="number" value={step.price} onChange={e => { const ns = [...(showPromotionModal.steps || [])]; ns[idx].price = Number(e.target.value); setShowPromotionModal({...showPromotionModal, steps: ns}); }} className="w-full p-2 bg-white text-indigo-700 rounded-xl font-black text-xs outline-none shadow-sm" /></div>
                      <button onClick={() => { const ns = (showPromotionModal.steps || []).filter((_,i) => i !== idx); setShowPromotionModal({...showPromotionModal, steps: ns}); }} className="p-2 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={16}/></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-4 mt-10"><button onClick={() => setShowPromotionModal(null)} className="flex-1 py-5 bg-slate-100 text-slate-500 rounded-[1.5rem] font-black uppercase text-[10px]">Cancel</button><button onClick={async () => { const id = showPromotionModal.id || `promo-${Date.now()}`; await performSave('promotions', id, { ...showPromotionModal, id }); setShowPromotionModal(null); }} className="flex-1 py-5 bg-slate-900 text-white rounded-[1.5rem] font-black uppercase text-[10px] shadow-luxury" style={{ backgroundColor: themeColor }}>Save Promo</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
