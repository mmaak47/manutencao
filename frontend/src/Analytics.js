import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  FiTrendingUp,
  FiActivity,
  FiAlertCircle,
  FiCheckCircle,
  FiClock,
  FiDownload,
  FiRefreshCw,
  FiX
} from 'react-icons/fi';
import './Analytics.css';

const API_BASE = process.env.REACT_APP_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3001' : `${window.location.protocol}//${window.location.host}`);

function Analytics({ onClose }) {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/analytics`, {
        withCredentials: true
      });
      setAnalytics(response.data);
      setError('');
    } catch (err) {
      setError('Falha ao carregar análise');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format) => {
    setExporting(true);
    try {
      const response = await axios.get(`${API_BASE}/screens/export/${format}`, {
        withCredentials: true,
        responseType: format === 'csv' ? 'blob' : 'json'
      });

      const fileName = format === 'csv' ? 'screens_export.csv' : 'screens_export.json';
      const url = window.URL.createObjectURL(new Blob([format === 'csv' ? response.data : JSON.stringify(response.data, null, 2)]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert('Exportação falhou: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="analytics-modal">
        <div className="analytics-content">
          <div className="analytics-header">
            <h2>Analytics & Dashboard</h2>
            <button className="close-btn" onClick={onClose}>
              <FiX />
            </button>
          </div>
          <div className="loading">Carregando dados...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="analytics-modal">
        <div className="analytics-content">
          <div className="analytics-header">
            <h2>Análise & Painel</h2>
            <button className="close-btn" onClick={onClose}>
              <FiX />
            </button>
          </div>
          <div className="error-message">{error}</div>
          <button className="retry-btn" onClick={fetchAnalytics}>
            <FiRefreshCw /> Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-modal">
      <div className="analytics-content">
        <div className="analytics-header">
          <h2>Analytics & Dashboard</h2>
          <button className="close-btn" onClick={onClose}>
            <FiX />
          </button>
        </div>

        {/* Overview KPIs */}
        <div className="analytics-section">
          <h3>Visão Geral do Sistema</h3>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-icon kpi-icon-accent">
                <FiTrendingUp />
              </div>
              <div className="kpi-content">
                <div className="kpi-value">{analytics.overview.totalScreens}</div>
                <div className="kpi-label">Total de Displays</div>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon kpi-icon-success">
                <FiActivity />
              </div>
              <div className="kpi-content">
                <div className="kpi-value">{analytics.overview.onlineCount}</div>
                <div className="kpi-label">Online</div>
                <div className="kpi-percent">{analytics.overview.uptime}% disponibilidade</div>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon kpi-icon-danger">
                <FiAlertCircle />
              </div>
              <div className="kpi-content">
                <div className="kpi-value">{analytics.overview.offlineCount}</div>
                <div className="kpi-label">Offline</div>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon kpi-icon-warning">
                <FiAlertCircle />
              </div>
              <div className="kpi-content">
                <div className="kpi-value">{analytics.overview.criticalNeedsAttention}</div>
                <div className="kpi-label">Necessita Ação</div>
              </div>
            </div>
          </div>
        </div>

        {/* Workflow Status */}
        <div className="analytics-section">
          <h3>Distribuição de Status do Workflow</h3>
          <div className="status-grid">
            <div className="status-item">
              <FiClock className="status-icon status-icon-accent" />
              <div>
                <div className="status-value">{analytics.workflow.todo}</div>
                <div className="status-label">A Fazer</div>
              </div>
            </div>
            <div className="status-item">
              <FiActivity className="status-icon status-icon-warning" />
              <div>
                <div className="status-value">{analytics.workflow.ontheway}</div>
                <div className="status-label">Em Andamento</div>
              </div>
            </div>
            <div className="status-item">
              <FiCheckCircle className="status-icon status-icon-success" />
              <div>
                <div className="status-value">{analytics.workflow.complete}</div>
                <div className="status-label">Concluído</div>
              </div>
            </div>
          </div>
        </div>

        {/* Priority Distribution */}
        <div className="analytics-section">
          <h3>Níveis de Prioridade</h3>
          <div className="priority-grid">
            <div className="priority-item critical">
              <div className="priority-value">{analytics.priority.critical}</div>
              <div className="priority-label">⚠️ Crítica</div>
            </div>
            <div className="priority-item high">
              <div className="priority-value">{analytics.priority.high}</div>
              <div className="priority-label">⬆️ Alta</div>
            </div>
            <div className="priority-item medium">
              <div className="priority-value">{analytics.priority.medium}</div>
              <div className="priority-label">➡️ Média</div>
            </div>
            <div className="priority-item low">
              <div className="priority-value">{analytics.priority.low}</div>
              <div className="priority-label">⬇️ Baixa</div>
            </div>
          </div>
        </div>

        {/* Locations Summary */}
        <div className="analytics-section">
          <h3>Por Local</h3>
          <div className="locations-table">
            <table>
              <thead>
                <tr>
                  <th>Local</th>
                  <th>Total</th>
                  <th>Online</th>
                  <th>Offline</th>
                  <th>Crítica</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(analytics.locations).map(([loc, stats]) => (
                  <tr key={loc}>
                    <td>{loc}</td>
                    <td><strong>{stats.total}</strong></td>
                    <td><span className="value-positive">{stats.online}</span></td>
                    <td><span className="value-negative">{stats.offline}</span></td>
                    <td><span className="value-warning">{stats.critical}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Export Section */}
        <div className="analytics-section export-section">
          <h3>Exportar Dados</h3>
          <div className="export-buttons">
            <button 
              className="export-btn csv-btn"
              onClick={() => handleExport('csv')}
              disabled={exporting}
            >
              <FiDownload /> CSV
            </button>
            <button 
              className="export-btn json-btn"
              onClick={() => handleExport('json')}
              disabled={exporting}
            >
              <FiDownload /> JSON
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Analytics;
