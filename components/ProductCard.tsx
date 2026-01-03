
import React from 'react';
import { Product } from '../types';

interface Props {
  product: Product;
  onAdd: (product: Product) => void;
}

export const ProductCard: React.FC<Props> = ({ product, onAdd }) => {
  const isLowStock = product.stock <= 10;
  
  return (
    <div 
      onClick={() => onAdd(product)}
      className="bg-white rounded-[2.5rem] p-8 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-2 border border-slate-200/50 cursor-pointer group flex flex-col justify-between h-52 transition-all duration-500 active:scale-95"
    >
      <div>
        <div className="flex justify-between items-start mb-4">
          <span className="text-[9px] font-black text-primary uppercase tracking-[0.2em] bg-indigo-50 px-4 py-1.5 rounded-full border border-indigo-100/50">
            {product.category}
          </span>
          <span className={`text-[10px] font-black px-3 py-1.5 rounded-full ${isLowStock ? 'bg-rose-50 text-danger animate-pulse' : 'bg-slate-50 text-slate-400 opacity-60'}`}>
            STOCK: {product.stock.toLocaleString()}
          </span>
        </div>
        <h3 className="font-black text-slate-800 text-xl line-clamp-2 leading-[1.2] group-hover:text-primary transition-colors">
          {product.name}
        </h3>
      </div>
      <div className="flex justify-between items-end">
        <div>
           <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Price Unit</p>
           <p className="text-slate-900 font-black text-2xl tracking-tighter">
             {product.price.toLocaleString()} <span className="text-xs text-slate-400 font-bold uppercase tracking-widest ml-1">LAK</span>
           </p>
        </div>
        <div className="w-14 h-14 bg-slate-50 rounded-[1.5rem] flex items-center justify-center group-hover:bg-primary group-hover:text-white group-hover:rotate-90 transition-all duration-500 border border-slate-100 shadow-inner group-hover:shadow-primary/30">
          <span className="text-3xl font-light leading-none">+</span>
        </div>
      </div>
    </div>
  );
};
