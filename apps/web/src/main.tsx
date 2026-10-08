import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthGate } from './AuthGate';
import '@xyflow/react/dist/style.css';
import './tailwind.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthGate />
  </React.StrictMode>,
);
