
import React from 'react';
import { Discount, DiscountType } from '../types';

interface Props {
  onApply: (discount: Discount | null) => void;
  currentDiscount: Discount | null;
}

export const DiscountSelector: React.FC<Props> = ({ onApply, currentDiscount }) => {
  const type = currentDiscount?.type || DiscountType.PERCENTAGE;
  const value = currentDiscount?.value || 0;

  const handleToggleType = (newType: DiscountType) => {
    // ถ้าสลับไปเป็น % แล้วค่าเดิมมากกว่า 100 (เช่น 1500) ให้ล้างค่าเป็น 0 เพื่อความปลอดภัย
    let newValue = value;
    if (newType === DiscountType.PERCENTAGE && value > 100) {
      newValue = 0; 
    }
    onApply({ type: newType, value: newValue });
  };

  const handleChangeValue = (val: string) => {
    let num = parseFloat(val) || 0;
    
    // ป้องกันการกรอกเกิน 100%
    if (type === DiscountType.PERCENTAGE && num > 100) {
      num = 100;
    }
    
    // ป้องกันค่าติดลบ
    if (num < 0) num = 0;

    onApply({ type, value: num });
  };

  const presets = type === DiscountType.PERCENTAGE 
    ? [5, 10, 15, 20] 
    : [5000, 10000, 20000, 50000];

  return (
    <div className="bg-white border border-slate-100 rounded-3xl p-4 shadow-sm space-y-3">
      <div className="flex justify-between items-center px-1">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ส่วนลดท้ายบิล</label>
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button 
            type="button"
            onClick={() => handleToggleType(DiscountType.PERCENTAGE)}
            className={`px-3 py-1 text-[9px] font-black rounded-lg transition-all ${type === DiscountType.PERCENTAGE ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400'}`}
          >
            %
          </button>
          <button 
            type="button"
            onClick={() => handleToggleType(DiscountType.FIXED)}
            className={`px-3 py-1 text-[9px] font-black rounded-lg transition-all ${type === DiscountType.FIXED ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400'}`}
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
          onChange={(e) => handleChangeValue(e.target.value)}
          className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-100 rounded-2xl font-black text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300">
          {type === DiscountType.PERCENTAGE ? '%' : 'LAK'}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {presets.map(p => (
          <button 
            key={p}
            type="button"
            onClick={() => onApply({ type, value: p })}
            className={`py-2 text-[10px] font-black rounded-xl border transition-all ${value === p ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-100 hover:bg-slate-50'}`}
          >
            {type === DiscountType.PERCENTAGE ? `${p}%` : `${(p/1000)}k`}
          </button>
        ))}
      </div>
      
      {value > 0 && (
        <button 
          type="button"
          onClick={() => onApply(null)}
          className="w-full py-1 text-[9px] font-black text-rose-400 hover:text-rose-600 uppercase tracking-widest"
        >
          ล้างส่วนลด
        </button>
      )}
    </div>
  );
};
