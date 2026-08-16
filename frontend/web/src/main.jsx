import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './lib/auth.jsx';
import { I18nProvider } from './lib/i18n.jsx';
import { SiteSettingsProvider } from './lib/site-settings.jsx';
import { Toaster } from './lib/toast.jsx';
import './theme/global.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <I18nProvider>
        {/* Without this every useSiteSettings() caller reads the bundled fallback copy,
            which also leaves the admin's live preview with nothing to talk to. */}
        <SiteSettingsProvider>
          <AuthProvider>
            <Toaster />
            <App />
          </AuthProvider>
        </SiteSettingsProvider>
      </I18nProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
