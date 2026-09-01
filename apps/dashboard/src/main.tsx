import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './ui/theme.css';

const racine = document.getElementById('root');
if (racine === null) {
  // Une exception explicite plutôt qu'un `!` : si le point de montage
  // disparaissait du HTML, l'application ne rendrait rien et la console ne
  // dirait rien non plus.
  throw new Error('Point de montage #root introuvable dans index.html.');
}

createRoot(racine).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
