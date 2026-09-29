import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { prevezmiAdminOdkaz } from './admin/admin';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import './styl/global.css';

// Přihlašovací odkaz admina (#admin=<kód>) se převezme ještě před routerem:
// kód se uloží, fragment zmizí z adresy a aplikace startuje rovnou na /admin.
prevezmiAdminOdkaz(import.meta.env.BASE_URL);

ReactDOM.createRoot(document.getElementById('koren')!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
