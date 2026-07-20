import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { store } from './app/Store';
import App from './App';
import './index.css';
import { io } from 'socket.io-client';
import { API_BASE_URL } from './config/api';

// Read Socket URL from .env
const SOCKET_URL = API_BASE_URL;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
        {/* Real-time Socket listener to receive agent notifications */}
        <SocketListener />
      </BrowserRouter>
    </Provider>
  </React.StrictMode>
);

function SocketListener() {
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem('userInfo');
      if (!raw) return;
      const user = JSON.parse(raw);

      // Connect using .env URL
      const socket = io(SOCKET_URL);
      socket.on('connect', () => {
        console.debug('Socket connected', socket.id);
      });

      socket.on('new-notification', (payload) => {
        try {
          if (!payload || !payload.agentId) return;
          if (String(payload.agentId) !== String(user._id)) return;

          const notif = payload.notification || payload;
          // Show a lightweight alert; replaceable with app toast
          alert(`${notif.title}: ${notif.message}`);

          // If metadata contains awardedGold, update stored user info
          if (notif.metadata && notif.metadata.awardedGold) {
            const stored = JSON.parse(localStorage.getItem('userInfo') || '{}');
            stored.goldCoins = (stored.goldCoins || 0) + Number(notif.metadata.awardedGold || 0);
            localStorage.setItem('userInfo', JSON.stringify(stored));
            // Reload to reflect changes in UI (optional)
            window.location.reload();
          }
        } catch (e) {
          console.error('Notification handler error', e);
        }
      });

      socket.on('disconnect', () => {
        console.log('Socket disconnected');
      });
      return () => {
        socket.disconnect();
      };
    } catch (err) {
      console.error('Socket connection error', err);
    }
  }, []);
  return null;
}
