/// <reference types="vite/client" />
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { installTheme } from './ui/theme';
import { installCursors } from './ui/lib/cursors';
import { GoldIconDefs } from './ui/components/GoldIcons';

installTheme();
installCursors();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <GoldIconDefs />
    <App />
  </React.StrictMode>
);

declare const __BUILD_ID__: string;
if ('serviceWorker' in navigator && import.meta.env.PROD && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js?v=${__BUILD_ID__}`).catch(() => {});
  });
}
