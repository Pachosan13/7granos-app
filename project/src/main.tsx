import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthOrgProvider } from './context/AuthOrgContext';
import './index.css';

const DEMO = import.meta.env.VITE_DEMO === '1';
if (typeof window !== 'undefined') {
  (window as any).__APP_DEMO__ = DEMO;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthOrgProvider>
        <App />
      </AuthOrgProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
