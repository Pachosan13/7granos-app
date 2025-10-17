import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthOrgProvider } from './context/AuthOrgContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthOrgProvider>
        <App />
      </AuthOrgProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
