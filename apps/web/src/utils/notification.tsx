import React, { useState, useCallback, useEffect } from 'react';
import { Message } from 'rsuite';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

let toastListeners: ((toasts: Toast[]) => void)[] = [];
let currentToasts: Toast[] = [];
let dismissTimer: ReturnType<typeof setTimeout> | null = null;
let showTimer: ReturnType<typeof setTimeout> | null = null;
let toastSequence = 0;
const TOAST_SWITCH_DELAY = 300;

const notifyListeners = () => {
  toastListeners.forEach(listener => listener([...currentToasts]));
};

const clearDismissTimer = () => {
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
};

const clearShowTimer = () => {
  if (showTimer) {
    clearTimeout(showTimer);
    showTimer = null;
  }
};

const removeToast = (id: string) => {
  if (currentToasts.some(toast => toast.id === id)) {
    currentToasts = currentToasts.filter(toast => toast.id !== id);
    notifyListeners();
  }
};

const showToast = (type: Toast['type'], message: string, duration?: number) => {
  clearDismissTimer();
  clearShowTimer();
  toastSequence += 1;
  const sequence = toastSequence;

  const toast: Toast = { id: Date.now().toString() + Math.random(), type, message };

  const renderToast = () => {
    if (sequence !== toastSequence) {
      return;
    }

    currentToasts = [toast];
    notifyListeners();
    showTimer = null;

    if (duration) {
      dismissTimer = setTimeout(() => {
        removeToast(toast.id);
        dismissTimer = null;
      }, duration);
    }
  };

  if (currentToasts.length > 0) {
    currentToasts = [];
    notifyListeners();
    showTimer = setTimeout(renderToast, TOAST_SWITCH_DELAY);
    return;
  }

  renderToast();
};

export const notify = {
  success: (message: string) => {
    showToast('success', message, 4000);
  },
  error: (message: string) => {
    showToast('error', message);
  },
  warning: (message: string) => {
    showToast('warning', message, 3500);
  },
  info: (message: string) => {
    showToast('info', message, 3000);
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

  const handleClose = useCallback((id: string) => {
    clearDismissTimer();
    clearShowTimer();
    removeToast(id);
  }, []);

  return (
    <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999 }}>
      {toasts.map(toast => (
        <div key={toast.id} style={{ marginBottom: 10 }}>
          <Message 
            type={toast.type} 
            closable 
            style={{ width: 360 }}
            onClose={() => handleClose(toast.id)}
          >
            {toast.message}
          </Message>
        </div>
      ))}
    </div>
  );
};
