import React from 'react';
import { 
  LayoutDashboard, ShoppingCart, Package, 
  ClipboardList, Settings, Tag, RefreshCw, X, Globe
} from 'lucide-react';
import { AppMode, Language } from '../types';
import { TRANSLATIONS } from '../constants';

interface SidebarProps {
  currentMode: AppMode;
  onModeChange: (mode: AppMode) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  storeName: string;
  onLogout: () => void;
  logoUrl: string;
  themeColor: string;
}

const Sidebar: React.FC<SidebarProps> = ({
  currentMode, onModeChange, isOpen, setIsOpen,
  language, setLanguage, storeName, onLogout,
  logoUrl, themeColor
}) => {
  const t = TRANSLATIONS[language];

  const menuItems = [
    { mode: 'DASHBOARD' as AppMode, icon: LayoutDashboard, label: t.dashboard },
    { mode: 'ORDERS' as AppMode, icon: ShoppingCart, label: t.pos },
    { mode: 'STOCK' as AppMode, icon: Package, label: t.stock },
    { mode: 'PROMOTIONS' as AppMode, icon: Tag, label: t.promotions },
    { mode: 'REPORTS' as AppMode, icon: ClipboardList, label: t.reports },
    { mode: 'SETTINGS' as AppMode, icon: Settings, label: t.settings },
  ];

  const languages: { code: Language; label: string }[] = [
    { code: 'th', label: 'ไทย' },
    { code: 'lo', label: 'ລາວ' },
    { code: 'en', label: 'EN' }
  ];

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[150] lg:hidden" onClick={() => setIsOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 w-80 bg-white border-r border-slate-100 z-[200] transform transition-transform duration-500 ease-in-out lg:relative lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full p-10">
          <div className="flex items-center justify-between mb-16">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 rounded-[2rem] overflow-hidden border-2 border-slate-50 shadow-premium"><img src={logoUrl} className="w-full h-full object-cover" alt="Logo" /></div>
              <div>
                <h1 className="font-black text-slate-800 tracking-tighter text-xl leading-none uppercase">{storeName}</h1>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">SMART TERMINAL</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="lg:hidden text-slate-300 hover:text-slate-600 transition-colors"><X size={24} /></button>
          </div>

          <nav className="flex-1 space-y-3">
            {menuItems.map((item) => (
              <button
                key={item.mode}
                onClick={() => { onModeChange(item.mode); setIsOpen(false); }}
                className={`w-full flex items-center gap-5 px-8 py-5 rounded-[2rem] transition-all duration-300 group ${currentMode === item.mode ? 'text-white shadow-luxury translate-x-2' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}
                style={currentMode === item.mode ? { backgroundColor: themeColor } : {}}
              >
                <item.icon size={22} strokeWidth={currentMode === item.mode ? 2.5 : 2} />
                <span className="text-xs font-black uppercase tracking-widest">{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="pt-10 border-t border-slate-50 space-y-8">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-[10px] font-black text-slate-300 uppercase tracking-widest px-4"><Globe size={14} /> Global Language</div>
              <div className="flex gap-1 bg-slate-100 p-1.5 rounded-[1.5rem]">
                {languages.map((lang) => (
                  <button key={lang.code} onClick={() => setLanguage(lang.code)} className={`flex-1 py-3 text-[10px] font-black rounded-2xl transition-all ${language === lang.code ? 'bg-white shadow-premium text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}>{lang.label}</button>
                ))}
              </div>
            </div>
            <button onClick={onLogout} className="w-full flex items-center gap-5 px-8 py-5 rounded-[2rem] text-rose-400 hover:bg-rose-50 hover:text-rose-500 transition-all font-black text-xs uppercase tracking-widest"><RefreshCw size={22} /> Reload System</button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;