import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./auth.jsx";
import { ToastProvider } from "./components/toast.jsx";
import "./styles.css";

// The demo build uses hash URLs so it works on any static host, such as GitHub Pages.
// eslint-disable-next-line react-refresh/only-export-components
const Router = import.meta.env.VITE_DEMO === "1" ? HashRouter : BrowserRouter;

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Router>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </Router>
  </StrictMode>
);
