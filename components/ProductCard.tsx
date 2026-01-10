
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
      className="bg-white rounded-[3rem] p-10 shadow-premium hover:shadow-3xl hover:-translate-y-3 border border-white hover:border-indigo-100 cursor-pointer group flex flex-col justify-between h-72 transition-all duration-700 active:scale-95 overflow-hidden relative"
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-full -mr-16 -mt-16 group-hover:bg-indigo-50 transition-colors"></div>
      <div className="relative z-10">
        <div className="flex justify-between items-start mb-6">
          <span className="text-[9px] font-black text-primary uppercase tracking-[0.2em] bg-indigo-50 px-5 py-2 rounded-full border border-indigo-100/50">
            {product.category}
          </span>
          {isLowStock && (
            <span className="text-[9px] font-black bg-rose-50 text-danger px-3 py-1.5 rounded-full animate-pulse border border-rose-100">
              LOW STOCK
            </span>
          )}
        </div>
        <h3 className="font-black text-slate-900 text-2xl line-clamp-2 leading-[1.1] tracking-tight group-hover:text-primary transition-colors">
          {product.name}
        </h3>
      </div>
      <div className="flex justify-between items-end relative z-10">
        <div>
           <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">MSRP PRICE</p>
           <p className="text-slate-900 font-black text-3xl tracking-tighter">
             {product.price.toLocaleString()} <span className="text-sm text-slate-300 font-bold uppercase ml-1">LAK</span>
           </p>
        </div>
        <div className="w-16 h-16 bg-slate-900 rounded-[1.8rem] flex items-center justify-center text-white group-hover:bg-primary group-hover:scale-110 group-hover:rotate-90 transition-all duration-700 shadow-3xl">
          <span className="text-4xl font-light leading-none">+</span>
        </div>
      </div>
    </div>
  );
};
