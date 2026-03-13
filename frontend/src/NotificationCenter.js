import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  FiAlertCircle,
  FiCheckCircle,
  FiXCircle,
  FiBell,
  FiX
} from 'react-icons/fi';
import './NotificationCenter.css';

const API_BASE = process.env.REACT_APP_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3001' : `${window.location.protocol}//${window.location.host}`);

function NotificationCenter() {
  const [notifications, setNotifications] = useState([]);
  const [showCenter, setShowCenter] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Fetch alerts periodically
  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const [alertsRes, countRes] = await Promise.all([
          axios.get(`${API_BASE}/alerts`, {
            withCredentials: true
          }),
          axios.get(`${API_BASE}/alerts/count`, {
            withCredentials: true
          })
        ]);
        
        setNotifications(alertsRes.data.slice(0, 10));
        setUnreadCount(countRes.data.unreadCount);
      } catch (err) {
        console.error('Failed to fetch alerts:', err);
      }
    };

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 15000); // Check every 15 seconds
    return () => clearInterval(interval);
  }, []);

  const dismissAlert = async (alertId) => {
    try {
      await axios.put(`${API_BASE}/alerts/${alertId}/dismiss`, {}, {
        withCredentials: true
      });
      setNotifications(notifications.filter(n => n.id !== alertId));
    } catch (err) {
      console.error('Failed to dismiss alert:', err);
    }
  };

  const markAsRead = async (alertId) => {
    try {
      await axios.put(`${API_BASE}/alerts/${alertId}/read`, {}, {
        withCredentials: true
      });
      setNotifications(notifications.map(n => 
        n.id === alertId ? { ...n, read: true } : n
      ));
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'critical':
        return <FiXCircle className="severity-critical" />;
      case 'error':
        return <FiAlertCircle className="severity-error" />;
      case 'warning':
        return <FiAlertCircle className="severity-warning" />;
      case 'info':
        return <FiCheckCircle className="severity-info" />;
      default:
        return <FiBell className="severity-info" />;
    }
  };

  return (
    <div className="notification-center">
      {/* Bell Icon Button */}
      <button 
        className={`notification-bell ${unreadCount > 0 ? 'has-unread' : ''}`}
        onClick={() => setShowCenter(!showCenter)}
        title="Notificações"
      >
        <FiBell size={20} />
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {/* Notification Dropdown */}
      {showCenter && (
        <div className="notification-dropdown">
          <div className="notification-header">
            <h3>Alertas ({notifications.length})</h3>
            <button 
              className="close-notification-center"
              onClick={() => setShowCenter(false)}
            >
              <FiX />
            </button>
          </div>

          {notifications.length === 0 ? (
            <div className="notification-empty">
              ✓ Nenhum alerta no momento
            </div>
          ) : (
            <div className="notification-list">
              {notifications.map(notif => (
                <div 
                  key={notif.id}
                  className={`notification-item ${notif.severity} ${notif.read ? 'read' : 'unread'}`}
                >
                  <div className="notification-icon">
                    {getSeverityIcon(notif.severity)}
                  </div>
                  <div className="notification-content">
                    <div className="notification-title">{notif.title}</div>
                    <div className="notification-message">{notif.message}</div>
                    {notif.Screen && (
                      <div className="notification-screen">
                        Tela: {notif.Screen.name}
                      </div>
                    )}
                    <div className="notification-time">
                      {new Date(notif.createdAt).toLocaleString('pt-BR')}
                    </div>
                  </div>
                  <div className="notification-actions">
                    {!notif.read && (
                      <button 
                        className="action-btn"
                        title="Marcar como lido"
                        onClick={() => markAsRead(notif.id)}
                      >
                        ✓
                      </button>
                    )}
                    <button 
                      className="action-btn dismiss"
                      title="Descartar"
                      onClick={() => dismissAlert(notif.id)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationCenter;
