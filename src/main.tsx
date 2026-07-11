import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppV3 } from './app/AppV3';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppV3 />
  </React.StrictMode>
);
