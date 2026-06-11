import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const ICONS = {
  success: <CheckCircle size={16} className="text-success-500 shrink-0" />,
  error:   <XCircle    size={16} className="text-danger-500  shrink-0" />,
  warning: <AlertTriangle size={16} className="text-warning-500 shrink-0" />,
  info:    <Info       size={16} className="text-info-500    shrink-0" />,
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, type = 'info', duration = 3500) => {
    const id = Date.now();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), duration);
  }, []);

  const dismiss = useCallback((id) => setToasts(t => t.filter(x => x.id !== id)), []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[200] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl shadow-modal bg-ink-900 text-white text-sm max-w-sm animate-slide-in">
            {ICONS[t.type]}
            <span className="flex-1 text-surface-50">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="text-ink-300 hover:text-white transition-colors shrink-0">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be within ToastProvider');
  return ctx.toast;
};