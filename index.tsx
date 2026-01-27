import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Suppress benign ResizeObserver errors often caused by Monaco Editor's automatic layout
const ignoredErrors = [
  'ResizeObserver loop completed with undelivered notifications.',
  'ResizeObserver loop limit exceeded'
];

const originalError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && ignoredErrors.some(msg => args[0].includes(msg))) {
    return;
  }
  originalError.apply(console, args);
};

window.addEventListener('error', (e) => {
  if (ignoredErrors.includes(e.message)) {
    e.stopImmediatePropagation();
  }
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);