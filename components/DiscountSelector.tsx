
import React from 'react';
import { Discount, DiscountType } from '../types';

interface Props {
  onApply: (discount: Discount | null) => void;
  currentDiscount: Discount | null;
}

export const DiscountSelector: React.FC<Props> = ({ onApply, currentDiscount }) => {
  const type = currentDiscount?.type || DiscountType.PERCENTAGE;
  const value = currentDiscount?.value || 0;

  const presets = type === DiscountType.PERCENTAGE 
    ? [5, 10, 15, 20] 
    : [5000, 10000, 20000, 50000];

  return (
    <div className="bg-white border border-slate-100 rounded-[2.5rem] p-6 shadow-premium space-y-4">
      <div className="flex justify-between items-center px-2">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">LOYALTY DISCOUNT</label>
        <div className="flex bg-slate-100 p-1 rounded-2xl">
          <button 
            type="button"
            onClick={() => onApply({ type: DiscountType.PERCENTAGE, value: 0 })}
            className={`px-4 py-2 text-[10px] font-black rounded-xl transition-all ${type === DiscountType.PERCENTAGE ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}
          >
            %
          </button>
          <button 
            type="button"
            onClick={() => onApply({ type: DiscountType.FIXED, value: 0 })}
            className={`px-4 py-2 text-[10px] font-black rounded-xl transition-all ${type === DiscountType.FIXED ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}
          >
            LAK
          </button>
        </div>
      </div>

      <div className="relative">
        <input 
          type="number" 
          value={value || ''}
          placeholder="0"
          onChange={(e) => onApply({ type, value: parseFloat(e.target.value) || 0 })}
          className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-black text-slate-700 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all shadow-inner"
        />
        <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300">
          {type === DiscountType.PERCENTAGE ? 'PERCENT' : 'AMOUNT'}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {presets.map(p => (
          <button 
            key={p}
            type="button"
            onClick={() => onApply({ type, value: p })}
            className={`py-3 text-[10px] font-black rounded-xl border transition-all ${value === p ? 'bg-slate-900 text-white border-slate-900 shadow-xl' : 'bg-white text-slate-500 border-slate-100 hover:bg-slate-50'}`}
          >
            {type === DiscountType.PERCENTAGE ? `${p}%` : `${(p/1000)}k`}
          </button>
        ))}
      </div>
    </div>
  );
};
