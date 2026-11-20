import { createContext, useCallback, useContext, useRef, useState } from "react";
import { CircleCheck, TriangleAlert } from "lucide-react";

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef();
  const show = useCallback((message, tone = "ok") => {
    clearTimeout(timer.current);
    setToast({ message, tone });
    timer.current = setTimeout(() => setToast(null), 3800);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div className={`toast ${toast.tone === "error" ? "error" : ""}`} role="status">
          {toast.tone === "error" ? <TriangleAlert size={18} /> : <CircleCheck size={18} />}
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => useContext(ToastContext);
