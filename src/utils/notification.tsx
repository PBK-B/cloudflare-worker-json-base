import React, { useState, useCallback, useEffect } from 'react';
import { Message } from 'rsuite';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

let toastListeners: ((toasts: Toast[]) => void)[] = [];
let currentToasts: Toast[] = [];

const notifyListeners = () => {
  toastListeners.forEach(listener => listener([...currentToasts]));
};

export const notify = {
  success: (message: string) => {
    const toast: Toast = { id: Date.now().toString() + Math.random(), type: 'success', message };
    currentToasts = [...currentToasts, toast];
    notifyListeners();
    setTimeout(() => {
      currentToasts = currentToasts.filter(t => t.id !== toast.id);
      notifyListeners();
    }, 4000);
  },
  error: (message: string) => {
    const toast: Toast = { id: Date.now().toString() + Math.random(), type: 'error', message };
    currentToasts = [...currentToasts, toast];
    notifyListeners();
    setTimeout(() => {
      currentToasts = currentToasts.filter(t => t.id !== toast.id);
      notifyListeners();
    }, 4000);
  },
  warning: (message: string) => {
    const toast: Toast = { id: Date.now().toString() + Math.random(), type: 'warning', message };
    currentToasts = [...currentToasts, toast];
    notifyListeners();
    setTimeout(() => {
      currentToasts = currentToasts.filter(t => t.id !== toast.id);
      notifyListeners();
    }, 3500);
  },
  info: (message: string) => {
    const toast: Toast = { id: Date.now().toString() + Math.random(), type: 'info', message };
    currentToasts = [...currentToasts, toast];
    notifyListeners();
    setTimeout(() => {
      currentToasts = currentToasts.filter(t => t.id !== toast.id);
      notifyListeners();
    }, 3000);
  },
};

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const listener = (newToasts: Toast[]) => setToasts(newToasts);
    toastListeners.push(listener);
    return () => {
      toastListeners = toastListeners.filter(l => l !== listener);
    };
  }, []);

  return (
    <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999 }}>
      {toasts.map(toast => (
        <div key={toast.id} style={{ marginBottom: 10 }}>
          <Message 
            type={toast.type} 
            closable 
            style={{ width: 360 }}
            onClose={() => {
              currentToasts = currentToasts.filter(t => t.id !== toast.id);
              notifyListeners();
            }}
          >
            {toast.message}
          </Message>
        </div>
      ))}
    </div>
  );
};
