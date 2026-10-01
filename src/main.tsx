import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ThemeProvider } from './contexts/ThemeContext';
// Replace line 5 with this:
import { registerSW } from 'virtual:pwa-register';


// FIXED: Clean mobile-app update handling without heavy window reloads
registerSW({
  immediate: true, // Tells the service worker to skip-waiting and install immediately
  onNeedRefresh() {
    // Let the worker update in the background. 
    // The next time the user minimizes and resumes the app, the content updates naturally.
    console.log('New app bundle loaded in background.');
  },
  onOfflineReady() {
    console.log('justpae cached for offline mobile use.');
  }
});

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>
);
