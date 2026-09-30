import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import './index.css';
import App from './App.tsx';
import { AuthProvider } from './auth/AuthProvider';
import { BusinessModeProvider } from './business/BusinessModeProvider';
import { NotificationsProvider } from './notifications/NotificationsProvider';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <NotificationsProvider>
        <BusinessModeProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </BusinessModeProvider>
      </NotificationsProvider>
    </AuthProvider>
  </StrictMode>
);
