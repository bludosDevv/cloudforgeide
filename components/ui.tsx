import React from 'react';
import { Loader2 } from 'lucide-react';

export const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false, loading = false, ...props }: any) => {
  const baseStyle = "px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed select-none";
  const variants = {
    primary: "bg-primary-600 hover:bg-primary-500 text-white shadow-lg shadow-primary-900/20 border border-primary-500/50",
    secondary: "bg-gray-800 text-gray-200 border border-gray-700 hover:bg-gray-700 hover:border-gray-600",
    ghost: "text-gray-400 hover:bg-gray-800 hover:text-gray-200",
    danger: "bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20"
  };

  return (
    <button 
      onClick={onClick} 
      className={`${baseStyle} ${variants[variant as keyof typeof variants]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
};

export const Input = ({ label, error, ...props }: any) => (
  <div className="flex flex-col gap-1.5 w-full">
    {label && <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{label}</label>}
    <input 
      className={`px-3 py-2.5 rounded-lg border bg-gray-900 focus:outline-none focus:ring-2 transition-all text-gray-100 placeholder-gray-600 ${error ? 'border-red-500/50 focus:ring-red-500/20 focus:border-red-500' : 'border-gray-700 focus:ring-primary-500/20 focus:border-primary-500'}`}
      {...props}
    />
    {error && <p className="text-xs text-red-400 font-medium mt-0.5">{error}</p>}
  </div>
);

export const Select = ({ label, options, ...props }: any) => (
  <div className="flex flex-col gap-1.5 w-full">
    {label && <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{label}</label>}
    <select 
      className="px-3 py-2.5 rounded-lg border border-gray-700 bg-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-100 appearance-none"
      {...props}
    >
      {options.map((opt: any) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </div>
);

export const Card = ({ children, className = '' }: any) => (
  <div className={`bg-gray-900 rounded-xl border border-gray-800 shadow-xl ${className}`}>
    {children}
  </div>
);

export const Modal = ({ isOpen, onClose, title, children }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200 slide-in-from-bottom-5">
        <div className="px-6 py-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
          <h3 className="text-lg font-bold text-gray-100">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">&times;</button>
        </div>
        <div className="p-6 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};