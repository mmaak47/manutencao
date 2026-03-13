import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { FiMonitor, FiCheckCircle, FiAlertCircle, FiMinusCircle, FiPlus, FiSearch, FiClock, FiLogOut, FiUserPlus, FiPhone, FiTrash2, FiChevronDown, FiChevronUp, FiKey, FiBarChart2, FiFileText, FiPrinter, FiDatabase, FiDownload, FiSettings, FiMenu, FiRefreshCw, FiEdit, FiEye, FiEyeOff, FiStar, FiCalendar, FiMapPin, FiPackage, FiTag, FiUser, FiTool, FiChevronLeft, FiChevronRight, FiMoon, FiSun, FiClipboard, FiZap, FiTrendingUp, FiActivity, FiBell, FiSend, FiToggleLeft, FiToggleRight, FiDollarSign, FiUserCheck } from 'react-icons/fi';
import logo from './assets/logo.png';
import logoBlack from './assets/logo-black.png';
import Analytics from './Analytics';
import NotificationCenter from './NotificationCenter';
import './App.css';

const API_BASE = process.env.REACT_APP_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3001' : `${window.location.protocol}//${window.location.host}`);
const REPORT_STORAGE_KEY = 'maintenance_report_rows_v1';
const EMPTY_TICKET_FORM = { title: '', description: '', category: 'general', priority: 'medium', screenId: '', assignedTo: '', timeSpentMinutes: '', actualCost: '' };
const EMPTY_SCHEDULE_FORM = { title: '', description: '', scheduledDate: '', scheduledTime: '', assignedTo: '', screenId: '', location: '', color: '#E95D34' };

const normalizeRole = (role) => {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'admin') return 'admin';
  if (['comercial', 'commercial', 'sales'].includes(normalized)) return 'comercial';
  return 'user';
};
const normalizeUserPayload = (user) => user ? ({ ...user, role: normalizeRole(user.role) }) : null;

const formatNameToken = (value) => {
  const token = String(value || '').trim();
  if (!token) return '';
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
};

const getUserDisplayName = (user) => {
  const firstName = String(user?.firstName || '').trim();
  const lastName = String(user?.lastName || '').trim();
  const fullName = `${firstName} ${lastName}`.trim();
  if (fullName) return fullName;

  const username = String(user?.username || '').trim();
  if (username) {
    const parts = username.split(/[._\-\s]+/).filter(Boolean);
    if (parts.length > 1) {
      return parts.map(formatNameToken).join(' ');
    }
    return username;
  }

  const emailPrefix = String(user?.email || '').split('@')[0].trim();
  if (!emailPrefix) return 'Usuário';
  return emailPrefix.split(/[._\-\s]+/).filter(Boolean).map(formatNameToken).join(' ') || emailPrefix;
};

const getUserInitial = (user) => {
  const displayName = getUserDisplayName(user);
  return displayName.charAt(0).toUpperCase() || 'U';
};

function App() {
  const [screens, setScreens] = useState([]);
  const [selected, setSelected] = useState(null);
  const [notes, setNotes] = useState([]);
  const [events, setEvents] = useState([]);
  const [noteText, setNoteText] = useState('');
  const [newScreenName, setNewScreenName] = useState('');
  const [newScreenDisplayId, setNewScreenDisplayId] = useState('');
  const [locations, setLocations] = useState([]);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [newLocationInsercoes, setNewLocationInsercoes] = useState('1');
  const [newLocationAddress, setNewLocationAddress] = useState('');
  const [collapsedLocations, setCollapsedLocations] = useState({});
  const [cityFilter, setCityFilter] = useState('all');
  const [editingLocation, setEditingLocation] = useState(null);
  const [editLocationName, setEditLocationName] = useState('');
  const [editLocationAddress, setEditLocationAddress] = useState('');
  const [selectedLocationForNewScreen, setSelectedLocationForNewScreen] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [displayUrl, setDisplayUrl] = useState('');
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showScreenModal, setShowScreenModal] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const [activePage, setActivePage] = useState('maintenance');
  const [eventFilterStatus, setEventFilterStatus] = useState('all');
  const [eventFrom, setEventFrom] = useState('');
  const [eventTo, setEventTo] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerRole, setRegisterRole] = useState('user');
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [appAlert, setAppAlert] = useState({ open: false, message: '', type: 'info' });
  const [contacts, setContacts] = useState([]);
  const [contactName, setContactName] = useState('');
  const [contactTarget, setContactTarget] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [showContactModal, setShowContactModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [leftPanelWidth, setLeftPanelWidth] = useState(30);
  const [isDraggingHorizontal, setIsDraggingHorizontal] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [selectedScreenIds, setSelectedScreenIds] = useState(new Set());
  const [batchPriority, setBatchPriority] = useState('medium');
  const [batchWorkflowStatus, setBatchWorkflowStatus] = useState('todo');
  const [reportScreenId, setReportScreenId] = useState('');
  const [reportCity, setReportCity] = useState('');
  const [reportPointName, setReportPointName] = useState('');
  const [reportAddress, setReportAddress] = useState('');
  const [reportDisplayId, setReportDisplayId] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [reportOfflineSince, setReportOfflineSince] = useState('');
  const [reportRows, setReportRows] = useState([]);
  const [backups, setBackups] = useState([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [liveViewActive, setLiveViewActive] = useState(false);
  const [liveFrame, setLiveFrame] = useState('');
  const [liveLoading, setLiveLoading] = useState(false);
  const [showOriginEditModal, setShowOriginEditModal] = useState(false);
  const [originFormData, setOriginFormData] = useState(null);
  const [originFormLoading, setOriginFormLoading] = useState(false);
  const [originSaving, setOriginSaving] = useState(false);
  const liveViewRef = useRef({ active: false, screenId: null });

  // NEW FEATURE STATES
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');
  const [tickets, setTickets] = useState([]);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [ticketForm, setTicketForm] = useState(EMPTY_TICKET_FORM);
  const [editingTicket, setEditingTicket] = useState(null);
  const [ticketFilter, setTicketFilter] = useState('all');
  const [schedules, setSchedules] = useState([]);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleForm, setScheduleForm] = useState(EMPTY_SCHEDULE_FORM);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [parts, setParts] = useState([]);
  const [showPartModal, setShowPartModal] = useState(false);
  const [partForm, setPartForm] = useState({ name: '', category: 'other', quantity: 0, minQuantity: 1, location: '', notes: '', unitCost: '' });
  const [editingPart, setEditingPart] = useState(null);
  const [usersList, setUsersList] = useState([]);
  const [slaData, setSlaData] = useState(null);
  const [patterns, setPatterns] = useState([]);
  const [loopAuditData, setLoopAuditData] = useState({ targetSeconds: 180, summary: null, items: [], lastSyncAt: null, syncInProgress: false });
  const [loopAuditLoading, setLoopAuditLoading] = useState(false);
  const [loopAuditSyncing, setLoopAuditSyncing] = useState(false);
  const [checklistTemplates, setChecklistTemplates] = useState([]);
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const [checklistForm, setChecklistForm] = useState({ name: '', category: '', items: '' });
  const [ticketStats, setTicketStats] = useState(null);
  const [notifConfig, setNotifConfig] = useState(null);
  const [notifTestPhone, setNotifTestPhone] = useState('');
  const [editingScreenInfo, setEditingScreenInfo] = useState(false);
  const [screenInfoForm, setScreenInfoForm] = useState({});
  const [diagnosticsData, setDiagnosticsData] = useState(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsHours, setDiagnosticsHours] = useState(24);
  const [maintenanceHistoryData, setMaintenanceHistoryData] = useState(null);
  const [maintenanceHistoryLoading, setMaintenanceHistoryLoading] = useState(false);

  // Contracts & Vendors
  const [contracts, setContracts] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [contractsSyncing, setContractsSyncing] = useState(false);
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [vendorForm, setVendorForm] = useState({ name: '', phone: '', email: '' });
  const [editingVendor, setEditingVendor] = useState(null);
  const [contractsTab, setContractsTab] = useState('contracts');
  const [loopCityFilter, setLoopCityFilter] = useState('all');
  const [loopVendorFilter, setLoopVendorFilter] = useState('all');

  const userMenuRef = useRef(null);
  const reportsLoadedRef = useRef(false);
  const detailPanelRef = useRef(null);
  const regVideoRef = useRef(null);
  const regStreamRef = useRef(null);

  // ===== SELF-REGISTER STATE =====
  const [showSelfRegister, setShowSelfRegister] = useState(false);
  const [regForm, setRegForm] = useState({ firstName: '', lastName: '', cpf: '', email: '', password: '', confirmPassword: '' });
  const [regPhotoPreview, setRegPhotoPreview] = useState(null);
  const [regPhotoData, setRegPhotoData] = useState(null);
  const [regCameraOpen, setRegCameraOpen] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [regSuccess, setRegSuccess] = useState(false);
  const [regError, setRegError] = useState('');
  const [regPhotoTab, setRegPhotoTab] = useState('upload');

  // ===== PENDING REGISTRATIONS STATE (admin) =====
  const [pendingRegistrations, setPendingRegistrations] = useState([]);
  const [pendingRegLoading, setPendingRegLoading] = useState(false);
  const [regRejectModal, setRegRejectModal] = useState(null);
  const [regRejectReason, setRegRejectReason] = useState('');
  const [regStatusFilter, setRegStatusFilter] = useState('pending');
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);

  // Origin system edit: fetch form data for a monitor
  const openOriginEdit = async (screen) => {
    if (!screen?.originId) return showAlert('Este monitor não tem ID de origem', 'error');
    setOriginFormLoading(true);
    setShowOriginEditModal(true);
    try {
      const res = await axios.get(`${API_BASE}/origin/monitor-form/${screen.originId}`, authConfig);
      setOriginFormData(res.data);
    } catch (err) {
      showAlert('Erro ao carregar dados do monitor: ' + err.message, 'error');
      setShowOriginEditModal(false);
    }
    setOriginFormLoading(false);
  };

  const saveOriginMonitor = async () => {
    if (!originFormData) return;
    setOriginSaving(true);
    try {
      await axios.post(`${API_BASE}/origin/monitor-save`, originFormData, authConfig);
      showAlert(originFormData.id ? 'Monitor atualizado no sistema de origem!' : 'Monitor adicionado no sistema de origem!', 'success');
      setShowOriginEditModal(false);
      setOriginFormData(null);
    } catch (err) {
      showAlert('Erro ao salvar: ' + (err.response?.data?.error || err.message), 'error');
    }
    setOriginSaving(false);
  };

  const openOriginAdd = () => {
    setOriginFormData({
      id: '',
      nome: '',
      polegadas: '',
      tipo_tela: '1',
      player: 'Android',
      barra: '1',
      orientacao: 'I,100,0',
      player_width: '100%',
      player_height: '100%',
      vinculo: '',
      tempo_ciclo: '300',
      informacoes: '',
      options: null
    });
    setOriginFormLoading(true);
    setShowOriginEditModal(true);
    // Fetch options from any existing monitor form
    axios.get(`${API_BASE}/origin/monitor-form/264`, authConfig)
      .then(res => {
        setOriginFormData(prev => ({ ...prev, options: res.data.options }));
        setOriginFormLoading(false);
      })
      .catch(() => setOriginFormLoading(false));
  };

  // Live view: activate video stream, poll frames from origin system
  const startLiveView = async (screenId) => {
    stopLiveView();
    setLiveViewActive(true);
    setLiveLoading(true);
    setLiveFrame('');
    liveViewRef.current = { active: true, screenId };

    try {
      await axios.post(`${API_BASE}/screens/${screenId}/video/start`, {}, authConfig);
    } catch (err) {
      console.error('Failed to activate video:', err);
    }

    const pollFrame = async () => {
      if (!liveViewRef.current.active) return;
      try {
        const res = await axios.post(`${API_BASE}/screens/${screenId}/video/frame`, {}, authConfig);
        if (res.data.success && res.data.frame) {
          setLiveFrame(res.data.frame);
          setLiveLoading(false);
        }
      } catch (err) { /* ignore frame errors */ }
      if (liveViewRef.current.active) {
        setTimeout(pollFrame, 1500);
      }
    };
    pollFrame();
  };

  const stopLiveView = async () => {
    const prev = liveViewRef.current;
    liveViewRef.current = { active: false, screenId: null };
    setLiveViewActive(false);
    setLiveFrame('');
    if (prev.active && prev.screenId) {
      try {
        await axios.post(`${API_BASE}/screens/${prev.screenId}/video/stop`, {}, authConfig);
      } catch (err) { /* ignore */ }
    }
  };

  const sendCommand = async (screenId, action, label) => {
    try {
      await axios.post(`${API_BASE}/screens/${screenId}/command`, { action }, authConfig);
      showAlert(`Comando "${label}" enviado com sucesso!`, 'success');
    } catch (err) {
      showAlert(`Erro ao enviar comando: ${err.message}`, 'error');
    }
  };

  const authConfig = { withCredentials: true };

  const showAlert = (message, type = 'info') => {
    setAppAlert({ open: true, message, type });
  };

  const formatCurrency = (value) => {
    const amount = Number(value || 0);
    return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const getPhoneDigits = (phoneValue = '') => phoneValue.replace(/\D/g, '');

  const formatPhone = (phoneValue = '') => {
    const digits = getPhoneDigits(phoneValue).slice(0, 13);
    if (!digits) return '';

    const localDigits = digits.startsWith('55') ? digits.slice(2) : digits;

    if (localDigits.length <= 10) {
      const ddd = localDigits.slice(0, 2);
      const part1 = localDigits.slice(2, 6);
      const part2 = localDigits.slice(6, 10);
      if (!ddd) return localDigits;
      if (!part1) return `(${ddd}`;
      if (!part2) return `(${ddd}) ${part1}`;
      return `(${ddd}) ${part1}-${part2}`;
    }

    const ddd = localDigits.slice(0, 2);
    const part1 = localDigits.slice(2, 7);
    const part2 = localDigits.slice(7, 11);
    if (!part2) return `(${ddd}) ${part1}`;
    return `(${ddd}) ${part1}-${part2}`;
  };

  const getWhatsappLink = (phoneValue = '') => {
    const digits = getPhoneDigits(phoneValue);
    if (!digits) return '#';

    let waDigits = digits;
    if (waDigits.length === 10 || waDigits.length === 11) {
      waDigits = `55${waDigits}`;
    }

    return `https://wa.me/${waDigits}`;
  };

  const closeAlert = () => {
    setAppAlert({ open: false, message: '', type: 'info' });
  };

  // Fetch all screens
  useEffect(() => {
    loadLocations();
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(REPORT_STORAGE_KEY);
      if (!raw) {
        reportsLoadedRef.current = true;
        return;
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        reportsLoadedRef.current = true;
        return;
      }

      const normalized = parsed.map((row) => ({
        id: row.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        city: row.city || 'Sem Cidade',
        pointName: row.pointName || '',
        address: row.address || '',
        displayId: row.displayId || '',
        description: row.description || '',
        offlineSince: row.offlineSince || '',
        status: row.status || 'Pendente',
        comments: row.comments || ''
      }));

      setReportRows(normalized);
    } catch (err) {
      console.error('Falha ao carregar relatórios locais', err);
    } finally {
      reportsLoadedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!reportsLoadedRef.current) return;
    try {
      localStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify(reportRows));
    } catch (err) {
      console.error('Falha ao salvar relatórios locais', err);
    }
  }, [reportRows]);

  useEffect(() => {
    if (!authToken) return;
    fetchCurrentUser();
    fetchScreens();
    fetchContacts();
    fetchUsers();
    // Pre-load pending registrations count for admin badge
    fetchPendingRegistrations('pending');

    // Auto-refresh screens every 5 seconds
    const refreshInterval = setInterval(() => {
      fetchScreens();
    }, 5000);
    return () => clearInterval(refreshInterval);
  }, [authToken]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await fetchCurrentUser();
      if (mounted) setSessionChecked(true);
    })();
    return () => { mounted = false; };
  }, []);

  // Dark mode toggle
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  // Fetch data on page change
  useEffect(() => {
    if (!authToken) return;
    if (activePage === 'tickets') { fetchTickets(); fetchTicketStats(); fetchChecklistTemplates(); }
    if (activePage === 'calendar') { fetchSchedules(); }
    if (activePage === 'inventory') { fetchParts(); }
    if (activePage === 'analytics-pro') { fetchPatterns(); fetchTicketStats(); fetchLoopAudits(); }
    if (activePage === 'notifications') { fetchNotifConfig(); }
    if (activePage === 'approvals') { fetchPendingRegistrations(regStatusFilter); fetchAdminUsers(); fetchUsers(); }
  }, [activePage, authToken, calendarMonth, calendarYear]);

  useEffect(() => {
    if (!appAlert.open || appAlert.type !== 'success') return;

    const timeoutId = setTimeout(() => {
      setAppAlert((prev) => {
        if (!prev.open || prev.type !== 'success') return prev;
        return { open: false, message: '', type: 'info' };
      });
    }, 2000);

    return () => clearTimeout(timeoutId);
  }, [appAlert.open, appAlert.type]);

  useEffect(() => {
    if (!showUserMenu) return;

    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserMenu]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [activePage, showAnalytics]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setIsMobileMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Keyboard support: Esc closes menus/modals
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShowUserMenu(false);
        setIsMobileMenuOpen(false);
        setShowChangePasswordModal(false);
        setShowRegisterModal(false);
        setShowContactModal(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Resize handlers for panels
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDraggingHorizontal) {
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
          const rect = mainContent.getBoundingClientRect();
          const newWidth = ((e.clientX - rect.left) / rect.width) * 100;
          if (newWidth > 15 && newWidth < 70) {
            setLeftPanelWidth(newWidth);
          }
        }
      }
    };

    const handleMouseUp = () => {
      setIsDraggingHorizontal(false);
    };

    if (isDraggingHorizontal) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDraggingHorizontal]);

  const loadLocations = () => {
    try {
      const raw = localStorage.getItem('locations');
      const parsed = raw ? JSON.parse(raw) : [];
      const normalized = parsed.map((loc) => {
        if (typeof loc === 'string') {
          return { name: loc, insercoes: 1 };
        }
        return { name: loc.name, insercoes: Number(loc.insercoes) || 1, address: loc.address || '' };
      });
      setLocations(normalized);
    } catch (err) {
      setLocations([]);
    }
  };

  const saveLocations = (list) => {
    try {
      localStorage.setItem('locations', JSON.stringify(list));
      setLocations(list);
    } catch (err) {
      console.error('Failed saving locations', err);
    }
  };

  const fetchScreens = async () => {
    if (!authToken) return;
    try {
      const res = await axios.get(`${API_BASE}/screens`, authConfig);
      setScreens(res.data);
    } catch (err) {
      console.error('Error fetching screens:', err);
    }
  };

  const fetchContacts = async () => {
    if (!authToken) return;
    try {
      const res = await axios.get(`${API_BASE}/contacts`, authConfig);
      setContacts(res.data);
    } catch (err) {
      console.error('Error fetching contacts:', err);
    }
  };

  const fetchTickets = async () => {
    if (!authToken) return;
    try {
      const res = await axios.get(`${API_BASE}/tickets`, authConfig);
      setTickets(res.data);
    } catch (err) { console.error('Error fetching tickets:', err); }
  };

  const fetchTicketStats = async () => {
    if (!authToken) return;
    try {
      const res = await axios.get(`${API_BASE}/tickets/stats/summary`, authConfig);
      setTicketStats(res.data);
    } catch (err) { console.error('Error fetching ticket stats:', err); }
  };

  const fetchSchedules = async () => {
    if (!authToken) return;
    try {
      const res = await axios.get(`${API_BASE}/schedules?month=${calendarMonth + 1}&year=${calendarYear}`, authConfig);
      setSchedules(res.data);
    } catch (err) { console.error('Error fetching schedules:', err); }
  };

  const fetchParts = async () => {
    if (!authToken) return;
    try {
      const res = await axios.get(`${API_BASE}/parts`, authConfig);
      setParts(res.data);
    } catch (err) { console.error('Error fetching parts:', err); }
  };

  const fetchUsers = async () => {
    if (!authToken) return;
    try {
      const res = await axios.get(`${API_BASE}/users`, authConfig);
      setUsersList(res.data);
    } catch (err) { console.error('Error fetching users:', err); }
  };

  const fetchPatterns = async () => {
    if (!authToken) return;
    try {
      const res = await axios.get(`${API_BASE}/patterns`, authConfig);
      setPatterns(res.data);
    } catch (err) { console.error('Error fetching patterns:', err); }
  };

  const fetchMaintenanceHistory = async (screenId) => {
    if (!authToken || !screenId) return;
    setMaintenanceHistoryLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/screens/${screenId}/maintenance-history`, authConfig);
      setMaintenanceHistoryData(res.data);
    } catch (err) {
      console.error('Error fetching maintenance history:', err);
      setMaintenanceHistoryData(null);
    } finally {
      setMaintenanceHistoryLoading(false);
    }
  };

  const fetchLoopAudits = async () => {
    if (!authToken) return;
    setLoopAuditLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/loops/summary`, authConfig);
      const payload = res.data || {};
      setLoopAuditData({
        targetSeconds: payload.targetSeconds || 180,
        summary: payload.summary || null,
        items: Array.isArray(payload.items) ? payload.items : [],
        lastSyncAt: payload.lastSyncAt || null,
        syncInProgress: Boolean(payload.syncInProgress)
      });
    } catch (err) {
      console.error('Error fetching loop audits:', err);
      setLoopAuditData({ targetSeconds: 180, summary: null, items: [], lastSyncAt: null, syncInProgress: false });
    } finally {
      setLoopAuditLoading(false);
    }
  };

  const syncLoopAudits = async () => {
    if (!authToken || currentUser?.role !== 'admin') return;
    setLoopAuditSyncing(true);
    try {
      const res = await axios.post(`${API_BASE}/loops/sync`, {}, authConfig);
      if (res.status === 202 || res.data?.skipped) {
        showAlert('A sincronização de loop já está em andamento. Aguarde alguns minutos.', 'info');
      } else {
        showAlert('Auditoria de loop atualizada com sucesso.', 'success');
      }
      await fetchLoopAudits();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Erro ao sincronizar loops.', 'error');
    } finally {
      setLoopAuditSyncing(false);
    }
  };

  const fetchChecklistTemplates = async () => {
    if (!authToken) return;
    try {
      const res = await axios.get(`${API_BASE}/checklist-templates`, authConfig);
      setChecklistTemplates(res.data);
    } catch (err) { console.error('Error fetching checklist templates:', err); }
  };

  const fetchNotifConfig = async () => {
    if (!authToken) return;
    try {
      const res = await axios.get(`${API_BASE}/notification-config`, authConfig);
      setNotifConfig(res.data);
    } catch (err) { console.error('Error fetching notif config:', err); }
  };

  const saveNotifConfig = async (updates) => {
    try {
      const res = await axios.patch(`${API_BASE}/notification-config`, updates, authConfig);
      setNotifConfig(res.data);
      showAlert('Configuração salva!', 'success');
    } catch (err) { showAlert('Erro ao salvar: ' + (err.response?.data?.error || err.message), 'error'); }
  };

  const testNotification = async () => {
    try {
      const res = await axios.post(`${API_BASE}/notification-config/test`, { phone: notifTestPhone }, authConfig);
      showAlert(res.data.message, 'success');
    } catch (err) { showAlert(err.response?.data?.error || 'Erro ao enviar teste', 'error'); }
  };

  // TICKET CRUD
  const saveTicket = async () => {
    try {
      if (!ticketForm.title) return showAlert('Título é obrigatório', 'warning');
      if (editingTicket) {
        await axios.patch(`${API_BASE}/tickets/${editingTicket.id}`, ticketForm, authConfig);
        showAlert('Ticket atualizado!', 'success');
      } else {
        await axios.post(`${API_BASE}/tickets`, ticketForm, authConfig);
        showAlert('Ticket criado!', 'success');
      }
      setShowTicketModal(false);
      setEditingTicket(null);
      setTicketForm(EMPTY_TICKET_FORM);
      fetchTickets();
      fetchTicketStats();
    } catch (err) { showAlert('Erro: ' + (err.response?.data?.error || err.message), 'error'); }
  };

  const deleteTicket = async (id) => {
    if (!window.confirm('Excluir este ticket?')) return;
    try {
      await axios.delete(`${API_BASE}/tickets/${id}`, authConfig);
      fetchTickets();
      fetchTicketStats();
    } catch (err) { showAlert('Erro ao excluir', 'error'); }
  };

  const updateTicketStatus = async (id, status) => {
    try {
      await axios.patch(`${API_BASE}/tickets/${id}`, { status }, authConfig);
      fetchTickets();
      fetchTicketStats();
    } catch (err) { showAlert('Erro ao atualizar', 'error'); }
  };

  // SCHEDULE CRUD
  const saveSchedule = async () => {
    try {
      if (!scheduleForm.title || !scheduleForm.scheduledDate) return showAlert('Título e data são obrigatórios', 'warning');
      await axios.post(`${API_BASE}/schedules`, scheduleForm, authConfig);
      showAlert('Agendamento criado!', 'success');
      setShowScheduleModal(false);
      setScheduleForm(EMPTY_SCHEDULE_FORM);
      fetchSchedules();
    } catch (err) { showAlert('Erro: ' + (err.response?.data?.error || err.message), 'error'); }
  };

  const deleteSchedule = async (id) => {
    if (!window.confirm('Excluir agendamento?')) return;
    try {
      await axios.delete(`${API_BASE}/schedules/${id}`, authConfig);
      fetchSchedules();
    } catch (err) { showAlert('Erro ao excluir', 'error'); }
  };

  // PARTS CRUD
  const savePart = async () => {
    try {
      if (!partForm.name) return showAlert('Nome é obrigatório', 'warning');
      if (editingPart) {
        await axios.patch(`${API_BASE}/parts/${editingPart.id}`, partForm, authConfig);
        showAlert('Peça atualizada!', 'success');
      } else {
        await axios.post(`${API_BASE}/parts`, partForm, authConfig);
        showAlert('Peça adicionada!', 'success');
      }
      setShowPartModal(false);
      setEditingPart(null);
      setPartForm({ name: '', category: 'other', quantity: 0, minQuantity: 1, location: '', notes: '', unitCost: '' });
      fetchParts();
    } catch (err) { showAlert('Erro: ' + (err.response?.data?.error || err.message), 'error'); }
  };

  const deletePart = async (id) => {
    if (!window.confirm('Excluir esta peça?')) return;
    try {
      await axios.delete(`${API_BASE}/parts/${id}`, authConfig);
      fetchParts();
    } catch (err) { showAlert('Erro ao excluir', 'error'); }
  };

  // CHECKLIST TEMPLATE CRUD
  const saveChecklistTemplate = async () => {
    try {
      if (!checklistForm.name || !checklistForm.items) return showAlert('Nome e itens são obrigatórios', 'warning');
      await axios.post(`${API_BASE}/checklist-templates`, checklistForm, authConfig);
      showAlert('Template criado!', 'success');
      setShowChecklistModal(false);
      setChecklistForm({ name: '', category: '', items: '' });
      fetchChecklistTemplates();
    } catch (err) { showAlert('Erro: ' + (err.response?.data?.error || err.message), 'error'); }
  };

  // FAVORITES
  const toggleFavorite = async (screenId) => {
    try {
      await axios.patch(`${API_BASE}/screens/${screenId}/favorite`, {}, authConfig);
      fetchScreens();
    } catch (err) { console.error('Error toggling favorite:', err); }
  };

  // AUTO-DIAGNOSE
  const autoDiagnose = async (screenId) => {
    if (!window.confirm('Enviar comando de reboot remoto para este display?')) return;
    try {
      const res = await axios.post(`${API_BASE}/screens/${screenId}/auto-diagnose`, {}, authConfig);
      showAlert(res.data.message, 'success');
    } catch (err) { showAlert('Erro: ' + (err.response?.data?.error || err.message), 'error'); }
  };

  const saveContact = async () => {
    if (!contactName.trim() || !contactTarget || !contactPhone.trim()) {
      showAlert('Preencha Nome, Local e Contato.', 'warning');
      return false;
    }

    const normalizedPhoneDigits = getPhoneDigits(contactPhone);
    if (normalizedPhoneDigits.length < 10) {
      showAlert('Contato inválido. Informe DDD + número (mínimo 10 dígitos).', 'warning');
      return false;
    }

    const [targetType, ...targetParts] = contactTarget.split(':');
    const targetValue = targetParts.join(':');

    if (!['local', 'screen'].includes(targetType) || !targetValue) {
      showAlert('Seleção de Local inválida.', 'error');
      return false;
    }

    try {
      await axios.post(`${API_BASE}/contacts`, {
        name: contactName.trim(),
        phone: formatPhone(contactPhone),
        targetType,
        targetValue
      }, authConfig);

      setContactName('');
      setContactTarget('');
      setContactPhone('');
      await fetchContacts();
      showAlert('Contato salvo com sucesso.', 'success');
      return true;
    } catch (err) {
      const message = err.response?.data?.error || err.message;
      showAlert('Erro ao salvar contato: ' + message, 'error');
      return false;
    }
  };

  const deleteContact = async (contactId) => {
    try {
      await axios.delete(`${API_BASE}/contacts/${contactId}`, authConfig);
      await fetchContacts();
      showAlert('Contato removido com sucesso.', 'success');
    } catch (err) {
      const message = err.response?.data?.error || err.message;
      showAlert('Erro ao remover contato: ' + message, 'error');
    }
  };

  const fetchCurrentUser = async () => {
    try {
      await axios.get(`${API_BASE}/auth/csrf`, authConfig);
      const res = await axios.get(`${API_BASE}/auth/me`, authConfig);
      const userPayload = normalizeUserPayload(res.data);
      setCurrentUser(userPayload);
      setAuthToken('cookie-session');
    } catch (err) {
      if (err.response?.status === 401) {
        try {
          await axios.post(`${API_BASE}/auth/refresh`, {}, authConfig);
          const retryRes = await axios.get(`${API_BASE}/auth/me`, authConfig);
          const userPayload = normalizeUserPayload(retryRes.data);
          setCurrentUser(userPayload);
          setAuthToken('cookie-session');
          return;
        } catch (refreshErr) {
          // Fall through to local session cleanup.
        }
      }

      setAuthToken('');
      setCurrentUser(null);
    }
  };

  // ===== SELF-REGISTER HELPERS =====
  const validateCPFFrontend = (cpf) => {
    const n = cpf.replace(/\D/g, '');
    if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(n[i]) * (10 - i);
    let d1 = (sum * 10) % 11; if (d1 >= 10) d1 = 0;
    if (d1 !== parseInt(n[9])) return false;
    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(n[i]) * (11 - i);
    let d2 = (sum * 10) % 11; if (d2 >= 10) d2 = 0;
    return d2 === parseInt(n[10]);
  };

  const checkPasswordStrength = (pwd) => ({
    length: pwd.length >= 12,
    upper: /[A-Z]/.test(pwd),
    lower: /[a-z]/.test(pwd),
    number: /[0-9]/.test(pwd),
    special: /[!@#$%^&*(),.?":{}|<>_\-+=[\]\\\/]/.test(pwd),
  });

  const formatCPFInput = (value) => {
    const n = value.replace(/\D/g, '').slice(0, 11);
    return n.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4')
            .replace(/(\d{3})(\d{3})(\d{1,3})$/, '$1.$2.$3')
            .replace(/(\d{3})(\d{1,3})$/, '$1.$2');
  };

  const resizeImageToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxSize = 800;
        let { width, height } = img;
        if (width > height) { if (width > maxSize) { height = Math.round(height * maxSize / width); width = maxSize; } }
        else { if (height > maxSize) { width = Math.round(width * maxSize / height); height = maxSize; } }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const openRegCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      regStreamRef.current = stream;
      setRegCameraOpen(true);
      setTimeout(() => { if (regVideoRef.current) regVideoRef.current.srcObject = stream; }, 80);
    } catch (err) { setRegError('Não foi possível acessar a câmera: ' + err.message); }
  };

  const closeRegCamera = () => {
    if (regStreamRef.current) { regStreamRef.current.getTracks().forEach(t => t.stop()); regStreamRef.current = null; }
    setRegCameraOpen(false);
  };

  const captureRegPhoto = () => {
    const video = regVideoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640; canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
    setRegPhotoPreview(dataUrl);
    setRegPhotoData(dataUrl);
    closeRegCamera();
  };

  const submitSelfRegister = async (e) => {
    e.preventDefault();
    setRegError('');
    const { firstName, lastName, cpf, email, password, confirmPassword } = regForm;
    if (!firstName.trim() || !lastName.trim() || !cpf || !email || !password) {
      return setRegError('Preencha todos os campos obrigatórios.');
    }
    if (!validateCPFFrontend(cpf)) return setRegError('CPF inválido. Verifique os dígitos verificadores.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setRegError('E-mail inválido.');
    const strength = checkPasswordStrength(password);
    if (!Object.values(strength).every(Boolean)) return setRegError('Senha fraca. Use no mínimo 12 caracteres com maiúscula, minúscula, número e símbolo.');
    if (password !== confirmPassword) return setRegError('Confirmação de senha não confere.');
    setRegLoading(true);
    try {
      await axios.post(`${API_BASE}/auth/self-register`, { firstName: firstName.trim(), lastName: lastName.trim(), cpf, email, password, photoData: regPhotoData });
      setRegSuccess(true);
    } catch (err) {
      setRegError(err.response?.data?.error || 'Erro ao enviar solicitação.');
    } finally { setRegLoading(false); }
  };

  const resetSelfRegisterForm = () => {
    setRegForm({ firstName: '', lastName: '', cpf: '', email: '', password: '', confirmPassword: '' });
    setRegPhotoPreview(null); setRegPhotoData(null);
    setRegSuccess(false); setRegError(''); setRegCameraOpen(false); setRegPhotoTab('upload');
    closeRegCamera();
  };

  // ===== ADMIN REGISTRATIONS HELPERS =====
  const fetchPendingRegistrations = async (status = 'pending') => {
    setPendingRegLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/admin/registrations?status=${status}`, authConfig);
      if (!Array.isArray(res.data)) {
        console.error('Unexpected registrations payload:', res.data);
        setPendingRegistrations([]);
        return;
      }
      setPendingRegistrations(res.data);
    } catch (err) {
      console.error(err);
      setPendingRegistrations([]);
    }
    finally { setPendingRegLoading(false); }
  };

  const approveRegistration = async (id) => {
    try {
      const res = await axios.post(`${API_BASE}/admin/registrations/${id}/approve`, {}, authConfig);
      showAlert(`✅ Técnico aprovado! Login criado: ${res.data.username}`, 'success');
      fetchPendingRegistrations(regStatusFilter);
      fetchUsers();
      fetchAdminUsers();
    } catch (err) { showAlert(err.response?.data?.error || 'Erro ao aprovar.', 'error'); }
  };

  const fetchAdminUsers = async () => {
    if (!authToken || currentUser?.role !== 'admin') return;
    setAdminUsersLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/admin/users`, authConfig);
      setAdminUsers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error fetching admin users:', err);
      setAdminUsers([]);
    } finally {
      setAdminUsersLoading(false);
    }
  };

  const updateAdminUser = async (userId, updates) => {
    try {
      const res = await axios.patch(`${API_BASE}/admin/users/${userId}`, updates, authConfig);
      setAdminUsers((prev) => prev.map((user) => (user.id === userId ? { ...user, ...res.data } : user)));
      fetchUsers(); // refresh assignment dropdown users
      showAlert('Usuário atualizado com sucesso.', 'success');
    } catch (err) {
      showAlert(err.response?.data?.error || 'Erro ao atualizar usuário.', 'error');
    }
  };

  const rejectRegistration = async (id, reason) => {
    try {
      await axios.post(`${API_BASE}/admin/registrations/${id}/reject`, { reason }, authConfig);
      showAlert('Solicitação rejeitada.', 'info');
      setRegRejectModal(null); setRegRejectReason('');
      fetchPendingRegistrations(regStatusFilter);
    } catch (err) { showAlert(err.response?.data?.error || 'Erro ao rejeitar.', 'error'); }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setLoginError('Preencha e-mail e senha');
      return;
    }
    
    setIsLoggingIn(true);
    try {
      const res = await axios.post(`${API_BASE}/auth/login`, {
        email: loginEmail,
        password: loginPassword
      }, { withCredentials: true });
      const userPayload = normalizeUserPayload(res.data.user);
      setAuthToken('cookie-session');
      setCurrentUser(userPayload);
      setLoginPassword('');
    } catch (err) {
      const message = err.response?.data?.error || 'Falha no login';
      setLoginError(message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${API_BASE}/auth/logout`, {}, { withCredentials: true });
    } catch (err) {
      // ignore local cleanup still applies
    }
    setAuthToken('');
    setCurrentUser(null);
    setScreens([]);
    setSelected(null);
    setNotes([]);
    setEvents([]);
    setShowUserMenu(false);
  };

  const changePassword = async () => {
    if (!currentPasswordInput || !newPasswordInput || !confirmPasswordInput) {
      showAlert('Preencha senha atual, nova senha e confirmação.', 'warning');
      return;
    }

    if (newPasswordInput.length < 12) {
      showAlert('A nova senha deve ter pelo menos 12 caracteres.', 'warning');
      return;
    }

    if (newPasswordInput !== confirmPasswordInput) {
      showAlert('A confirmação da nova senha não confere.', 'warning');
      return;
    }

    try {
      await axios.post(`${API_BASE}/auth/change-password`, {
        currentPassword: currentPasswordInput,
        newPassword: newPasswordInput
      }, authConfig);

      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setConfirmPasswordInput('');
      setShowChangePasswordModal(false);
      showAlert('Senha alterada com sucesso.', 'success');
    } catch (err) {
      const message = err.response?.data?.error || err.message;
      showAlert('Erro ao alterar senha: ' + message, 'error');
    }
  };

  const registerUser = async () => {
    if (!registerEmail.trim() || !registerPassword.trim()) {
      showAlert('Informe e-mail e senha', 'warning');
      return;
    }

    try {
      await axios.post(`${API_BASE}/auth/register`, {
        email: registerEmail.trim(),
        password: registerPassword,
        role: registerRole
      }, authConfig);

      setRegisterEmail('');
      setRegisterPassword('');
      setRegisterRole('user');
      setShowRegisterModal(false);
      showAlert('Usuário criado com sucesso', 'success');
    } catch (err) {
      const message = err.response?.data?.error || err.message;
      showAlert('Erro ao criar usuário: ' + message, 'error');
    }
  };

  // Fetch notes for selected screen
  useEffect(() => {
    stopLiveView();
    if (selected) {
      fetchNotes(selected.id);
      fetchEvents(selected.id);
      setActiveTab('details');
      setDiagnosticsData(null);
      setMaintenanceHistoryData(null);
      setTimeout(() => {
        detailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } else {
      setNotes([]);
      setEvents([]);
    }
  }, [selected]);

  useEffect(() => {
    if (!selected?.id || activeTab !== 'history') return;
    if (maintenanceHistoryData?.screenId === selected.id) return;
    fetchMaintenanceHistory(selected.id);
  }, [activeTab, selected?.id]);

  useEffect(() => {
    if (!selected) return;
    const intervalId = setInterval(() => {
      fetchEvents(selected.id);
    }, 30000);
    return () => clearInterval(intervalId);
  }, [selected, authToken]);

  const fetchNotes = async (screenId) => {
    try {
      const res = await axios.get(`${API_BASE}/screens/${screenId}/notes`, authConfig);
      setNotes(res.data);
    } catch (err) {
      console.error('Error fetching notes:', err);
    }
  };

  const fetchEvents = async (screenId) => {
    try {
      const res = await axios.get(`${API_BASE}/screens/${screenId}/events`, authConfig);
      setEvents(res.data);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  const createScreen = async () => {
    if (!newScreenName.trim()) {
      showAlert('Por favor, digite o nome do display', 'warning');
      return;
    }
    try {
      const locData = getLocationData(selectedLocationForNewScreen);
      const payload = {
        name: newScreenName.trim(),
        address: locData?.address || '',
        displayId: newScreenDisplayId.trim() || null,
        location: selectedLocationForNewScreen || null
      };

      await axios.post(`${API_BASE}/screens`, payload, authConfig);

      // if user selected/typed a location that's not yet saved, persist it locally
      if (selectedLocationForNewScreen && !locations.some(l => l.name === selectedLocationForNewScreen)) {
        const updated = [...locations, { name: selectedLocationForNewScreen, insercoes: 1, address: '' }];
        saveLocations(updated);
      }

      setNewScreenName('');
      setNewScreenDisplayId('');
      setSelectedLocationForNewScreen('');
      setShowScreenModal(false);
      fetchScreens();
    } catch (err) {
      showAlert('Erro ao criar display: ' + err.message, 'error');
    }
  };

  const deleteScreen = async (screenId) => {
    if (!window.confirm('Tem certeza que deseja remover este monitor?')) return;
    try {
      await axios.delete(`${API_BASE}/screens/${screenId}`, authConfig);
      if (selected?.id === screenId) setSelected(null);
      fetchScreens();
      showAlert('Monitor removido.', 'success');
    } catch (err) {
      showAlert('Erro ao remover: ' + (err.response?.data?.error || err.message), 'error');
    }
  };

  const resetAllData = async () => {
    if (!window.confirm('Isso vai apagar TODOS os monitores, eventos e alertas. Continuar?')) return;
    try {
      await axios.delete(`${API_BASE}/screens`, authConfig);
      saveLocations([]);
      setSelected(null);
      fetchScreens();
      showAlert('Todos os dados foram resetados.', 'success');
    } catch (err) {
      showAlert('Erro ao resetar: ' + (err.response?.data?.error || err.message), 'error');
    }
  };

  const deleteLocation = (locName) => {
    if (!window.confirm(`Remover o local "${locName}"? Os monitores não serão removidos.`)) return;
    const updated = locations.filter(l => l.name !== locName);
    saveLocations(updated);
    showAlert('Local removido.', 'success');
  };

  const startEditLocation = (loc) => {
    setEditingLocation(loc.name);
    setEditLocationName(loc.name);
    setEditLocationAddress(loc.address || '');
  };

  const saveEditLocation = () => {
    if (!editLocationName.trim()) return;
    const updated = locations.map(l =>
      l.name === editingLocation ? { ...l, name: editLocationName.trim(), address: editLocationAddress.trim() } : l
    );
    saveLocations(updated);
    setEditingLocation(null);
    showAlert('Local atualizado.', 'success');
  };

  const extractCityFromLocation = (locName) => {
    if (!locName) return '';
    const parts = locName.split('-');
    if (parts.length >= 2) {
      return parts[parts.length - 1].trim().toUpperCase();
    }
    return '';
  };

  const allCities = [...new Set(
    screens
      .map(s => extractCityFromLocation(s.location))
      .filter(Boolean)
  )].sort();

  const toggleLocationCollapse = (loc) => {
    setCollapsedLocations(prev => ({ ...prev, [loc]: !prev[loc] }));
  };

  const changeStatus = async (screen, status) => {
    try {
      const res = await axios.patch(`${API_BASE}/screens/${screen.id}/status`, { status }, authConfig);
      setScreens(screens.map(s => s.id === screen.id ? res.data : s));
      setSelected(res.data);
      fetchEvents(screen.id);
    } catch (err) {
      showAlert('Erro ao atualizar status: ' + err.message, 'error');
    }
  };

  const addNote = async () => {
    if (!selected || !noteText.trim()) {
      showAlert('Por favor, digite uma anotação', 'warning');
      return;
    }
    try {
      await axios.post(`${API_BASE}/screens/${selected.id}/notes`, {
        content: noteText
      }, authConfig);
      setNoteText('');
      fetchNotes(selected.id);
      setShowNoteModal(false);
    } catch (err) {
      showAlert('Erro ao adicionar anotação: ' + err.message, 'error');
    }
  };

  const updateDisplayUrl = async () => {
    if (!selected) return;
    try {
      const res = await axios.patch(`${API_BASE}/screens/${selected.id}/config`, {
        displayUrl
      }, authConfig);
      setSelected(res.data);
      showAlert('URL do display atualizada com sucesso!', 'success');
    } catch (err) {
      showAlert('Erro ao atualizar URL: ' + err.message, 'error');
    }
  };

  const refreshStatus = async () => {
    if (!selected) return;
    try {
      const res = await axios.get(`${API_BASE}/screens/${selected.id}`, authConfig);
      setScreens(screens.map(s => s.id === selected.id ? res.data : s));
      setSelected(res.data);
      fetchEvents(selected.id);
    } catch (err) {
      showAlert('Erro ao atualizar status: ' + err.message, 'error');
    }
  };

  const updateScreenPriority = async (screenId, priority) => {
    try {
      const res = await axios.patch(`${API_BASE}/screens/${screenId}`, {
        priority
      }, authConfig);
      setScreens(screens.map(s => s.id === screenId ? res.data : s));
      setSelected(res.data);
      showAlert(`Prioridade atualizada para ${priority}!`, 'success');
    } catch (err) {
      showAlert('Erro ao atualizar prioridade: ' + err.message, 'error');
    }
  };

  const startEditScreenInfo = () => {
    setScreenInfoForm({
      address: selected.address || '',
      operatingHoursStart: selected.operatingHoursStart || '',
      operatingHoursEnd: selected.operatingHoursEnd || '',
      operatingDays: selected.operatingDays || '',
      flowPeople: selected.flowPeople || '',
      flowVehicles: selected.flowVehicles || '',
    });
    setEditingScreenInfo(true);
  };

  const saveScreenInfo = async () => {
    try {
      const res = await axios.patch(`${API_BASE}/screens/${selected.id}`, screenInfoForm, authConfig);
      setScreens(screens.map(s => s.id === selected.id ? res.data : s));
      setSelected(res.data);
      setEditingScreenInfo(false);
      showAlert('Informações atualizadas!', 'success');
    } catch (err) {
      showAlert('Erro ao salvar: ' + err.message, 'error');
    }
  };

  const fetchDiagnostics = async (screenId, hours = 24) => {
    setDiagnosticsLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/screens/${screenId}/diagnostics?hours=${hours}`, authConfig);
      setDiagnosticsData(res.data);
    } catch (err) {
      setDiagnosticsData(null);
    }
    setDiagnosticsLoading(false);
  };

  const toggleScreenSelection = (screenId) => {
    const newSelected = new Set(selectedScreenIds);
    if (newSelected.has(screenId)) {
      newSelected.delete(screenId);
    } else {
      newSelected.add(screenId);
    }
    setSelectedScreenIds(newSelected);
  };

  const selectAllScreens = () => {
    if (selectedScreenIds.size === filteredScreens.length) {
      setSelectedScreenIds(new Set());
    } else {
      setSelectedScreenIds(new Set(filteredScreens.map(s => s.id)));
    }
  };

  const batchUpdatePriority = async (priority) => {
    if (selectedScreenIds.size === 0) {
      showAlert('Selecione pelo menos 1 display', 'warning');
      return;
    }
    try {
      await axios.patch(`${API_BASE}/screens/batch/priority`, {
        screenIds: Array.from(selectedScreenIds),
        priority
      }, authConfig);
      showAlert(`${selectedScreenIds.size} displays atualizados com prioridade: ${priority}`, 'success');
      setSelectedScreenIds(new Set());
      fetchScreens();
    } catch (err) {
      showAlert('Erro ao atualizar displays: ' + err.message, 'error');
    }
  };

  const batchUpdateWorkflow = async (workflowStatus) => {
    if (selectedScreenIds.size === 0) {
      showAlert('Selecione pelo menos 1 display', 'warning');
      return;
    }
    try {
      await axios.patch(`${API_BASE}/screens/batch/workflow`, {
        screenIds: Array.from(selectedScreenIds),
        workflowStatus
      }, authConfig);
      showAlert(`${selectedScreenIds.size} displays atualizados`, 'success');
      setSelectedScreenIds(new Set());
      fetchScreens();
    } catch (err) {
      showAlert('Erro ao atualizar displays: ' + err.message, 'error');
    }
  };

  const updateWorkflow = async (screenId, workflowStatus) => {
    try {
      const res = await axios.patch(`${API_BASE}/screens/${screenId}/workflow`, {
        workflowStatus
      }, authConfig);
      setScreens(prev => prev.map(s => s.id === screenId ? res.data : s));
      if (selected?.id === screenId) setSelected(res.data);
    } catch (err) {
      const message = err.response?.data?.error || err.message;
      showAlert('Erro ao atualizar fluxo: ' + message, 'error');
    }
  };

  const onDragEnd = async (result) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId) return;
    const screenId = parseInt(draggableId.replace('screen-', ''), 10);
    const screen = screens.find(s => s.id === screenId);
    if (!screen) return;
    if (destination.droppableId === 'complete' && screen.status !== 'online') {
      showAlert('Só pode marcar como completo quando a tela estiver online!', 'warning');
      return;
    }
    await updateWorkflow(screenId, destination.droppableId);
  };

  const onlineCount = screens.filter(s => s.status === 'online').length;
  const offlineCount = screens.filter(s => s.status === 'offline').length;
  const staticCount = screens.filter(s => s.status === 'static').length;
  const notInstalledCount = screens.filter(s => s.status === 'not_installed').length;

  const filteredScreens = screens.filter(screen => {
    const searchText = (screen.name || screen.location || '').toLowerCase();
    const matchesSearch = searchText.includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || screen.status === filterStatus;
    const matchesCity = cityFilter === 'all' || extractCityFromLocation(screen.location) === cityFilter;
    return matchesSearch && matchesFilter && matchesCity;
  });

  const getLocationData = (name) => locations.find(l => l.name === name);

  const localOptions = [...new Set(
    screens
      .map((screen) => (screen.location || '').trim())
      .filter((locationName) => !!locationName)
  )].sort((left, right) => left.localeCompare(right));

  const screenOptions = [...screens].sort((left, right) =>
    (left.name || '').toLowerCase().localeCompare((right.name || '').toLowerCase())
  );

  const contactsList = [...contacts].sort((left, right) => {
    if (left.targetType !== right.targetType) return left.targetType.localeCompare(right.targetType);
    if (left.targetValue !== right.targetValue) return left.targetValue.localeCompare(right.targetValue);
    return (left.name || '').toLowerCase().localeCompare((right.name || '').toLowerCase());
  });

  const getTargetLabel = (contact) => {
    if (contact.targetType === 'local') return `Local: ${contact.targetValue}`;
    const screen = screens.find((item) => String(item.id) === String(contact.targetValue));
    return screen ? `Tela: ${screen.name}` : `Tela: #${contact.targetValue}`;
  };

  const getContactForScreen = (screen) => {
    const byScreen = contacts.find(
      (contact) => contact.targetType === 'screen' && String(contact.targetValue) === String(screen.id)
    );
    if (byScreen) return byScreen;

    const screenLocation = (screen.location || '').trim();
    if (!screenLocation) return null;
    return contacts.find(
      (contact) => contact.targetType === 'local' && contact.targetValue === screenLocation
    ) || null;
  };

  const filteredEvents = events.filter((evt) => {
    if (eventFilterStatus !== 'all' && evt.status !== eventFilterStatus) return false;
    const evtDate = new Date(evt.createdAt);
    if (eventFrom) {
      const fromDate = new Date(eventFrom);
      if (evtDate < fromDate) return false;
    }
    if (eventTo) {
      const toDate = new Date(eventTo);
      if (evtDate > toDate) return false;
    }
    return true;
  });

  const workflowLabels = {
    todo: 'Manutenções a fazer',
    ontheway: 'Manutenções em andamento',
    complete: 'Manutenções concluídas'
  };

  const workflowColumns = {
    todo: filteredScreens.filter(s => s.workflowStatus === 'todo'),
    ontheway: filteredScreens.filter(s => s.workflowStatus === 'ontheway'),
    complete: filteredScreens.filter(s => s.workflowStatus === 'complete')
  };

  const formatReportDateTime = (value) => {
    if (!value) return '-';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return value;
    return dt.toLocaleString('pt-BR');
  };

  const wrapDescriptionByLine = (text = '', maxChars = 52) => {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) return '';

    const words = normalized.split(' ');
    const lines = [];
    let currentLine = '';

    const pushLine = () => {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = '';
      }
    };

    for (const word of words) {
      if (word.length > maxChars) {
        pushLine();
        for (let i = 0; i < word.length; i += maxChars) {
          lines.push(word.slice(i, i + maxChars));
        }
        continue;
      }

      const nextLine = currentLine ? `${currentLine} ${word}` : word;
      if (nextLine.length <= maxChars) {
        currentLine = nextLine;
      } else {
        pushLine();
        currentLine = word;
      }
    }

    pushLine();
    return lines.join('\n');
  };

  const autoFillReportFromScreen = (screenId) => {
    setReportScreenId(screenId);
    if (!screenId) {
      setReportPointName('');
      setReportAddress('');
      setReportDisplayId('');
      setReportCity('');
      return;
    }
    const scr = screens.find(s => String(s.id) === String(screenId));
    if (!scr) return;
    setReportPointName(scr.location || scr.name || '');
    const locData = getLocationData(scr.location);
    setReportAddress(locData?.address || scr.address || '');
    setReportDisplayId(scr.displayId || String(scr.id));
    setReportCity(extractCityFromLocation(scr.location) || '');
  };

  const addReportRow = () => {
    if (!reportPointName.trim() || !reportDisplayId.trim() || !reportDescription.trim() || !reportOfflineSince) {
      showAlert('Preencha todos os campos do relatório.', 'warning');
      return;
    }

    const city = reportCity || extractCityFromLocation(reportPointName) || 'Sem Cidade';

    const nextRow = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      city: city,
      pointName: reportPointName.trim(),
      address: reportAddress.trim(),
      displayId: reportDisplayId.trim(),
      description: wrapDescriptionByLine(reportDescription, 52),
      offlineSince: reportOfflineSince,
      status: 'Pendente',
      comments: ''
    };

    setReportRows((prev) => [...prev, nextRow]);
    setReportScreenId('');
    setReportPointName('');
    setReportAddress('');
    setReportDisplayId('');
    setReportDescription('');
    setReportOfflineSince('');
    setReportCity('');
    showAlert('Linha adicionada ao relatório.', 'success');
  };

  const reportRowCities = [...new Set(reportRows.map(r => r.city))].sort();

  const reportRowsByCity = reportRowCities.map((city) => ({
    city,
    rows: reportRows.filter((row) => row.city === city)
  }));

  const removeReportRow = (rowId) => {
    setReportRows((prev) => prev.filter((row) => row.id !== rowId));
  };

  const updateReportRow = (rowId, patch) => {
    setReportRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, ...patch } : row))
    );
  };

  // Backup functions
  const fetchBackups = async () => {
    setBackupsLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/backups`, authConfig);
      setBackups(res.data);
    } catch (err) {
      console.error('Error fetching backups:', err);
    } finally {
      setBackupsLoading(false);
    }
  };

  const createBackup = async () => {
    try {
      await axios.post(`${API_BASE}/backups`, {}, authConfig);
      showAlert('Backup criado com sucesso!', 'success');
      fetchBackups();
    } catch (err) {
      showAlert('Erro ao criar backup: ' + (err.response?.data?.error || err.message), 'error');
    }
  };

  const restoreBackup = async (backupName) => {
    if (!window.confirm(`Restaurar backup "${backupName}"? O banco de dados atual será substituído.`)) return;
    try {
      await axios.post(`${API_BASE}/backups/restore`, { name: backupName }, authConfig);
      showAlert('Backup restaurado! A página será recarregada.', 'success');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      showAlert('Erro ao restaurar: ' + (err.response?.data?.error || err.message), 'error');
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Contracts & Vendors functions
  const fetchContracts = async () => {
    setContractsLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/contracts`, authConfig);
      setContracts(res.data);
    } catch (err) {
      console.error('Error fetching contracts:', err);
    } finally {
      setContractsLoading(false);
    }
  };

  const fetchVendors = async () => {
    if (currentUser?.role !== 'admin') return [];
    try {
      const res = await axios.get(`${API_BASE}/vendors`, authConfig);
      setVendors(res.data);
      return Array.isArray(res.data) ? res.data : [];
    } catch (err) {
      console.error('Error fetching vendors:', err);
      return [];
    }
  };

  const syncContracts = async () => {
    setContractsSyncing(true);
    try {
      const res = await axios.post(`${API_BASE}/contracts/sync`, {}, authConfig);
      if (res.data.warning) {
        showAlert(res.data.warning, 'warning');
      } else {
        showAlert(`Contratos sincronizados! ${res.data.synced || 0} contratos encontrados.`, 'success');
      }
      fetchContracts();
    } catch (err) {
      showAlert('Erro ao sincronizar contratos: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setContractsSyncing(false);
    }
  };

  const notifyContract = async (contractId) => {
    try {
      const res = await axios.post(`${API_BASE}/contracts/${contractId}/notify`, {}, authConfig);
      showAlert(res.data.message || 'Notificação enviada!', 'success');
      fetchContracts();
    } catch (err) {
      showAlert('Erro ao notificar: ' + (err.response?.data?.error || err.message), 'error');
    }
  };

  const updateContractFollowUp = async (contractId, action) => {
    try {
      await axios.patch(`${API_BASE}/contracts/${contractId}/follow-up`, { action }, authConfig);
      showAlert('Status comercial atualizado!', 'success');
      fetchContracts();
    } catch (err) {
      showAlert('Erro ao atualizar status: ' + (err.response?.data?.error || err.message), 'error');
    }
  };

  const deleteContract = async (contractId) => {
    if (!window.confirm('Remover este contrato?')) return;
    try {
      await axios.delete(`${API_BASE}/contracts/${contractId}`, authConfig);
      showAlert('Contrato removido!', 'success');
      fetchContracts();
    } catch (err) {
      showAlert('Erro ao remover contrato', 'error');
    }
  };

  const saveVendor = async () => {
    if (!vendorForm.name || !vendorForm.phone) return showAlert('Nome e telefone são obrigatórios', 'error');
    try {
      if (editingVendor) {
        await axios.patch(`${API_BASE}/vendors/${editingVendor.id}`, vendorForm, authConfig);
        showAlert('Vendedor atualizado!', 'success');
      } else {
        await axios.post(`${API_BASE}/vendors`, vendorForm, authConfig);
        showAlert('Vendedor cadastrado!', 'success');
      }
      setShowVendorModal(false);
      setVendorForm({ name: '', phone: '', email: '' });
      setEditingVendor(null);
      fetchVendors();
    } catch (err) {
      showAlert('Erro ao salvar vendedor: ' + (err.response?.data?.error || err.message), 'error');
    }
  };

  const deleteVendor = async (vendorId) => {
    if (!window.confirm('Remover este vendedor?')) return;
    try {
      await axios.delete(`${API_BASE}/vendors/${vendorId}`, authConfig);
      showAlert('Vendedor removido!', 'success');
      fetchVendors();
    } catch (err) {
      showAlert('Erro ao remover vendedor', 'error');
    }
  };

  const getUrgencyStyle = (days) => {
    if (days <= 5) return { color: '#DC3545', bg: '#FFF0F1', icon: '🔴', label: 'Crítico' };
    if (days <= 10) return { color: '#E9A034', bg: '#FFF8ED', icon: '🟡', label: 'Atenção' };
    if (days <= 15) return { color: '#28A745', bg: '#EDFBF0', icon: '🟢', label: 'Próximo' };
    return { color: '#6c757d', bg: '#f8f9fa', icon: '⚪', label: 'OK' };
  };

  const getFollowUpBadge = (status) => {
    if (status === 'renewed') return { label: 'Renovado', color: '#2E7D32', bg: '#E9F8EE' };
    if (status === 'not_renewed') return { label: 'Não renovou', color: '#C62828', bg: '#FDECEC' };
    if (status === 'contacted') return { label: 'Contatado', color: '#B26A00', bg: '#FFF5E6' };
    return { label: 'Pendente', color: '#6c757d', bg: '#F3F4F6' };
  };

  // Origin sync functions
  const [importLoading, setImportLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);

  const importFromOrigin = async () => {
    if (!window.confirm('Importar todos os monitores do sistema de origem? Isso criará novos displays para monitores que não existem no sistema.')) return;
    setImportLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/sync/import`, {}, authConfig);
      const { total, created, updated, locations: importedLocations } = res.data;

      // Merge imported locations into localStorage
      if (importedLocations && importedLocations.length) {
        const existing = [...locations];
        for (const loc of importedLocations) {
          if (!existing.find(e => e.name === loc.name)) {
            existing.push({ name: loc.name, insercoes: 1, address: loc.address || '' });
          } else {
            // Update address if missing
            const idx = existing.findIndex(e => e.name === loc.name);
            if (idx >= 0 && !existing[idx].address && loc.address) {
              existing[idx].address = loc.address;
            }
          }
        }
        saveLocations(existing);
      }

      showAlert(`Importação concluída! ${total} monitores: ${created} criados, ${updated} atualizados. ${importedLocations?.length || 0} locais sincronizados.`, 'success');
      fetchScreens();
    } catch (err) {
      showAlert('Erro na importação: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setImportLoading(false);
    }
  };

  const syncFromOrigin = async () => {
    setSyncLoading(true);
    try {
      await axios.post(`${API_BASE}/sync/origin`, {}, authConfig);
      showAlert('Sincronização concluída!', 'success');
      fetchScreens();
    } catch (err) {
      showAlert('Erro na sincronização: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setSyncLoading(false);
    }
  };

  const escapeHtml = (text = '') =>
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const printReport = () => {
    if (!reportRows.length) {
      showAlert('Adicione pelo menos uma linha para imprimir/salvar em PDF.', 'warning');
      return;
    }

    const now = new Date();
    const generatedAt = now.toLocaleString('pt-BR');
    const logoUrl = logo.startsWith('http')
      ? logo
      : `${window.location.origin}${logo.startsWith('/') ? '' : '/'}${logo}`;

    const reportSectionsHtml = reportRowsByCity
      .map(({ city, rows }) => {
        const sectionRowsHtml = rows.length
          ? rows
              .map(
                (row, index) => `
                  <tr>
                    <td class="col-index">${index + 1}</td>
                    <td>${escapeHtml(row.pointName)}</td>
                    <td>${escapeHtml(row.address)}</td>
                    <td>${escapeHtml(row.displayId)}</td>
                    <td>${row.description.split('\\n').map((line) => escapeHtml(line)).join('<br/>')}</td>
                    <td><span class="offline-since-print">&#9679; ${escapeHtml(formatReportDateTime(row.offlineSince))}</span></td>
                    <td>${escapeHtml(row.status || '-')}</td>
                    <td>${(row.comments || '').split('\\n').map((line) => escapeHtml(line)).join('<br/>') || '-'}</td>
                  </tr>
                `
              )
              .join('')
          : '<tr><td colspan="8" class="empty-city">Sem registros para esta cidade.</td></tr>';

        return `
          <section class="city-section">
            <div class="city-title">${escapeHtml(city)}</div>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Ponto</th>
                  <th>Endereço</th>
                  <th>ID</th>
                  <th>Descrição</th>
                  <th>Offline desde</th>
                  <th>Estado</th>
                  <th>Comentários</th>
                </tr>
              </thead>
              <tbody>
                ${sectionRowsHtml}
              </tbody>
            </table>
          </section>
        `;
      })
      .join('');

    const reportWindow = window.open('', '_blank', 'width=1200,height=800');
    if (!reportWindow) {
      showAlert('Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-up.', 'error');
      return;
    }

    reportWindow.document.write(`
      <html>
        <head>
          <title>Relatório Semanal de Manutenção</title>
          <style>
            * { box-sizing: border-box; }
            body {
              font-family: 'Segoe UI', Arial, sans-serif;
              color: #13202b;
              margin: 0;
              background: #f1f3f5;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .page {
              background: #ffffff;
              margin: 0 auto;
              width: 100%;
              max-width: 1100px;
              min-height: 100vh;
              padding: 16px 14px 24px;
              border-left: 1px solid #cfd6dd;
              border-right: 1px solid #cfd6dd;
            }
            .report-head {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 10px;
              border-bottom: 2px solid #d7dde3;
              padding-bottom: 10px;
              margin-bottom: 10px;
            }
            .brand {
              display: flex;
              align-items: center;
              gap: 10px;
              margin-bottom: 6px;
            }
            .brand img {
              height: 30px;
              width: auto;
              object-fit: contain;
            }
            .brand-name {
              font-size: 13px;
              letter-spacing: 0.5px;
              color: #495c6e;
              font-weight: 700;
              text-transform: uppercase;
            }
            h1 {
              margin: 0;
              font-size: 28px;
              letter-spacing: -0.6px;
              color: #122335;
            }
            .subtitle {
              margin-top: 4px;
              color: #66788a;
              font-size: 14px;
            }
            .meta {
              text-align: right;
              font-size: 12px;
              color: #4b5f73;
              line-height: 1.45;
              min-width: 230px;
            }
            .meta b { color: #223649; }
            .city-section {
              margin-top: 10px;
              border: 1px solid #dbe2e9;
            }
            .city-title {
              font-size: 12px;
              font-weight: 700;
              letter-spacing: 0.3px;
              padding: 6px 10px;
              color: #1e2f40;
            }
            .city-londrina .city-title { background: #eaf2ff; border-bottom: 1px solid #d0e0ff; }
            .city-maringa .city-title { background: #e9f8f0; border-bottom: 1px solid #cbead9; }
            .city-balneario .city-title { background: #fff2e8; border-bottom: 1px solid #ffd9bf; }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 12px;
            }
            thead th {
              background: #eef2f5;
              color: #1a2a3a;
              font-weight: 700;
              border-top: 1px solid #bcc8d4;
              border-bottom: 1px solid #bcc8d4;
              padding: 9px 8px;
              text-align: left;
            }
            tbody td {
              border-bottom: 1px solid #dbe2e9;
              padding: 8px;
              vertical-align: top;
            }
            tbody tr:nth-child(even) {
              background: #fafcfd;
            }
            .col-index {
              width: 36px;
              color: #4f6478;
              font-weight: 700;
            }
            .offline-since-print {
              display: inline-block;
              border: 1px solid #d93636;
              color: #982222;
              border-radius: 999px;
              padding: 4px 10px;
              font-size: 11px;
              font-weight: 700;
              white-space: nowrap;
            }
            .summary {
              margin-top: 8px;
              font-size: 13px;
              color: #4a5c6d;
            }
            .empty-city {
              text-align: center;
              color: #73879a;
              font-style: italic;
            }
            .summary b {
              color: #142738;
            }
            @page {
              size: A4 landscape;
              margin: 10mm;
            }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="report-head">
              <div>
                <div class="brand">
                  <img id="reportLogo" src="${logoUrl}" alt="Intermidia" />
                  <span class="brand-name">Intermidia</span>
                </div>
                <h1>Relatório Semanal de Manutenção</h1>
              </div>
              <div class="meta">
                <div><b>Gerado em:</b> ${generatedAt}</div>
                <div><b>Usuário:</b> ${escapeHtml(getUserDisplayName(currentUser))}</div>
              </div>
            </div>

            ${reportSectionsHtml}

            <div class="summary">
              Total de registros: <b>${reportRows.length}</b>
            </div>
          </div>
          <script>
            (function () {
              var hasPrinted = false;
              function triggerPrint() {
                if (hasPrinted) return;
                hasPrinted = true;
                setTimeout(function () {
                  window.print();
                }, 120);
              }

              var img = document.getElementById('reportLogo');
              if (!img) {
                triggerPrint();
                return;
              }

              if (img.complete) {
                triggerPrint();
              } else {
                img.addEventListener('load', triggerPrint);
                img.addEventListener('error', triggerPrint);
                setTimeout(triggerPrint, 1500);
              }
            })();
          </script>
        </body>
      </html>
    `);

    reportWindow.document.close();
    reportWindow.focus();
  };
  const formatSecondsClock = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const normalizeCityName = (rawCity, locationName) => {
    const toCitySlug = (value = '') => String(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const toTitleCase = (value = '') => value
      .split(' ')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');

    const canonicalBySlug = {
      bc: 'Balneário Camboriú',
      'balneario camboriu': 'Balneário Camboriú',
      itajai: 'Itajaí',
      londrina: 'Londrina',
      maringa: 'Maringá'
    };

    const canonicalCity = (candidate) => {
      const slug = toCitySlug(candidate);
      if (!slug) return null;
      if (canonicalBySlug[slug]) return canonicalBySlug[slug];

      const noUfSlug = slug.replace(/\s+[a-z]{2}$/, '').trim();
      if (canonicalBySlug[noUfSlug]) return canonicalBySlug[noUfSlug];

      return toTitleCase(noUfSlug || slug);
    };

    const candidates = [];
    const cityText = String(rawCity || '').trim();
    if (cityText) {
      // Common format: "..., Londrina/PR - CEP ..."
      const cityUfAnywhere = cityText.match(/([A-Za-zÀ-ÿ\s'\-]+)\s*\/[A-Za-z]{2}\b/i);
      if (cityUfAnywhere && cityUfAnywhere[1]) candidates.push(cityUfAnywhere[1]);

      // If raw city comes as address with commas, keep last segment as city candidate
      const commaParts = cityText.split(',').map((part) => part.trim()).filter(Boolean);
      if (commaParts.length > 1) candidates.push(commaParts[commaParts.length - 1]);

      const fromUfPattern = cityText.match(/,\s*([^,\/\-]+)\s*\/[A-Za-z]{2}\b/i);
      if (fromUfPattern && fromUfPattern[1]) candidates.push(fromUfPattern[1]);

      const justCity = cityText.match(/^\s*([A-Za-zÀ-ÿ\s'\-]+)\s*$/);
      if (justCity && justCity[1]) candidates.push(justCity[1]);

      candidates.push(cityText);
    }

    const locationText = String(locationName || '').trim();
    const locationCity = locationText.match(/-\s*([A-Za-zÀ-ÿ\s'\-]+)$/);
    if (locationCity && locationCity[1]) candidates.push(locationCity[1]);

    for (const candidate of candidates) {
      const normalized = canonicalCity(candidate);
      if (normalized) return normalized;
    }

    return 'Sem cidade';
  };

  const groupedLoopItems = (() => {
    const groupedMap = new Map();

    (loopAuditData.items || []).forEach((row) => {
      const locationLabel = String(row.location || '').trim() || `Monitor ${row.originId}`;
      const locationKey = locationLabel.toLowerCase();
      const loopKey = Number.isFinite(row.loopSeconds) ? String(row.loopSeconds) : 'na';
      const groupKey = `${locationKey}::${loopKey}`;

      if (!groupedMap.has(groupKey)) {
        groupedMap.set(groupKey, {
          ...row,
          location: locationLabel,
          city: normalizeCityName(row.city, locationLabel),
          monitorCount: 1,
          originIds: [row.originId],
          monitorNames: [row.screenName || `Monitor ${row.originId}`]
        });
        return;
      }

      const group = groupedMap.get(groupKey);
      group.monitorCount += 1;
      group.originIds.push(row.originId);
      group.monitorNames.push(row.screenName || `Monitor ${row.originId}`);
      group.availableSlots10 = Math.max(group.availableSlots10 || 0, row.availableSlots10 || 0);
      group.availableSlots15 = Math.max(group.availableSlots15 || 0, row.availableSlots15 || 0);
      group.estimatedUsedSlots10 = Math.max(group.estimatedUsedSlots10 || 0, row.estimatedUsedSlots10 || 0);
      group.estimatedUsedSlots15 = Math.max(group.estimatedUsedSlots15 || 0, row.estimatedUsedSlots15 || 0);
      group.remainingSeconds = Math.max(group.remainingSeconds || 0, row.remainingSeconds || 0);
    });

    return Array.from(groupedMap.values()).sort((a, b) => {
      const cityCmp = String(a.city || '').localeCompare(String(b.city || ''), 'pt-BR');
      if (cityCmp !== 0) return cityCmp;
      return (b.riskScore || 0) - (a.riskScore || 0);
    });
  })();

  const loopCityOptions = Array.from(new Set(groupedLoopItems.map((row) => row.city || 'Sem cidade')))
    .sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));

  const filteredLoopItems = groupedLoopItems.filter((row) => (
    loopCityFilter === 'all' || (row.city || 'Sem cidade') === loopCityFilter
  ));

  const groupedLoopItemsWithCityHeaders = (() => {
    const rows = [];
    let lastCity = null;

    filteredLoopItems.slice(0, 40).forEach((row) => {
      const cityLabel = row.city || 'Sem cidade';
      if (cityLabel !== lastCity) {
        rows.push({ isCityHeader: true, city: cityLabel, key: `city-${cityLabel}` });
        lastCity = cityLabel;
      }
      rows.push({ ...row, isCityHeader: false, key: `row-${row.location}-${row.loopSeconds}-${row.originIds.join('-')}` });
    });

    return rows;
  })();

  const sendCityLoopToWhatsapp = async () => {
    const vendorPool = vendors.length ? vendors : await fetchVendors();
    const targetVendors = loopVendorFilter === 'all'
      ? vendorPool.filter((v) => v.active !== false)
      : vendorPool.filter((v) => String(v.id) === String(loopVendorFilter) && v.active !== false);

    if (!targetVendors.length) {
      showAlert('Nenhum vendedor ativo selecionado para envio.', 'warning');
      return;
    }

    try {
      const res = await axios.post(`${API_BASE}/loops/notify-city-summary`, {
        city: loopCityFilter,
        vendorId: loopVendorFilter === 'all' ? null : loopVendorFilter
      }, authConfig);

      const payload = res.data || {};
      showAlert(
        `Disparo concluído via API: ${payload.sentMessages || 0} mensagens (${payload.cityCount || 0} cidade(s)).`,
        'success'
      );
    } catch (err) {
      showAlert(err.response?.data?.message || err.response?.data?.error || 'Erro ao disparar mensagens por cidade.', 'error');
    }
  };

  if (!sessionChecked) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-box">
            <div className="login-header">
              <img src={logoBlack} className="login-logo" alt="Logo Intermídia" />
              <h1>Carregando sessão...</h1>
              <p>Validando credenciais de acesso</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!authToken) {
    // ── SELF-REGISTER VIEW ──
    if (showSelfRegister) {
      const strength = checkPasswordStrength(regForm.password);
      const allStrong = Object.values(strength).every(Boolean);
      return (
        <div className="login-page">
          <div className="login-container register-container">
            <div className="login-box register-box">
              {regSuccess ? (
                <div className="register-success">
                  <div className="register-success-icon">✅</div>
                  <h2>Solicitação enviada!</h2>
                  <p>Seu cadastro está aguardando aprovação do administrador. Você será contatado em breve.</p>
                  <button className="login-button" onClick={() => { setShowSelfRegister(false); resetSelfRegisterForm(); }}>
                    Voltar ao login
                  </button>
                </div>
              ) : (
                <>
                  <div className="login-header">
                    <img src={logoBlack} className="login-logo" alt="Logo Intermídia" />
                    <h1>Solicitar Acesso</h1>
                    <p>Preencha seus dados para se cadastrar como técnico</p>
                  </div>
                  <form className="register-form" onSubmit={submitSelfRegister}>
                    <div className="register-row">
                      <div className="form-group">
                        <label>Nome *</label>
                        <input type="text" placeholder="Primeiro nome" value={regForm.firstName}
                          onChange={e => setRegForm(f => ({ ...f, firstName: e.target.value }))} />
                      </div>
                      <div className="form-group">
                        <label>Sobrenome *</label>
                        <input type="text" placeholder="Sobrenome" value={regForm.lastName}
                          onChange={e => setRegForm(f => ({ ...f, lastName: e.target.value }))} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>CPF *</label>
                      <input type="text" placeholder="000.000.000-00" value={regForm.cpf} maxLength={14}
                        onChange={e => setRegForm(f => ({ ...f, cpf: formatCPFInput(e.target.value) }))} />
                      {regForm.cpf.replace(/\D/g,'').length === 11 && !validateCPFFrontend(regForm.cpf) && (
                        <span className="field-error">CPF inválido</span>
                      )}
                    </div>
                    <div className="form-group">
                      <label>E-mail *</label>
                      <input type="email" placeholder="seu@email.com" value={regForm.email}
                        onChange={e => setRegForm(f => ({ ...f, email: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label>Senha *</label>
                      <input type="password" placeholder="Mínimo 12 caracteres" value={regForm.password}
                        onChange={e => setRegForm(f => ({ ...f, password: e.target.value }))} />
                      {regForm.password && (
                        <div className="password-strength">
                          {[['length','≥ 12 caracteres'],['upper','Maiúscula'],['lower','Minúscula'],['number','Número'],['special','Símbolo']].map(([k,label]) => (
                            <span key={k} className={`strength-item ${strength[k] ? 'ok' : 'fail'}`}>
                              {strength[k] ? '✓' : '✗'} {label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="form-group">
                      <label>Confirmar Senha *</label>
                      <input type="password" placeholder="Repita a senha" value={regForm.confirmPassword}
                        onChange={e => setRegForm(f => ({ ...f, confirmPassword: e.target.value }))} />
                      {regForm.confirmPassword && regForm.password !== regForm.confirmPassword && (
                        <span className="field-error">Senhas não conferem</span>
                      )}
                    </div>

                    {/* Photo section */}
                    <div className="form-group">
                      <label>Foto (opcional)</label>
                      <div className="photo-tabs">
                        <button type="button" className={`photo-tab ${regPhotoTab === 'upload' ? 'active' : ''}`} onClick={() => { setRegPhotoTab('upload'); closeRegCamera(); }}>📁 Upload</button>
                        <button type="button" className={`photo-tab ${regPhotoTab === 'camera' ? 'active' : ''}`} onClick={() => { setRegPhotoTab('camera'); openRegCamera(); }}>📷 Câmera</button>
                      </div>
                      {regPhotoTab === 'upload' && (
                        <label className="photo-upload-btn">
                          Selecionar foto
                          <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
                            onChange={async e => {
                              const file = e.target.files[0];
                              if (!file) return;
                              if (file.size > 10 * 1024 * 1024) return setRegError('Foto muito grande (máx. 10 MB).');
                              const b64 = await resizeImageToBase64(file);
                              setRegPhotoPreview(b64); setRegPhotoData(b64);
                            }} />
                        </label>
                      )}
                      {regPhotoTab === 'camera' && (
                        <div className="camera-preview">
                          {regCameraOpen ? (
                            <>
                              <video ref={regVideoRef} autoPlay playsInline muted className="camera-video" />
                              <button type="button" className="capture-btn" onClick={captureRegPhoto}>📸 Capturar</button>
                            </>
                          ) : (
                            <button type="button" className="photo-upload-btn" onClick={openRegCamera}>Abrir câmera</button>
                          )}
                        </div>
                      )}
                      {regPhotoPreview && (
                        <div className="photo-preview-wrap">
                          <img src={regPhotoPreview} alt="Prévia" className="photo-preview-img" />
                          <button type="button" className="photo-remove-btn" onClick={() => { setRegPhotoPreview(null); setRegPhotoData(null); }}>✕ Remover</button>
                        </div>
                      )}
                    </div>

                    {regError && <div className="login-error">⚠️ {regError}</div>}
                    <button type="submit" className="login-button" disabled={regLoading || !allStrong}>
                      {regLoading ? 'Enviando...' : 'Solicitar acesso'}
                    </button>
                  </form>
                  <div className="register-footer">
                    <button type="button" className="link-btn" onClick={() => { setShowSelfRegister(false); resetSelfRegisterForm(); }}>
                      ← Voltar ao login
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      );
    }

    // ── LOGIN VIEW ──
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-box">
            <div className="login-header">
              <img src={logoBlack} className="login-logo" alt="Logo Intermídia" />
              <h1>Manutenções</h1>
              <p>Acesse sua conta para continuar</p>
            </div>
            <form className="login-form" onSubmit={handleLogin}>
              <div className="form-group">
                <label>E-mail</label>
                <input
                  type="email"
                  placeholder="Digite seu e-mail"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Senha</label>
                <input
                  type="password"
                  placeholder="Digite sua senha"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                />
              </div>
              {loginError && <div className="login-error">⚠️ {loginError}</div>}
              <button type="submit" className="login-button" disabled={isLoggingIn}>
                {isLoggingIn ? 'Entrando...' : 'Entrar'}
              </button>
            </form>
            <div className="register-footer">
              <p>É técnico e não tem acesso?</p>
              <button type="button" className="link-btn" onClick={() => { setShowSelfRegister(true); resetSelfRegisterForm(); }}>
                Solicitar acesso
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {isMobileMenuOpen && <div className="sidebar-backdrop" onClick={() => setIsMobileMenuOpen(false)} />}

      {/* Sidebar */}
      <aside className={`sidebar ${isMobileMenuOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <img src={logo} className="app-logo" alt="Logo" />
          <div className="sidebar-brand-text">
            Manutenções<small>Intermídia</small>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Principal</div>
          <button className={`sidebar-item ${activePage === 'maintenance' ? 'active' : ''}`} onClick={() => setActivePage('maintenance')}>
            <FiMonitor size={18} /> Manutenções
          </button>
          <button className={`sidebar-item ${activePage === 'tickets' ? 'active' : ''}`} onClick={() => setActivePage('tickets')}>
            <FiClipboard size={18} /> Tickets
            {tickets.filter(t => t.status === 'open' || t.status === 'in_progress').length > 0 && (
              <span className="nav-badge">{tickets.filter(t => t.status === 'open' || t.status === 'in_progress').length}</span>
            )}
          </button>
          <button className={`sidebar-item ${activePage === 'calendar' ? 'active' : ''}`} onClick={() => setActivePage('calendar')}>
            <FiCalendar size={18} /> Agenda
          </button>
          <button className={`sidebar-item ${activePage === 'contacts' ? 'active' : ''}`} onClick={() => setActivePage('contacts')}>
            <FiPhone size={18} /> Contatos
            <span className="nav-badge">{contactsList.length}</span>
          </button>
          <button className={`sidebar-item ${activePage === 'inventory' ? 'active' : ''}`} onClick={() => setActivePage('inventory')}>
            <FiPackage size={18} /> Estoque
            {parts.filter(p => p.quantity <= p.minQuantity).length > 0 && (
              <span className="nav-badge warning">{parts.filter(p => p.quantity <= p.minQuantity).length}</span>
            )}
          </button>
          <button className={`sidebar-item ${activePage === 'reports' ? 'active' : ''}`} onClick={() => setActivePage('reports')}>
            <FiFileText size={18} /> Relatórios
            <span className="nav-badge">{reportRows.length}</span>
          </button>
          <button className={`sidebar-item ${activePage === 'analytics-pro' ? 'active' : ''}`} onClick={() => setActivePage('analytics-pro')}>
            <FiTrendingUp size={18} /> Analytics Pro
          </button>
          <button className={`sidebar-item ${showAnalytics ? 'active' : ''}`} onClick={() => setShowAnalytics(true)}>
            <FiBarChart2 size={18} /> Analytics
          </button>

          <div className="sidebar-section-label">Sistema</div>
          <button className={`sidebar-item ${activePage === 'contracts' ? 'active' : ''}`} onClick={() => { setActivePage('contracts'); fetchContracts(); if (currentUser?.role === 'admin') fetchVendors(); }}>
            <FiDollarSign size={18} /> Contratos
            {contracts.filter(c => c.daysRemaining <= 15).length > 0 && (
              <span className="nav-badge warning">{contracts.filter(c => c.daysRemaining <= 15).length}</span>
            )}
          </button>
          {currentUser?.role === 'admin' && (
            <button className={`sidebar-item ${activePage === 'backups' ? 'active' : ''}`} onClick={() => { setActivePage('backups'); fetchBackups(); }}>
              <FiDatabase size={18} /> Backups
            </button>
          )}
          {currentUser?.role === 'admin' && (
            <button className={`sidebar-item ${activePage === 'approvals' ? 'active' : ''}`} onClick={() => { setActivePage('approvals'); fetchPendingRegistrations('pending'); }}>
              <FiUserCheck size={18} /> Aprovações
              {pendingRegistrations.filter(r => r.status === 'pending').length > 0 && activePage !== 'approvals' && (
                <span className="nav-badge warning">{pendingRegistrations.filter(r => r.status === 'pending').length}</span>
              )}
            </button>
          )}
          {currentUser?.role === 'admin' && (
            <button className={`sidebar-item ${activePage === 'notifications' ? 'active' : ''}`} onClick={() => setActivePage('notifications')}>
              <FiBell size={16} /> Notificações
            </button>
          )}
          <button className="sidebar-item" onClick={() => setDarkMode(!darkMode)}>
            {darkMode ? <FiSun size={18} /> : <FiMoon size={18} />}
            {darkMode ? 'Modo Claro' : 'Modo Escuro'}
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="user-actions" ref={userMenuRef}>
            <div className="sidebar-user" onClick={() => setShowUserMenu((prev) => !prev)}>
              <div className="sidebar-avatar">
                {currentUser?.photoData
                  ? <img src={currentUser.photoData} alt="Foto do usuário" className="sidebar-avatar-image" />
                  : getUserInitial(currentUser)}
              </div>
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">{getUserDisplayName(currentUser)}</div>
                <div className="sidebar-user-role">{currentUser?.role || ''}</div>
              </div>
              <FiChevronDown size={14} style={{ color: 'rgba(255,255,255,0.4)' }} />
            </div>

            {showUserMenu && (
              <div className="user-menu-dropdown">
                {currentUser?.role === 'admin' && (
                  <button className="user-menu-item" onClick={() => { setShowRegisterModal(true); setShowUserMenu(false); }}>
                    <FiUserPlus size={14} /> Criar Usuário
                  </button>
                )}
                <button className="user-menu-item" onClick={() => { setShowChangePasswordModal(true); setShowUserMenu(false); }}>
                  <FiKey size={14} /> Alterar Senha
                </button>
                <button className="user-menu-item danger" onClick={handleLogout}>
                  <FiLogOut size={14} /> Sair
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <div className="main-area">
        {/* Top Bar */}
        <div className="topbar">
          <button className="topbar-btn topbar-menu-btn" onClick={() => setIsMobileMenuOpen((prev) => !prev)} aria-label="Abrir menu">
            <FiMenu size={18} />
          </button>
          <div className="topbar-search">
            <FiSearch size={16} />
            <input
              type="text"
              placeholder="Pesquisar displays..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="topbar-right">
            <NotificationCenter />
          </div>
        </div>

        {/* Page Content */}
        <div className="page-content">

          {/* Stats Cards — only on maintenance page */}
          {activePage === 'maintenance' && (
            <>
              <div className="stats-grid">
                <div className="stat-card-new">
                  <div className="stat-card-label">Total de Telas</div>
                  <div className="stat-card-value total">{screens.filter(s => s.status !== 'static' && s.status !== 'not_installed').length}</div>
                  <div className="stat-card-sub">Instalados no sistema</div>
                </div>
                <div className="stat-card-new">
                  <div className="stat-card-label">Online</div>
                  <div className="stat-card-value online">{onlineCount}</div>
                  <div className="stat-card-sub"><span className="up">{(() => { const active = screens.filter(s => s.status !== 'static' && s.status !== 'not_installed').length; return active ? ((onlineCount / active) * 100).toFixed(0) : 0; })()}%</span> disponibilidade</div>
                </div>
                <div className="stat-card-new">
                  <div className="stat-card-label">Offline</div>
                  <div className="stat-card-value offline">{offlineCount}</div>
                  <div className="stat-card-sub"><span className="down">{(() => { const active = screens.filter(s => s.status !== 'static' && s.status !== 'not_installed').length; return active ? ((offlineCount / active) * 100).toFixed(0) : 0; })()}%</span> indisponíveis</div>
                </div>
                <div className="stat-card-new">
                  <div className="stat-card-label">Estático</div>
                  <div className="stat-card-value static">{staticCount}</div>
                  <div className="stat-card-sub">Mídias estáticas</div>
                </div>
                <div className="stat-card-new">
                  <div className="stat-card-label">Não Instalado</div>
                  <div className="stat-card-value not_installed">{notInstalledCount}</div>
                  <div className="stat-card-sub">Aguardando instalação</div>
                </div>
                <div className="stat-card-new">
                  <div className="stat-card-label">Em Andamento</div>
                  <div className="stat-card-value">{screens.filter(s => s.workflowStatus === 'ontheway').length}</div>
                  <div className="stat-card-sub">Manutenções ativas</div>
                </div>
              </div>



              {/* Batch Operations */}
              {selectedScreenIds.size > 0 && (
                <div className="batch-operations-bar">
            <div className="batch-info">
              <span className="batch-count">{selectedScreenIds.size} displays selecionados</span>
              <button 
                className="batch-clear-btn"
                onClick={() => setSelectedScreenIds(new Set())}
              >
                Limpar Seleção
              </button>
            </div>
            <div className="batch-actions">
              <select 
                value={batchPriority}
                onChange={(e) => setBatchPriority(e.target.value)}
                className="batch-select"
              >
                <option value="Baixa">⬇️ Prioridade: Baixa</option>
                <option value="Média">➡️ Prioridade: Média</option>
                <option value="Alta">⬆️ Prioridade: Alta</option>
                <option value="Crítica">⚠️ Prioridade: Crítica</option>
              </select>
              <button 
                className="batch-action-btn"
                onClick={() => batchUpdatePriority(batchPriority)}
              >
                Atualizar Prioridade
              </button>
              
              <select 
                value={batchWorkflowStatus}
                onChange={(e) => setBatchWorkflowStatus(e.target.value)}
                className="batch-select"
              >
                <option value="todo">Status: A Fazer</option>
                <option value="ontheway">Status: Em Andamento</option>
                <option value="complete">Status: Concluído</option>
                <option value="none">Status: Sem Workflow</option>
              </select>
              <button 
                className="batch-action-btn"
                onClick={() => batchUpdateWorkflow(batchWorkflowStatus)}
              >
                Atualizar Status
              </button>
            </div>
          </div>
              )}
            </>
          )}

      {activePage === 'maintenance' ? (
      <>
      {/* Workflow Board */}
      <div className="board-section">
        <div className="board-header">
          <h3>Workflow de Manutencao</h3>
          <p>Arraste os displays entre colunas para acompanhar o trabalho.</p>
        </div>
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="board-columns">
            {['todo', 'ontheway', 'complete'].map(col => (
              <Droppable key={col} droppableId={col}>
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className={`board-column ${col}`}>
                    <div className="column-header">
                      <span>{workflowLabels[col]}</span>
                      <span className="column-count">{workflowColumns[col].length}</span>
                    </div>
                    <div className="column-cards">
                      {workflowColumns[col].slice().sort((a, b) => a.id - b.id).map((screen, index) => (
                        <Draggable key={screen.id} draggableId={`screen-${screen.id}`} index={index}>
                          {(dragProvided, snapshot) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...dragProvided.dragHandleProps}
                              className={`board-card ${screen.status} ${snapshot.isDragging ? 'dragging' : ''}`}
                              onClick={() => setSelected(screen)}
                            >
                              <div className="card-title">{screen.name}</div>
                              <div className="card-meta">
                                <span className={`pill ${screen.status}`}>{screen.status}</span>
                                <span className="pill secondary">{screen.location || 'Sem Local'}</span>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            ))}
          </div>
        </DragDropContext>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <button className={`filter-btn ${filterStatus === 'all' ? 'active' : ''}`} onClick={() => setFilterStatus('all')}>
          Todos ({screens.length})
        </button>
        <button className={`filter-btn ${filterStatus === 'online' ? 'active' : ''}`} onClick={() => setFilterStatus('online')}>
          Online ({onlineCount})
        </button>
        <button className={`filter-btn ${filterStatus === 'offline' ? 'active' : ''}`} onClick={() => setFilterStatus('offline')}>
          Offline ({offlineCount})
        </button>
        <button className={`filter-btn ${filterStatus === 'static' ? 'active' : ''}`} onClick={() => setFilterStatus('static')}>
          Estático ({staticCount})
        </button>
        <button className={`filter-btn ${filterStatus === 'not_installed' ? 'active' : ''}`} onClick={() => setFilterStatus('not_installed')}>
          Não Instalado ({notInstalledCount})
        </button>
        {allCities.length > 0 && (
          <select className="city-filter-select" value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}>
            <option value="all">Todas as Cidades</option>
            {allCities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      <div className="main-content">
        {/* Left Panel - Screens Table */}
        <div className="left-panel" style={{ flex: `0 0 ${leftPanelWidth}%`, minWidth: 0 }}>
          <div className="panel-header">
            <h2><FiMonitor /> Displays</h2>
            <div className="panel-actions">
              <button onClick={openOriginAdd} className="btn-icon-primary" title="Adicionar Monitor no Sistema de Origem">
                <FiPlus size={18} /> Nova Tela (Origem)
              </button>
              <button onClick={() => setShowScreenModal(true)} className="btn-secondary" title="Adicionar Display Local">
                <FiPlus size={14} /> Tela Local
              </button>
              <button onClick={() => setShowLocationModal(true)} className="btn-secondary" title="Adicionar Local" style={{ marginLeft: 4 }}>
                Adicionar Local
              </button>
            </div>
          </div>

          <div className="screens-table">
            {filteredScreens.length === 0 ? (
              <div className="empty-message">
                <FiMonitor size={32} />
                <p>Nenhum display encontrado</p>
              </div>
            ) : (
              (() => {
                const grouped = {};
                filteredScreens.forEach(s => {
                  const loc = s.location || 'Sem Local';
                  if (!grouped[loc]) grouped[loc] = [];
                  grouped[loc].push(s);
                });

                return Object.keys(grouped).map(loc => (
                  <div key={loc} className="location-group">
                    <div className="location-header" onClick={() => toggleLocationCollapse(loc)} style={{cursor: 'pointer'}}>
                      <div className="location-title">
                        <span className="location-toggle">
                          {collapsedLocations[loc] ? <FiChevronUp size={16} /> : <FiChevronDown size={16} />}
                        </span>
                        <strong>{loc}</strong>
                        {loc !== 'Sem Local' && (() => {
                          const data = getLocationData(loc);
                          return data?.address ? <span className="location-address">{data.address}</span> : null;
                        })()}
                        <span className="location-count">{grouped[loc].length} monitor{grouped[loc].length !== 1 ? 'es' : ''}</span>
                      </div>
                      <div className="location-actions" onClick={(e) => e.stopPropagation()}>
                        {loc !== 'Sem Local' && (
                          <>
                            <button className="btn-icon" title="Editar local" onClick={() => startEditLocation(getLocationData(loc) || { name: loc, address: '' })}>
                              <FiEdit size={14} />
                            </button>
                            <button className="btn-icon btn-icon-danger" title="Remover local" onClick={() => deleteLocation(loc)}>
                              <FiTrash2 size={14} />
                            </button>
                          </>
                        )}
                        <button className="btn-secondary btn-location-add" onClick={() => { setSelectedLocationForNewScreen(loc === 'Sem Local' ? '' : loc); setShowScreenModal(true); }}>
                          <FiPlus size={12} /> Tela
                        </button>
                      </div>
                    </div>
                    {collapsedLocations[loc] && grouped[loc].map(s => (
                      <div
                        key={s.id}
                        onClick={() => setSelected(s)}
                        className={`screen-row ${selected?.id === s.id ? 'active' : ''} ${s.status} ${selectedScreenIds.has(s.id) ? 'selected' : ''}`}
                      >
                        <input 
                          type="checkbox"
                          className="screen-checkbox"
                          checked={selectedScreenIds.has(s.id)}
                          onChange={() => toggleScreenSelection(s.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="screen-row-left">
                          <button className={`btn-fav ${s.favorite ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); toggleFavorite(s.id); }} title="Favorito">
                            <FiStar size={14} />
                          </button>
                          <span className={`status-indicator ${s.status}`}>
                            {s.status === 'online' ? <FiCheckCircle size={16} /> : s.status === 'static' ? <FiMonitor size={16} /> : s.status === 'not_installed' ? <FiMinusCircle size={16} /> : <FiAlertCircle size={16} />}
                          </span>
                          <div className="screen-row-info">
                            <strong>{s.name}</strong>
                            <small>
                              {s.status === 'online' ? 'Conectado' : s.status === 'static' ? 'Estático' : s.status === 'not_installed' ? 'Não Instalado' : 'Desconectado'} • {s.displayId ? `ID: ${s.displayId}` : `DB ID: ${s.id}`}
                              {s.outsideOperatingHours && s.status === 'offline' && ' • 🕐 Fora do horário'}
                            </small>
                          </div>
                        </div>
                        <div className="screen-row-status">
                          {s.priority && (
                            <span className={`priority-badge priority-${s.priority}`}>
                              {s.priority.charAt(0).toUpperCase() + s.priority.slice(1)}
                            </span>
                          )}
                          <span className={`status-badge ${s.status}`}>{s.status === 'static' ? 'Estático' : s.status === 'not_installed' ? 'N/A' : s.status}</span>
                          <button className="btn-icon btn-icon-danger btn-screen-remove" title="Remover monitor" onClick={(e) => { e.stopPropagation(); deleteScreen(s.id); }}>
                            <FiTrash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ));
              })()
            )}
          </div>
        </div>

        {/* Horizontal Resizer */}
        <div
          className="resize-divider-horizontal"
          onMouseDown={() => setIsDraggingHorizontal(true)}
          style={{ cursor: isDraggingHorizontal ? 'col-resize' : 'col-resize' }}
        />

        {/* Right Panel - Details */}
        <div ref={detailPanelRef} className="right-panel" style={{ flex: `0 0 ${100 - leftPanelWidth}%`, minWidth: 0 }}>
          {selected ? (
            <div className="detail-container">
              <div className="detail-tabs">
                <button
                  className={`tab-btn ${activeTab === 'details' ? 'active' : ''}`}
                  onClick={() => setActiveTab('details')}
                >
                  Detalhes
                </button>
                <button
                  className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
                  onClick={() => { setActiveTab('history'); if (!maintenanceHistoryData || maintenanceHistoryData.screenId !== selected.id) fetchMaintenanceHistory(selected.id); }}
                >
                  Historico
                </button>
                {selected.originId && (
                  <button
                    className={`tab-btn ${activeTab === 'diagnostics' ? 'active' : ''}`}
                    onClick={() => { setActiveTab('diagnostics'); if (!diagnosticsData || diagnosticsData.screenId !== selected.id) fetchDiagnostics(selected.id, diagnosticsHours); }}
                  >
                    <FiActivity size={13} /> Diagnóstico
                  </button>
                )}
              </div>

              {activeTab === 'details' && (
                <>
                  <div className="detail-header">
                    <div className="header-info">
                      <h2>{selected.name}</h2>
                      {selected.address && <p className="meta-address"><FiMapPin size={14} /> {selected.address}</p>}
                      {!selected.address && (() => { const locAddr = getLocationData(selected.location)?.address; return locAddr ? <p className="meta-address">{locAddr}</p> : null; })()}
                      {selected.displayId && <p className="meta-info"><strong>ID Display:</strong> {selected.displayId}</p>}
                      {getContactForScreen(selected) && (
                        <p className="meta-info">
                          <strong>Contato:</strong> {getContactForScreen(selected).name} — {getContactForScreen(selected).phone}
                        </p>
                      )}
                      {selected.operatingHoursStart && (
                        <p className="meta-info">
                          <FiClock size={14} /> <strong>Horário:</strong> {selected.operatingHoursStart} às {selected.operatingHoursEnd}
                          {selected.operatingDays && selected.operatingDays !== 'all' && ` (${selected.operatingDays === 'mon-fri' ? 'Seg-Sex' : selected.operatingDays === 'mon-sat' ? 'Seg-Sáb' : selected.operatingDays === 'tue-sun' ? 'Ter-Dom' : selected.operatingDays === 'tue-sat' ? 'Ter-Sáb' : selected.operatingDays === 'mon-sun-except-wed' ? 'Exceto Quarta' : selected.operatingDays})`}
                          {selected.outsideOperatingHours && <span className="badge-outside-hours">Fora do horário</span>}
                        </p>
                      )}
                      {(selected.flowPeople || selected.flowVehicles) && (
                        <p className="meta-info">
                          <strong>Fluxo mensal:</strong>{' '}
                          {selected.flowPeople ? `${selected.flowPeople.toLocaleString('pt-BR')} pessoas` : ''}
                          {selected.flowPeople && selected.flowVehicles ? ' / ' : ''}
                          {selected.flowVehicles ? `${selected.flowVehicles.toLocaleString('pt-BR')} veículos` : ''}
                        </p>
                      )}
                      {!editingScreenInfo && (
                        <button onClick={startEditScreenInfo} className="btn-edit-info" title="Editar endereço, horários e fluxo">
                          <FiEdit size={12} /> Editar Informações
                        </button>
                      )}
                      <p className="meta-info"><FiClock size={14} /> Criado: {new Date(selected.createdAt).toLocaleDateString('pt-BR')}</p>
                    </div>
                    <div className="header-actions">
                      {selected.originId && (
                        <button onClick={() => openOriginEdit(selected)} className="btn-origin-edit" title="Editar no sistema de origem">
                          <FiEdit size={14} /> Editar Origem
                        </button>
                      )}
                      <select
                        className={`status-select ${selected.status}`}
                        value={selected.status}
                        onChange={(e) => changeStatus(selected, e.target.value)}
                      >
                        <option value="online">Online</option>
                        <option value="offline">Offline</option>
                        <option value="not_installed">Não Instalado</option>
                        <option value="static">Estático</option>
                      </select>
                    </div>
                  </div>

                  <div className="detail-status">
                    <div className={`status-display ${selected.status}`}>
                      {selected.status === 'online' ? <FiCheckCircle size={24} /> : selected.status === 'static' ? <FiMonitor size={24} /> : selected.status === 'not_installed' ? <FiMinusCircle size={24} /> : <FiAlertCircle size={24} />}
                      <span>Atualmente {selected.status === 'online' ? 'Online' : selected.status === 'static' ? 'Estático' : selected.status === 'not_installed' ? 'Não Instalado' : 'Offline'}</span>
                    </div>
                  </div>

                  {/* Live View & Remote Control */}
                  {selected.originId && (
                    <div className="live-view-section">
                      <div className="live-view-header">
                        <h4>Controle Remoto</h4>
                      </div>
                      <div className="remote-control-buttons">
                        <button
                          className={`btn-remote ${liveViewActive ? 'btn-remote-danger' : 'btn-remote-success'}`}
                          onClick={() => liveViewActive ? stopLiveView() : startLiveView(selected.id)}
                        >
                          {liveViewActive ? <><FiEyeOff size={14} /> Desconectar Vídeo</> : <><FiEye size={14} /> Conectar Vídeo</>}
                        </button>
                        <button className="btn-remote btn-remote-primary" onClick={() => sendCommand(selected.id, 'f1', 'Reiniciar Playlist')}>
                          <FiRefreshCw size={14} /> Reiniciar Playlist
                        </button>
                        <button className="btn-remote btn-remote-primary" onClick={() => sendCommand(selected.id, 'f4', 'Forçar Atualização')}>
                          <FiDownload size={14} /> Forçar Atualização
                        </button>
                        <button className="btn-remote btn-remote-primary" onClick={() => sendCommand(selected.id, 'f6', 'Player/Atualizador')}>
                          <FiSettings size={14} /> Player/Atualizador
                        </button>
                        <button className="btn-remote btn-remote-danger" onClick={() => { if (window.confirm('Tem certeza que deseja reinicializar este monitor?')) sendCommand(selected.id, 'reboot', 'Reinicializar'); }}>
                          <FiAlertCircle size={14} /> Reinicializar
                        </button>
                      </div>
                      {liveViewActive && (
                        <div className={`live-view-container ${selected.orientation === 'vertical' ? 'vertical' : 'horizontal'}`}>
                          {liveFrame && (
                            <img
                              src={liveFrame}
                              alt="Tela ao vivo"
                              className="live-view-img"
                            />
                          )}
                          {liveLoading && <div className="live-view-loading">Conectando...</div>}
                          <div className="live-view-badge">🔴 AO VIVO</div>
                        </div>
                      )}
                    </div>
                  )}
                  {selected.stats && (() => {
                    try {
                      const s = JSON.parse(selected.stats);
                      return (
                        <div className="player-stats-section">
                          <h4>Status do Player</h4>
                          <div className="player-stats-grid">
                            {s.cpuTemp != null && (
                              <div className={`stat-card ${s.cpuTemp > 75 ? 'stat-danger' : s.cpuTemp > 60 ? 'stat-warn' : 'stat-ok'}`}>
                                <span className="stat-label">🌡️ Temperatura</span>
                                <span className="stat-value">{s.cpuTemp}°C</span>
                              </div>
                            )}
                            {s.cpuUsage && (
                              <div className="stat-card">
                                <span className="stat-label">⚡ CPU</span>
                                <span className="stat-value">{s.cpuUsage}</span>
                              </div>
                            )}
                            {s.disk && (
                              <div className={`stat-card ${s.disk.includes('Pct') && parseInt((s.disk.match(/Pct:\s*(\d+)/) || [])[1]) > 80 ? 'stat-danger' : 'stat-ok'}`}>
                                <span className="stat-label">💾 Disco</span>
                                <span className="stat-value">{s.disk}</span>
                              </div>
                            )}
                            {s.uptime && (
                              <div className="stat-card">
                                <span className="stat-label">⏱️ Uptime</span>
                                <span className="stat-value">{s.uptime}</span>
                              </div>
                            )}
                            {s.appVersion && (
                              <div className="stat-card">
                                <span className="stat-label">📱 App</span>
                                <span className="stat-value">{s.appVersion}</span>
                              </div>
                            )}
                          </div>
                          {selected.orientation && (
                            <p className="meta-info" style={{marginTop: '8px'}}>
                              <strong>Orientação:</strong> {selected.orientation === 'vertical' ? '📱 Vertical' : '🖥️ Horizontal'}
                            </p>
                          )}
                        </div>
                      );
                    } catch { return null; }
                  })()}
                  {!selected.stats && selected.originId && (
                    <div className="player-stats-section">
                      <h4>Status do Player</h4>
                      <p className="meta-info" style={{color: 'var(--text-muted)'}}>Aguardando dados do sistema de origem...</p>
                      {selected.orientation && (
                        <p className="meta-info"><strong>Orientação:</strong> {selected.orientation === 'vertical' ? '📱 Vertical' : '🖥️ Horizontal'}</p>
                      )}
                    </div>
                  )}

                  {editingScreenInfo && (
                    <div className="edit-info-section">
                      <h4><FiEdit size={14} /> Editar Informações</h4>
                      <div className="edit-info-grid">
                        <div className="edit-info-field">
                          <label>Endereço</label>
                          <input type="text" value={screenInfoForm.address} onChange={(e) => setScreenInfoForm({...screenInfoForm, address: e.target.value})} placeholder="Endereço do ponto" />
                        </div>
                        <div className="edit-info-row">
                          <div className="edit-info-field">
                            <label>Início</label>
                            <input type="time" value={screenInfoForm.operatingHoursStart} onChange={(e) => setScreenInfoForm({...screenInfoForm, operatingHoursStart: e.target.value})} />
                          </div>
                          <div className="edit-info-field">
                            <label>Fim</label>
                            <input type="time" value={screenInfoForm.operatingHoursEnd} onChange={(e) => setScreenInfoForm({...screenInfoForm, operatingHoursEnd: e.target.value})} />
                          </div>
                          <div className="edit-info-field">
                            <label>Dias</label>
                            <select value={screenInfoForm.operatingDays} onChange={(e) => setScreenInfoForm({...screenInfoForm, operatingDays: e.target.value})}>
                              <option value="">Sem definição</option>
                              <option value="all">Todos os dias</option>
                              <option value="mon-fri">Seg-Sex</option>
                              <option value="mon-sat">Seg-Sáb</option>
                              <option value="tue-sun">Ter-Dom</option>
                              <option value="tue-sat">Ter-Sáb</option>
                              <option value="mon-sun-except-wed">Exceto Quarta</option>
                            </select>
                          </div>
                        </div>
                        <div className="edit-info-row">
                          <div className="edit-info-field">
                            <label>Fluxo Pessoas</label>
                            <input type="number" value={screenInfoForm.flowPeople} onChange={(e) => setScreenInfoForm({...screenInfoForm, flowPeople: e.target.value})} placeholder="0" />
                          </div>
                          <div className="edit-info-field">
                            <label>Fluxo Veículos</label>
                            <input type="number" value={screenInfoForm.flowVehicles} onChange={(e) => setScreenInfoForm({...screenInfoForm, flowVehicles: e.target.value})} placeholder="0" />
                          </div>
                        </div>
                      </div>
                      <div className="edit-info-actions">
                        <button className="btn-primary" onClick={saveScreenInfo}>Salvar</button>
                        <button className="btn-secondary" onClick={() => setEditingScreenInfo(false)}>Cancelar</button>
                      </div>
                    </div>
                  )}

                  <div className="priority-section">
                    <h4>Prioridade de Manutenção</h4>
                    <div className="priority-selector">
                      <select 
                        value={selected.priority || 'medium'} 
                        onChange={(e) => updateScreenPriority(selected.id, e.target.value)}
                        className="priority-select"
                      >
                        <option value="Baixa">⬇️ Baixa</option>
                        <option value="Média">➡️ Média</option>
                        <option value="Alta">⬆️ Alta</option>
                        <option value="Crítica">⚠️ Crítica</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'history' && (
                <div className="history-tab">
                  {maintenanceHistoryLoading ? (
                    <div className="events-empty">Carregando histórico operacional...</div>
                  ) : maintenanceHistoryData?.summary ? (
                    <>
                      <div className="history-summary-grid">
                        <div className="history-summary-card"><span className="history-summary-label">Tickets</span><strong>{maintenanceHistoryData.summary.totalTickets}</strong></div>
                        <div className="history-summary-card"><span className="history-summary-label">Em aberto</span><strong>{maintenanceHistoryData.summary.openTickets}</strong></div>
                        <div className="history-summary-card"><span className="history-summary-label">Preventivas</span><strong>{maintenanceHistoryData.summary.preventiveSchedules}</strong></div>
                        <div className="history-summary-card"><span className="history-summary-label">Tempo gasto</span><strong>{maintenanceHistoryData.summary.totalTimeMinutes || 0} min</strong></div>
                        <div className="history-summary-card money"><span className="history-summary-label">Custo acumulado</span><strong>{formatCurrency(maintenanceHistoryData.summary.totalCost)}</strong></div>
                        <div className="history-summary-card"><span className="history-summary-label">Resolução média</span><strong>{maintenanceHistoryData.summary.avgResolutionHours > 0 ? `${maintenanceHistoryData.summary.avgResolutionHours}h` : '-'}</strong></div>
                      </div>

                      {maintenanceHistoryData.summary.recommendations?.length > 0 && (
                        <div className="history-recommendations">
                          <h4>Recomendações</h4>
                          {maintenanceHistoryData.summary.recommendations.map((item) => (
                            <div key={item} className="history-recommendation-item">{item}</div>
                          ))}
                        </div>
                      )}

                      <div className="history-panels-grid">
                        <div className="events-section">
                          <h4>Tickets da Tela</h4>
                          {maintenanceHistoryData.tickets.length === 0 ? (
                            <div className="events-empty">Nenhum ticket vinculado</div>
                          ) : (
                            <div className="history-ticket-list">
                              {maintenanceHistoryData.tickets.slice(0, 8).map((ticket) => (
                                <div key={ticket.id} className="history-ticket-item">
                                  <div>
                                    <strong>#{ticket.id} {ticket.title}</strong>
                                    <small>{ticket.status} • {ticket.category} • {new Date(ticket.createdAt).toLocaleDateString('pt-BR')}</small>
                                  </div>
                                  <div className="history-ticket-metrics">
                                    <span>{ticket.timeSpentMinutes || 0} min</span>
                                    <span>{formatCurrency(ticket.totalCost)}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="events-section">
                          <h4>Preventivas e Alertas</h4>
                          <div className="history-mixed-list">
                            {maintenanceHistoryData.schedules.slice(0, 5).map((schedule) => (
                              <div key={`schedule-${schedule.id}`} className="history-mixed-item">
                                <strong>{schedule.title}</strong>
                                <small>{new Date(`${schedule.scheduledDate}T12:00:00`).toLocaleDateString('pt-BR')} • {schedule.status}</small>
                              </div>
                            ))}
                            {maintenanceHistoryData.alerts.slice(0, 5).map((alert) => (
                              <div key={`alert-${alert.id}`} className={`history-mixed-item alert-${alert.severity}`}>
                                <strong>{alert.title}</strong>
                                <small>{new Date(alert.createdAt).toLocaleString('pt-BR')}</small>
                              </div>
                            ))}
                            {maintenanceHistoryData.schedules.length === 0 && maintenanceHistoryData.alerts.length === 0 && (
                              <div className="events-empty">Nenhuma preventiva ou alerta relevante</div>
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : null}

                  <div className="history-filters">
                    <div className="filter-field">
                      <label>Status</label>
                      <select value={eventFilterStatus} onChange={(e) => setEventFilterStatus(e.target.value)}>
                        <option value="all">Todos</option>
                        <option value="online">Online</option>
                        <option value="offline">Offline</option>
                      </select>
                    </div>
                    <div className="filter-field">
                      <label>De</label>
                      <input type="datetime-local" value={eventFrom} onChange={(e) => setEventFrom(e.target.value)} />
                    </div>
                    <div className="filter-field">
                      <label>Ate</label>
                      <input type="datetime-local" value={eventTo} onChange={(e) => setEventTo(e.target.value)} />
                    </div>
                    <button
                      className="btn-secondary"
                      onClick={() => { setEventFilterStatus('all'); setEventFrom(''); setEventTo(''); }}
                    >
                      Limpar
                    </button>
                  </div>

                  <div className="events-section">
                    <h4>Historico de Status</h4>
                    {filteredEvents.length === 0 ? (
                      <div className="events-empty">Nenhum evento registrado</div>
                    ) : (
                      <div className="events-list">
                        {filteredEvents.map((evt) => (
                          <div key={evt.id} className="event-item">
                            <span className={`event-status ${evt.status}`}>{evt.status}</span>
                            <span className="event-time">{new Date(evt.createdAt).toLocaleString('pt-BR')}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'diagnostics' && (
                <div className="diagnostics-tab">
                  <div className="diagnostics-header">
                    <h3><FiActivity size={16} /> Diagnóstico do Player</h3>
                    <div className="diagnostics-period">
                      {[6, 12, 24, 48, 72, 168].map(h => (
                        <button key={h} className={`period-btn ${diagnosticsHours === h ? 'active' : ''}`}
                          onClick={() => { setDiagnosticsHours(h); fetchDiagnostics(selected.id, h); }}>
                          {h < 24 ? `${h}h` : `${h/24}d`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {diagnosticsLoading && <div className="diagnostics-loading">Carregando telemetria...</div>}

                  {!diagnosticsLoading && diagnosticsData && diagnosticsData.snapshotCount === 0 && (
                    <div className="diagnostics-empty">
                      <FiClock size={32} />
                      <p>Sem dados de telemetria ainda.</p>
                      <small>Os dados serão coletados automaticamente a cada 2 minutos enquanto o player estiver online.</small>
                    </div>
                  )}

                  {!diagnosticsLoading && diagnosticsData && diagnosticsData.snapshotCount > 0 && (
                    <>
                      <div className={`health-banner health-${diagnosticsData.health}`}>
                        <span className="health-icon">{diagnosticsData.health === 'critical' ? '🔴' : diagnosticsData.health === 'attention' ? '🟡' : '🟢'}</span>
                        <span className="health-text">
                          {diagnosticsData.health === 'critical' ? 'Atenção Crítica' : diagnosticsData.health === 'attention' ? 'Requer Atenção' : 'Player Saudável'}
                        </span>
                        <small>{diagnosticsData.snapshotCount} leituras nas últimas {diagnosticsHours < 24 ? `${diagnosticsHours}h` : `${diagnosticsHours/24} dias`}</small>
                      </div>

                      <div className="diagnostics-cards">
                        {diagnosticsData.diagnostics.map((d, i) => (
                          <div key={i} className={`diag-card diag-${d.type}`}>
                            <div className="diag-card-header">
                              <span className="diag-icon">{d.type === 'danger' ? '⚠️' : d.type === 'warning' ? '⚡' : '✅'}</span>
                              <strong>{d.title}</strong>
                            </div>
                            <p>{d.detail}</p>
                          </div>
                        ))}
                      </div>

                      {/* Mini Charts */}
                      {diagnosticsData.timeSeries.length > 1 && (() => {
                        const ts = diagnosticsData.timeSeries;
                        const temps = ts.filter(p => p.cpuTemp != null);
                        const cpus = ts.filter(p => p.cpuUsage != null);
                        const disks = ts.filter(p => p.diskPct != null);

                        const renderMiniChart = (data, getValue, label, unit, dangerThreshold, warnThreshold) => {
                          if (data.length < 2) return null;
                          const values = data.map(getValue);
                          const min = Math.min(...values);
                          const max = Math.max(...values);
                          const range = max - min || 1;
                          const w = 300, h = 80, pad = 2;
                          const points = values.map((v, i) => {
                            const x = pad + (i / (values.length - 1)) * (w - 2 * pad);
                            const y = h - pad - ((v - min) / range) * (h - 2 * pad);
                            return `${x},${y}`;
                          }).join(' ');
                          const lastVal = values[values.length - 1];
                          const lineColor = lastVal > dangerThreshold ? 'var(--danger)' : lastVal > warnThreshold ? '#f59e0b' : 'var(--success)';

                          return (
                            <div className="mini-chart-card">
                              <div className="mini-chart-header">
                                <span>{label}</span>
                                <strong style={{color: lineColor}}>{lastVal.toFixed(1)}{unit}</strong>
                              </div>
                              <svg viewBox={`0 0 ${w} ${h}`} className="mini-chart-svg">
                                {dangerThreshold && (
                                  <line x1={0} y1={h - pad - ((dangerThreshold - min) / range) * (h - 2 * pad)} x2={w} y2={h - pad - ((dangerThreshold - min) / range) * (h - 2 * pad)} stroke="var(--danger)" strokeWidth="0.5" strokeDasharray="4,4" />
                                )}
                                <polyline fill="none" stroke={lineColor} strokeWidth="1.5" points={points} />
                              </svg>
                              <div className="mini-chart-range">
                                <small>{new Date(data[0].t).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</small>
                                <small>{new Date(data[data.length-1].t).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</small>
                              </div>
                            </div>
                          );
                        };

                        return (
                          <div className="mini-charts-grid">
                            {renderMiniChart(temps, d => d.cpuTemp, '🌡️ Temperatura', '°C', 80, 65)}
                            {renderMiniChart(cpus, d => d.cpuUsage, '⚡ CPU', '%', 80, 60)}
                            {renderMiniChart(disks, d => d.diskPct, '💾 Disco', '%', 90, 75)}
                          </div>
                        );
                      })()}

                      {/* Status timeline */}
                      {diagnosticsData.timeSeries.length > 1 && (() => {
                        const ts = diagnosticsData.timeSeries;
                        const w = 300, h = 16;
                        const segW = w / ts.length;
                        return (
                          <div className="status-timeline-section">
                            <div className="mini-chart-header"><span>📡 Status</span></div>
                            <svg viewBox={`0 0 ${w} ${h}`} className="status-timeline-svg">
                              {ts.map((p, i) => (
                                <rect key={i} x={i * segW} y={0} width={Math.max(segW, 1)} height={h}
                                  fill={p.status === 'online' ? 'var(--success)' : p.status === 'static' ? 'var(--accent)' : '#ef4444'} opacity={0.7} />
                              ))}
                            </svg>
                            <div className="mini-chart-range">
                              <small>{new Date(ts[0].t).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</small>
                              <small>{new Date(ts[ts.length-1].t).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</small>
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>
              )}

              {activeTab === 'details' && (
                <>
                  <div className="detail-scroll-content">
                    <div className="config-section">
                    <div className="config-form">
                      <button onClick={refreshStatus} className="btn-refresh">Atualizar Status</button>
                      {selected.status === 'offline' && selected.originId && (
                        <button onClick={() => autoDiagnose(selected.id)} className="btn-auto-diagnose" title="Tenta reiniciar o player remotamente">
                          <FiZap size={14} /> Auto-Diagnóstico
                        </button>
                      )}
                    </div>
                    {selected.lastHeartbeat && (
                      <div className="heartbeat-info">
                        <small>Última conexão: {new Date(selected.lastHeartbeat).toLocaleString('pt-BR')}</small>
                      </div>
                    )}
                  </div>

                  <div className="notes-container">
                    <h3>Anotações de Manutenção</h3>
                    
                    <button onClick={() => setShowNoteModal(true)} className="btn-primary-full">
                      <FiPlus size={16} /> Adicionar Anotação
                    </button>

                    <div className="notes-history">
                      {notes.length === 0 ? (
                        <div className="no-notes">Nenhuma anotação ainda</div>
                      ) : (
                        notes.map(note => (
                          <div key={note.id} className="note-item">
                            <div className="note-meta">
                              <strong>{note.author}</strong>
                              <span>{new Date(note.createdAt).toLocaleDateString('pt-BR')}</span>
                            </div>
                            <p>{note.content}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="empty-detail">
              <FiMonitor size={48} />
              <h3>Selecione um display para ver detalhes</h3>
              <p>Escolha da lista à esquerda ou crie um novo display</p>
            </div>
          )}
        </div>
      </div>
      </>
      ) : activePage === 'contacts' ? (
      <div className="contacts-page">
        <div className="contacts-header">
          <div className="contacts-title">
            <h3><FiPhone size={18} /> Contatos dos Responsáveis</h3>
            <p>Cadastre: Nome | Local | Contato.</p>
          </div>
          <button className="btn-primary" onClick={() => setShowContactModal(true)}>
            <FiPlus size={14} /> Adicionar Contato
          </button>
        </div>

        {contactsList.length === 0 ? (
          <div className="contacts-empty">
            <FiPhone size={32} />
            <p>Nenhum contato cadastrado ainda.</p>
          </div>
        ) : (
          <div className="contacts-grid">
            {contactsList.map((contact) => (
              <div key={contact.id} className="contact-card">
                <div className="contact-card-top">
                  <strong>{contact.name}</strong>
                  <button className="btn-secondary" onClick={() => deleteContact(contact.id)}>
                    <FiTrash2 size={14} /> Remover
                  </button>
                </div>
                <div className="contact-card-row">
                  <span>Local:</span>
                  <b>{getTargetLabel(contact)}</b>
                </div>
                <div className="contact-card-row">
                  <span>Contato:</span>
                  <a
                    className="contact-link"
                    href={getWhatsappLink(contact.phone)}
                    target="_blank"
                    rel="noreferrer"
                    title="Abrir conversa no WhatsApp"
                  >
                    {formatPhone(contact.phone)}
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      ) : activePage === 'reports' ? (
      <div className="reports-page">
        <div className="reports-header">
          <div className="reports-title">
            <h3><FiFileText size={18} /> Relatório Semanal de Manutenção</h3>
            <p>Adicione os dados e gere sua tabela para impressão ou PDF.</p>
          </div>
          <div className="reports-actions">
            <button className="btn-primary" onClick={printReport}>
              <FiPrinter size={14} /> Salvar em PDF / Imprimir
            </button>
            <button className="btn-secondary" onClick={() => setReportRows([])}>
              Limpar Tabela
            </button>
          </div>
        </div>

        <div className="reports-form-grid">
          <select
            className="report-input"
            value={reportScreenId}
            onChange={(e) => autoFillReportFromScreen(e.target.value)}
          >
            <option value="">-- Selecionar Monitor (auto-preenche) --</option>
            {screens.filter(s => s.status === 'offline').map(s => (
              <option key={s.id} value={s.id}>{s.name} — {s.location || 'Sem Local'}</option>
            ))}
          </select>
          <input
            type="text"
            className="report-input"
            placeholder="Cidade"
            value={reportCity}
            onChange={(e) => setReportCity(e.target.value)}
          />
          <input
            type="text"
            className="report-input"
            placeholder="Ponto"
            value={reportPointName}
            onChange={(e) => setReportPointName(e.target.value)}
          />
          <input
            type="text"
            className="report-input"
            placeholder="Endereço"
            value={reportAddress}
            onChange={(e) => setReportAddress(e.target.value)}
          />
          <input
            type="text"
            className="report-input"
            placeholder="ID"
            value={reportDisplayId}
            onChange={(e) => setReportDisplayId(e.target.value)}
          />
          <input
            type="datetime-local"
            className="report-input"
            value={reportOfflineSince}
            onChange={(e) => setReportOfflineSince(e.target.value)}
          />
          <textarea
            className="report-input report-description"
            placeholder="Descrição"
            value={reportDescription}
            onChange={(e) => setReportDescription(e.target.value)}
            rows="3"
          />
          <button className="btn-primary report-add-btn" onClick={addReportRow}>
            <FiPlus size={14} /> Adicionar à Tabela
          </button>
        </div>

        <div className="reports-table-wrapper">
          {reportRows.length === 0 ? (
            <div className="reports-empty">Nenhum registro no relatório ainda.</div>
          ) : (
            reportRowsByCity.map(({ city, rows }) => (
              <div key={city} className={`report-city-section city-${city.toLowerCase().replace(/\s+/g, '-')}`}>
                <div className="report-city-title">{city}</div>
                <table className="reports-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Ponto</th>
                      <th>Endereço</th>
                      <th>ID</th>
                      <th>Descrição</th>
                      <th>Offline desde</th>
                      <th>Estado</th>
                      <th>Comentários</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td className="reports-empty-city" colSpan={9}>Sem registros para esta cidade.</td>
                      </tr>
                    ) : (
                      rows.map((row, index) => (
                        <tr key={row.id}>
                          <td className="reports-col-index">{index + 1}</td>
                          <td>{row.pointName}</td>
                          <td>{row.address}</td>
                          <td>{row.displayId}</td>
                          <td><span className="report-description-cell">{row.description}</span></td>
                          <td>
                            <span className="offline-since-badge">{formatReportDateTime(row.offlineSince)}</span>
                          </td>
                          <td>
                            <select
                              className="report-status-select"
                              value={row.status || 'Pendente'}
                              onChange={(e) => updateReportRow(row.id, { status: e.target.value })}
                            >
                              <option value="Pendente">Pendente</option>
                              <option value="Em andamento">Em andamento</option>
                              <option value="Concluído">Concluído</option>
                              <option value="Aguardando peça">Aguardando peça</option>
                            </select>
                          </td>
                          <td>
                            <textarea
                              className="report-comment-input"
                              placeholder="Adicionar comentário"
                              value={row.comments || ''}
                              onChange={(e) => updateReportRow(row.id, { comments: e.target.value })}
                              rows={2}
                            />
                          </td>
                          <td className="reports-col-actions">
                            <button
                              className="report-remove-btn"
                              onClick={() => removeReportRow(row.id)}
                              title="Remover linha"
                            >
                              <FiTrash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      </div>
      ) : activePage === 'tickets' ? (
      /* ===== TICKETS PAGE ===== */
      <div className="tickets-page">
        <div className="page-header-row">
          <div>
            <h3><FiClipboard size={18} /> Sistema de Tickets</h3>
            <p>Gerencie tickets de manutenção com rastreamento completo.</p>
          </div>
          <div className="page-header-actions">
            <div className="ticket-filters">
              <button className={`filter-chip ${ticketFilter === 'all' ? 'active' : ''}`} onClick={() => setTicketFilter('all')}>Todos</button>
              <button className={`filter-chip ${ticketFilter === 'open' ? 'active' : ''}`} onClick={() => setTicketFilter('open')}>Abertos</button>
              <button className={`filter-chip ${ticketFilter === 'in_progress' ? 'active' : ''}`} onClick={() => setTicketFilter('in_progress')}>Em Andamento</button>
              <button className={`filter-chip ${ticketFilter === 'waiting_part' ? 'active' : ''}`} onClick={() => setTicketFilter('waiting_part')}>Aguardando Peça</button>
              <button className={`filter-chip ${ticketFilter === 'resolved' ? 'active' : ''}`} onClick={() => setTicketFilter('resolved')}>Resolvidos</button>
              <button className={`filter-chip ${ticketFilter === 'closed' ? 'active' : ''}`} onClick={() => setTicketFilter('closed')}>Fechados</button>
            </div>
            <button className="btn-primary" onClick={() => { setEditingTicket(null); setTicketForm(EMPTY_TICKET_FORM); setShowTicketModal(true); }}>
              <FiPlus size={14} /> Novo Ticket
            </button>
          </div>
        </div>

        {/* Ticket Stats Cards */}
        {ticketStats && (
          <div className="ticket-stats-row">
            <div className="ticket-stat-card"><div className="tsc-value">{ticketStats.open}</div><div className="tsc-label">Abertos</div></div>
            <div className="ticket-stat-card warning"><div className="tsc-value">{ticketStats.in_progress}</div><div className="tsc-label">Em Andamento</div></div>
            <div className="ticket-stat-card info"><div className="tsc-value">{ticketStats.waiting_part}</div><div className="tsc-label">Aguardando</div></div>
            <div className="ticket-stat-card success"><div className="tsc-value">{ticketStats.resolved + ticketStats.closed}</div><div className="tsc-label">Resolvidos</div></div>
            <div className="ticket-stat-card neutral"><div className="tsc-value">{ticketStats.avgTimeMinutes > 0 ? Math.round(ticketStats.avgTimeMinutes) + 'min' : '-'}</div><div className="tsc-label">Tempo Médio</div></div>
            <div className="ticket-stat-card money"><div className="tsc-value">{formatCurrency(ticketStats.totalCost)}</div><div className="tsc-label">Custo Total</div></div>
          </div>
        )}

        {/* Tickets List */}
        <div className="tickets-list">
          {tickets.filter(t => ticketFilter === 'all' || t.status === ticketFilter).length === 0 ? (
            <div className="empty-state"><FiClipboard size={36} /><p>Nenhum ticket encontrado</p></div>
          ) : tickets.filter(t => ticketFilter === 'all' || t.status === ticketFilter).map(ticket => (
            <div key={ticket.id} className={`ticket-card priority-border-${ticket.priority}`}>
              <div className="ticket-card-header">
                <div className="ticket-id">#{ticket.id}</div>
                <span className={`ticket-status-badge ${ticket.status}`}>
                  {ticket.status === 'open' ? 'Aberto' : ticket.status === 'in_progress' ? 'Em Andamento' : ticket.status === 'waiting_part' ? 'Aguardando Peça' : ticket.status === 'resolved' ? 'Resolvido' : 'Fechado'}
                </span>
                <span className={`priority-badge priority-${ticket.priority}`}>{ticket.priority}</span>
                <span className="ticket-category"><FiTag size={12} /> {ticket.category}</span>
              </div>
              <div className="ticket-card-body">
                <h4>{ticket.title}</h4>
                {ticket.description && <p className="ticket-desc">{ticket.description}</p>}
                <div className="ticket-meta">
                  {ticket.Screen && <span><FiMonitor size={12} /> {ticket.Screen.name}</span>}
                  {ticket.assignedTo && <span><FiUser size={12} /> {ticket.assignedTo}</span>}
                  <span><FiClock size={12} /> {new Date(ticket.createdAt).toLocaleDateString('pt-BR')}</span>
                  {ticket.createdBy && <span>por {ticket.createdBy}</span>}
                  {ticket.timeSpentMinutes > 0 && <span><FiClock size={12} /> {ticket.timeSpentMinutes}min gastos</span>}
                  {(ticket.totalCost > 0 || ticket.actualCost > 0) && <span><FiDollarSign size={12} /> {formatCurrency(ticket.totalCost || ticket.actualCost)}</span>}
                </div>
              </div>
              <div className="ticket-card-actions">
                <select value={ticket.status} onChange={(e) => updateTicketStatus(ticket.id, e.target.value)} className="ticket-status-select">
                  <option value="open">Aberto</option>
                  <option value="in_progress">Em Andamento</option>
                  <option value="waiting_part">Aguardando Peça</option>
                  <option value="resolved">Resolvido</option>
                  <option value="closed">Fechado</option>
                </select>
                <button className="btn-icon" onClick={() => { setEditingTicket(ticket); setTicketForm({ title: ticket.title, description: ticket.description || '', category: ticket.category, priority: ticket.priority, screenId: ticket.screenId || '', assignedTo: ticket.assignedTo || '', timeSpentMinutes: ticket.timeSpentMinutes || '', actualCost: ticket.actualCost ?? '' }); setShowTicketModal(true); }}><FiEdit size={14} /></button>
                <button className="btn-icon btn-icon-danger" onClick={() => deleteTicket(ticket.id)}><FiTrash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      ) : activePage === 'calendar' ? (
      /* ===== CALENDAR/SCHEDULE PAGE ===== */
      <div className="calendar-page">
        <div className="page-header-row">
          <div>
            <h3><FiCalendar size={18} /> Agenda de Manutenções</h3>
            <p>Agendar visitas e manutenções programadas.</p>
          </div>
          <div className="page-header-actions">
            <div className="calendar-nav">
              <button className="btn-secondary" onClick={() => { setCalendarMonth(p => p === 0 ? 11 : p - 1); if (calendarMonth === 0) setCalendarYear(p => p - 1); }}><FiChevronLeft size={16} /></button>
              <span className="calendar-month-label">{new Date(calendarYear, calendarMonth).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span>
              <button className="btn-secondary" onClick={() => { setCalendarMonth(p => p === 11 ? 0 : p + 1); if (calendarMonth === 11) setCalendarYear(p => p + 1); }}><FiChevronRight size={16} /></button>
            </div>
            <button className="btn-primary" onClick={() => { setScheduleForm(EMPTY_SCHEDULE_FORM); setShowScheduleModal(true); }}>
              <FiPlus size={14} /> Novo Agendamento
            </button>
          </div>
        </div>

        <div className="calendar-grid">
          {['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'].map(d => <div key={d} className="calendar-day-header">{d}</div>)}
          {(() => {
            const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
            const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
            const cells = [];
            for (let i = 0; i < firstDay; i++) cells.push(<div key={`e${i}`} className="calendar-cell empty"></div>);
            for (let d = 1; d <= daysInMonth; d++) {
              const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const daySchedules = schedules.filter(s => s.scheduledDate === dateStr);
              const isToday = new Date().toISOString().split('T')[0] === dateStr;
              cells.push(
                <div key={d} className={`calendar-cell ${isToday ? 'today' : ''} ${daySchedules.length > 0 ? 'has-events' : ''}`} onClick={() => { setScheduleForm(prev => ({ ...prev, scheduledDate: dateStr })); setShowScheduleModal(true); }}>
                  <span className="calendar-day-num">{d}</span>
                  {daySchedules.slice(0, 3).map(s => (
                    <div key={s.id} className="calendar-event" style={{ background: s.color || '#E95D34' }}>
                      <span>{s.scheduledTime && `${s.scheduledTime} `}{s.title}</span>
                      <button className="cal-event-del" onClick={(e) => { e.stopPropagation(); deleteSchedule(s.id); }}>×</button>
                    </div>
                  ))}
                  {daySchedules.length > 3 && <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', paddingLeft: 4 }}>+{daySchedules.length - 3} mais</span>}
                </div>
              );
            }
            // Fill remaining cells to complete the last week row
            const totalCells = cells.length;
            const remainder = totalCells % 7;
            if (remainder > 0) { for (let i = 0; i < 7 - remainder; i++) cells.push(<div key={`ef${i}`} className="calendar-cell empty"></div>); }
            return cells;
          })()}
        </div>

        {/* Upcoming schedules list */}
        <div className="upcoming-schedules">
          <h4><FiCalendar size={16} /> Próximos Agendamentos</h4>
          {schedules.filter(s => s.scheduledDate >= new Date().toISOString().split('T')[0]).length === 0 ? (
            <p className="text-muted">Nenhum agendamento futuro — clique em um dia do calendário para agendar.</p>
          ) : schedules.filter(s => s.scheduledDate >= new Date().toISOString().split('T')[0]).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)).slice(0, 10).map(s => {
            const dt = new Date(s.scheduledDate + 'T12:00:00');
            return (
              <div key={s.id} className="schedule-item" style={{ borderLeftColor: s.color || '#E95D34' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div className="schedule-date-badge" style={{ background: s.color || '#E95D34' }}>
                    <span className="sdb-day">{dt.getDate()}</span>
                    <span className="sdb-mon">{dt.toLocaleDateString('pt-BR', { month: 'short' })}</span>
                  </div>
                  <div className="schedule-info">
                    <strong>{s.title}</strong>
                    {s.scheduledTime && <small><FiClock size={11} /> {s.scheduledTime}</small>}
                    {s.assignedTo && <small><FiUser size={11} /> {s.assignedTo}</small>}
                    {s.Screen && <small><FiMonitor size={11} /> {s.Screen.name}</small>}
                    {s.location && <small><FiMapPin size={11} /> {s.location}</small>}
                  </div>
                </div>
                <button className="btn-icon btn-icon-danger" onClick={() => deleteSchedule(s.id)}><FiTrash2 size={14} /></button>
              </div>
            );
          })}
        </div>
      </div>

      ) : activePage === 'inventory' ? (
      /* ===== INVENTORY/PARTS PAGE ===== */
      <div className="inventory-page">
        <div className="page-header-row">
          <div>
            <h3><FiPackage size={18} /> Estoque de Peças</h3>
            <p>Controle de peças, players e componentes sobressalentes.</p>
          </div>
          <div className="page-header-actions">
            <button className="btn-primary" onClick={() => { setEditingPart(null); setPartForm({ name: '', category: 'other', quantity: 0, minQuantity: 1, location: '', notes: '', unitCost: '' }); setShowPartModal(true); }}>
              <FiPlus size={14} /> Adicionar Peça
            </button>
          </div>
        </div>

        {/* Inventory stats */}
        <div className="inventory-stats-row">
          <div className="inv-stat"><span className="inv-stat-val">{parts.length}</span><span className="inv-stat-label">Total Itens</span></div>
          <div className="inv-stat warning"><span className="inv-stat-val">{parts.filter(p => p.quantity <= p.minQuantity).length}</span><span className="inv-stat-label">Estoque Baixo</span></div>
          <div className="inv-stat"><span className="inv-stat-val">{parts.reduce((a, p) => a + p.quantity, 0)}</span><span className="inv-stat-label">Total Unidades</span></div>
          <div className="inv-stat"><span className="inv-stat-val">R$ {parts.reduce((a, p) => a + (p.unitCost || 0) * p.quantity, 0).toFixed(0)}</span><span className="inv-stat-label">Valor Total</span></div>
        </div>

        <div className="parts-grid">
          {parts.length === 0 ? (
            <div className="empty-state"><FiPackage size={36} /><p>Nenhuma peça cadastrada</p></div>
          ) : parts.map(part => (
            <div key={part.id} className={`part-card ${part.quantity <= part.minQuantity ? 'low-stock' : ''}`}>
              <div className="part-card-header">
                <span className="part-category-badge">{
                  part.category === 'player' ? '🖥️ Player' : part.category === 'cable' ? '🔌 Cabo' : part.category === 'display' ? '📺 Display' :
                  part.category === 'power_supply' ? '⚡ Fonte' : part.category === 'router' ? '📡 Router' : part.category === 'mount' ? '🔧 Suporte' : '📦 Outro'
                }</span>
                <div className="part-actions">
                  <button className="btn-icon" onClick={() => { setEditingPart(part); setPartForm({ name: part.name, category: part.category, quantity: part.quantity, minQuantity: part.minQuantity, location: part.location || '', notes: part.notes || '', unitCost: part.unitCost || '' }); setShowPartModal(true); }}><FiEdit size={13} /></button>
                  <button className="btn-icon btn-icon-danger" onClick={() => deletePart(part.id)}><FiTrash2 size={13} /></button>
                </div>
              </div>
              <h4>{part.name}</h4>
              <div className="part-quantity">
                <span className={`qty ${part.quantity <= part.minQuantity ? 'low' : ''}`}>{part.quantity}</span>
                <small>/ mín {part.minQuantity}</small>
                <div className="qty-controls">
                  <button onClick={async () => { await axios.patch(`${API_BASE}/parts/${part.id}`, { quantity: Math.max(0, part.quantity - 1) }, authConfig); fetchParts(); }}>−</button>
                  <button onClick={async () => { await axios.patch(`${API_BASE}/parts/${part.id}`, { quantity: part.quantity + 1 }, authConfig); fetchParts(); }}>+</button>
                </div>
              </div>
              {part.location && <small className="part-location"><FiMapPin size={11} /> {part.location}</small>}
              {part.unitCost > 0 && <small className="part-cost">R$ {part.unitCost.toFixed(2)} un.</small>}
              {part.notes && <small className="part-notes">{part.notes}</small>}
            </div>
          ))}
        </div>
      </div>

      ) : activePage === 'analytics-pro' ? (
      /* ===== ANALYTICS PRO PAGE ===== */
      <div className="analytics-pro-page">
        <div className="page-header-row">
          <div>
            <h3><FiTrendingUp size={18} /> Analytics Avançado</h3>
            <p>Métricas de SLA, padrões de falha e produtividade dos técnicos.</p>
          </div>
          <div className="page-header-actions">
            <button className="btn-secondary" onClick={() => { fetchPatterns(); fetchTicketStats(); fetchLoopAudits(); }}>
              <FiRefreshCw size={14} /> Atualizar
            </button>
            {currentUser?.role === 'admin' && (
              <button className="btn-secondary" onClick={syncLoopAudits} disabled={loopAuditSyncing || loopAuditData.syncInProgress}>
                <FiClock size={14} /> {loopAuditSyncing || loopAuditData.syncInProgress ? 'Sincronizando Loop...' : 'Sincronizar Loops'}
              </button>
            )}
          </div>
        </div>

        {/* Ticket Analytics */}
        {ticketStats && (
          <>
          <h4 className="section-title"><FiClipboard size={16} /> Métricas de Tickets</h4>
          <div className="analytics-cards-row">
            <div className="an-card"><div className="an-val">{ticketStats.total}</div><div className="an-label">Total Tickets</div></div>
            <div className="an-card accent"><div className="an-val">{ticketStats.open + ticketStats.in_progress}</div><div className="an-label">Em Aberto</div></div>
            <div className="an-card success"><div className="an-val">{ticketStats.resolved + ticketStats.closed}</div><div className="an-label">Resolvidos</div></div>
            <div className="an-card"><div className="an-val">{Math.round(ticketStats.avgTimeMinutes)}min</div><div className="an-label">Tempo Médio</div></div>
          </div>

          {/* By Category */}
          <div className="analytics-section-grid">
            <div className="an-section-card">
              <h5>Por Categoria</h5>
              {Object.entries(ticketStats.byCategory || {}).map(([cat, count]) => (
                <div key={cat} className="an-bar-row">
                  <span>{cat}</span>
                  <div className="an-bar"><div className="an-bar-fill" style={{ width: `${(count / Math.max(ticketStats.total, 1)) * 100}%` }}></div></div>
                  <span className="an-bar-count">{count}</span>
                </div>
              ))}
            </div>
            <div className="an-section-card">
              <h5>Por Técnico</h5>
              {Object.entries(ticketStats.byAssignee || {}).length === 0 ? <p className="text-muted">Nenhum ticket atribuído</p> :
                Object.entries(ticketStats.byAssignee).map(([user, count]) => (
                  <div key={user} className="an-bar-row">
                    <span><FiUser size={12} /> {user}</span>
                    <div className="an-bar"><div className="an-bar-fill" style={{ width: `${(count / Math.max(ticketStats.total, 1)) * 100}%` }}></div></div>
                    <span className="an-bar-count">{count}</span>
                  </div>
                ))
              }
            </div>
          </div>
          </>
        )}

        {/* Loop/Cycle Capacity */}
        <h4 className="section-title"><FiClock size={16} /> Auditoria de Loop Comercial</h4>
        {loopAuditLoading ? (
          <p className="text-muted" style={{ padding: '16px' }}>Carregando auditoria de loop...</p>
        ) : (
          <>
            <div className="analytics-cards-row">
              <div className="an-card"><div className="an-val">{loopAuditData.summary?.total || 0}</div><div className="an-label">Monitores Auditados</div></div>
              <div className="an-card" style={{ borderLeft: '3px solid #ef4444' }}><div className="an-val">{loopAuditData.summary?.critical || 0}</div><div className="an-label">Críticos ({'>='} {Math.round((loopAuditData.targetSeconds || 180) / 60)}min)</div></div>
              <div className="an-card" style={{ borderLeft: '3px solid #f59e0b' }}><div className="an-val">{loopAuditData.summary?.high || 0}</div><div className="an-label">Alto Risco</div></div>
              <div className="an-card"><div className="an-val">{loopAuditData.summary?.totalOccupied || 0}</div><div className="an-label">Total de Cotas Ocupadas</div></div>
              <div className="an-card success"><div className="an-val">{loopAuditData.summary?.totalSellable10 || 0}</div><div className="an-label">Cotas 10s Disponíveis</div></div>
              <div className="an-card success"><div className="an-val">{loopAuditData.summary?.totalSellable15 || 0}</div><div className="an-label">Cotas 15s Disponíveis</div></div>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', margin: '8px 0 12px' }}>
              <label style={{ fontSize: '12px', color: '#64748b' }}>Cidade</label>
              <select className="modern-select" value={loopCityFilter} onChange={(e) => setLoopCityFilter(e.target.value)}>
                <option value="all">Todas as cidades</option>
                {loopCityOptions.map((city) => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>

              <label style={{ fontSize: '12px', color: '#64748b' }}>Vendedor</label>
              <select className="modern-select" value={loopVendorFilter} onChange={(e) => setLoopVendorFilter(e.target.value)}>
                <option value="all">Todos os vendedores ativos</option>
                {vendors.filter((v) => v.active !== false).map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
                ))}
              </select>

              <button className="btn-secondary" onClick={sendCityLoopToWhatsapp}>
                <FiSend size={14} /> Disparar WhatsApp (API)
              </button>
            </div>

            {groupedLoopItems.length === 0 ? (
              <p className="text-muted" style={{ padding: '16px' }}>Sem dados de loop ainda. Use "Sincronizar Loops" para iniciar o scraping.</p>
            ) : (
              <div className="loop-table">
                <table>
                  <thead>
                    <tr>
                      <th>Prioridade</th>
                      <th>Local</th>
                      <th>Loop Atual</th>
                      <th>Tempo Livre</th>
                      <th>Risco</th>
                      <th>Total Cotas Ocupadas</th>
                      <th>Cotas 10s</th>
                      <th>Cotas 15s</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      let rank = 0;
                      return groupedLoopItemsWithCityHeaders.map((row) => {
                      if (row.isCityHeader) {
                        return (
                          <tr key={row.key}>
                            <td colSpan={8} style={{ fontWeight: 700, background: '#f8fafc' }}>
                              Cidade: {row.city}
                            </td>
                          </tr>
                        );
                      }

                      rank += 1;

                      return (
                        <tr key={row.key}>
                          <td>#{rank}</td>
                          <td>
                            <strong>{row.location || '-'}</strong>
                            <div className="loop-origin-id">
                              IDs: {row.originIds.join(', ')}
                              {row.monitorCount > 1 ? ` • ${row.monitorCount} telas` : ''}
                            </div>
                          </td>
                          <td>{formatSecondsClock(row.loopSeconds)}</td>
                          <td>
                            {Number.isFinite(row.remainingSeconds)
                              ? `${formatSecondsClock(row.remainingSeconds)} livre${row.remainingSeconds < 60 ? ' (< 1 min)' : ''}`
                              : '-'}
                          </td>
                          <td>
                            <span className={`loop-risk-badge ${row.riskLevel || 'unknown'}`}>
                              {row.riskLevel || 'unknown'}
                            </span>
                          </td>
                          <td>{row.estimatedUsedSlots10 ?? 0}</td>
                          <td>{row.availableSlots10 ?? 0}</td>
                          <td>{row.availableSlots15 ?? 0}</td>
                        </tr>
                      );
                    });
                    })()}
                  </tbody>
                </table>
                <small className="text-muted">
                  Exibição agrupada por cidade e por local + loop (mesmo local com mesmo loop vira uma linha). Ordem de prioridade: mais preocupante para menos preocupante. Meta de loop: {formatSecondsClock(loopAuditData.targetSeconds || 180)}.
                  {' '}Envio automático para vendedores ocorre semanalmente por cidade e pode ser disparado manualmente pelo botão acima.
                  {loopAuditData.lastSyncAt ? ` Última sincronização: ${new Date(loopAuditData.lastSyncAt).toLocaleString('pt-BR')}.` : ''}
                </small>
              </div>
            )}
          </>
        )}

        {/* Patterns */}
        <h4 className="section-title"><FiActivity size={16} /> Padrões de Falha Detectados</h4>
        {patterns.length === 0 ? (
          <p className="text-muted" style={{padding: '16px'}}>Nenhum padrão recorrente detectado nos últimos 30 dias.</p>
        ) : (
          <div className="patterns-list">
            {patterns.map((p, i) => (
              <div key={i} className="pattern-card">
                <div className="pattern-icon"><FiAlertCircle size={20} /></div>
                <div className="pattern-info">
                  <strong>{p.screenName}</strong>
                  <small>{p.location}</small>
                  <p>Fica offline frequentemente às <strong>{String(p.peakHour).padStart(2, '0')}:00h</strong> — {p.occurrences} ocorrências em 30 dias (de {p.totalOfflineEvents} total)</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* SLA Overview */}
        <h4 className="section-title"><FiTrendingUp size={16} /> Disponibilidade por Display (últimos 30 dias)</h4>
        <div className="sla-table">
          <table>
            <thead><tr><th>Display</th><th>Local</th><th>Status Atual</th><th>Uptime (%)</th></tr></thead>
            <tbody>
              {screens.filter(s => s.status === 'online' || s.status === 'offline').slice(0, 20).map(s => (
                <tr key={s.id}><td>{s.name}</td><td>{s.location}</td><td><span className={`status-badge ${s.status}`}>{s.status}</span></td><td>-</td></tr>
              ))}
            </tbody>
          </table>
          <small className="text-muted">Mostrando top 20 displays ativos. SLA detalhado disponível por display individual.</small>
        </div>
      </div>

      ) : activePage === 'notifications' ? (
      /* ===== NOTIFICATION CONFIG PAGE ===== */
      <div className="notifications-page">
        <div className="page-header-row">
          <div>
            <h3><FiBell size={18} /> Configuração de Notificações</h3>
            <p>Configure mensagens automáticas via WhatsApp para técnicos.</p>
          </div>
        </div>

        {notifConfig ? (
          <>
          {/* WhatsApp Connection */}
          <div className="notif-section">
            <h4><FiSend size={16} /> Conexão WhatsApp API</h4>
            <p className="notif-help">
              Para enviar mensagens automáticas, você precisa de uma API de WhatsApp 
              (ex: <strong>Evolution API</strong>, <strong>Z-API</strong>, <strong>WPPConnect</strong>, etc). 
              Configure a URL e chave de autenticação abaixo.
            </p>
            <div className="notif-toggle-row">
              <label>WhatsApp Ativo</label>
              <button className={`toggle-btn ${notifConfig.whatsappEnabled ? 'on' : ''}`} 
                onClick={() => saveNotifConfig({ whatsappEnabled: !notifConfig.whatsappEnabled })}>
                {notifConfig.whatsappEnabled ? <><FiToggleRight size={20} /> Ativo</> : <><FiToggleLeft size={20} /> Inativo</>}
              </button>
            </div>
            <div className="notif-form-grid">
              <div className="form-group">
                <label>URL da API</label>
                <input type="text" value={notifConfig.whatsappApiUrl || ''} placeholder="https://sua-api.com/message/sendText"
                  onChange={(e) => setNotifConfig(p => ({ ...p, whatsappApiUrl: e.target.value }))}
                  onBlur={() => saveNotifConfig({ whatsappApiUrl: notifConfig.whatsappApiUrl })} />
              </div>
              <div className="form-group">
                <label>Chave de Autenticação (API Key / Token)</label>
                <input type="password" value={notifConfig.whatsappApiKey || ''} placeholder="Bearer seu-token-aqui"
                  onChange={(e) => setNotifConfig(p => ({ ...p, whatsappApiKey: e.target.value }))}
                  onBlur={() => saveNotifConfig({ whatsappApiKey: notifConfig.whatsappApiKey })} />
              </div>
              <div className="form-group">
                <label>Telefone Padrão (com DDD)</label>
                <input type="text" value={notifConfig.whatsappDefaultPhone || ''} placeholder="5511999999999"
                  onChange={(e) => setNotifConfig(p => ({ ...p, whatsappDefaultPhone: e.target.value }))}
                  onBlur={() => saveNotifConfig({ whatsappDefaultPhone: notifConfig.whatsappDefaultPhone })} />
              </div>
            </div>
            <div className="notif-test-row">
              <input type="text" value={notifTestPhone} onChange={(e) => setNotifTestPhone(e.target.value)} placeholder="Telefone para teste (ou usa o padrão)" />
              <button className="btn-primary" onClick={testNotification}><FiSend size={14} /> Enviar Teste</button>
            </div>
          </div>

          {/* Triggers */}
          <div className="notif-section">
            <h4><FiAlertCircle size={16} /> Gatilhos de Notificação</h4>
            <p className="notif-help">Escolha quais eventos disparam mensagens automáticas para os técnicos.</p>
            <div className="notif-triggers-grid">
              {[
                { key: 'notifyOnScheduleCreate', label: 'Novo agendamento criado', icon: '📅' },
                { key: 'notifyOnTicketCreate', label: 'Novo ticket aberto', icon: '🎫' },
                { key: 'notifyOnTicketAssign', label: 'Ticket atribuído a técnico', icon: '👤' },
                { key: 'notifyOnOffline4h', label: 'Display offline há +4 horas', icon: '⚠️' },
                { key: 'notifyOnOscillation', label: 'Oscilação detectada (5+ mudanças em 6h)', icon: '🔄' },
                { key: 'notifyOnAlertCritical', label: 'Alertas críticos', icon: '🔴' },
                { key: 'notifyOnAlertWarning', label: 'Alertas de aviso', icon: '🟡' },
              ].map(trigger => (
                <div key={trigger.key} className="notif-trigger-card" onClick={() => saveNotifConfig({ [trigger.key]: !notifConfig[trigger.key] })}>
                  <span className="notif-trigger-icon">{trigger.icon}</span>
                  <span className="notif-trigger-label">{trigger.label}</span>
                  <span className={`notif-trigger-status ${notifConfig[trigger.key] ? 'on' : 'off'}`}>
                    {notifConfig[trigger.key] ? 'ON' : 'OFF'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Technician Contacts */}
          <div className="notif-section">
            <h4><FiUser size={16} /> Contatos dos Técnicos</h4>
            <p className="notif-help">Adicione os telefones dos técnicos que receberão as notificações. Todos recebem todas as notificações ativas.</p>
            <div className="notif-contacts-list">
              {JSON.parse(notifConfig.technicianContacts || '[]').map((c, i) => (
                <div key={i} className="notif-contact-row">
                  <input type="text" value={c.name} placeholder="Nome" onChange={(e) => {
                    const contacts = JSON.parse(notifConfig.technicianContacts || '[]');
                    contacts[i].name = e.target.value;
                    setNotifConfig(p => ({ ...p, technicianContacts: JSON.stringify(contacts) }));
                  }} onBlur={() => saveNotifConfig({ technicianContacts: notifConfig.technicianContacts })} />
                  <input type="text" value={c.phone} placeholder="5511999999999" onChange={(e) => {
                    const contacts = JSON.parse(notifConfig.technicianContacts || '[]');
                    contacts[i].phone = e.target.value;
                    setNotifConfig(p => ({ ...p, technicianContacts: JSON.stringify(contacts) }));
                  }} onBlur={() => saveNotifConfig({ technicianContacts: notifConfig.technicianContacts })} />
                  <button className="btn-icon btn-icon-danger" onClick={() => {
                    const contacts = JSON.parse(notifConfig.technicianContacts || '[]');
                    contacts.splice(i, 1);
                    const updated = JSON.stringify(contacts);
                    setNotifConfig(p => ({ ...p, technicianContacts: updated }));
                    saveNotifConfig({ technicianContacts: updated });
                  }}><FiTrash2 size={14} /></button>
                </div>
              ))}
              <button className="btn-secondary" onClick={() => {
                const contacts = JSON.parse(notifConfig.technicianContacts || '[]');
                contacts.push({ name: '', phone: '' });
                setNotifConfig(p => ({ ...p, technicianContacts: JSON.stringify(contacts) }));
              }}><FiPlus size={14} /> Adicionar Técnico</button>
            </div>
          </div>

          {/* How it works */}
          <div className="notif-section notif-howto">
            <h4>💡 Como funciona</h4>
            <ol>
              <li><strong>Configure uma API de WhatsApp</strong> — Ex: Evolution API (gratuita, self-hosted) ou Z-API (paga, fácil).</li>
              <li><strong>Insira a URL do endpoint</strong> de envio de mensagem (geralmente <code>/message/sendText</code>).</li>
              <li><strong>Coloque o token/chave</strong> de autenticação da API.</li>
              <li><strong>Adicione os telefones</strong> dos técnicos (formato: 5511999999999).</li>
              <li><strong>Ative os gatilhos</strong> que deseja — quando o evento ocorrer, todos os técnicos cadastrados receberão a mensagem.</li>
              <li><strong>Teste</strong> clicando em "Enviar Teste" para validar a conexão.</li>
            </ol>
          </div>
          </>
        ) : (
          <div className="empty-state"><FiBell size={36} /><p>Carregando configuração...</p></div>
        )}
      </div>

      ) : activePage === 'contracts' ? (
      <div className="contracts-page">
        <div className="contracts-header">
          <div className="contracts-title">
            <h3><FiDollarSign size={18} /> Contratos a Vencer</h3>
            <p>
              Acompanhamento comercial com aviso automático em 15 e 5 dias.
            </p>
          </div>
          <div className="contracts-actions">
            {currentUser?.role === 'admin' && (
              <button className="btn-primary" onClick={syncContracts} disabled={contractsSyncing}>
                <FiRefreshCw size={14} className={contractsSyncing ? 'spin' : ''} /> {contractsSyncing ? 'Sincronizando...' : 'Sincronizar Contratos'}
              </button>
            )}
          </div>
        </div>

        <div className="contracts-tabs">
          <button className={`contracts-tab ${contractsTab === 'contracts' ? 'active' : ''}`} onClick={() => setContractsTab('contracts')}>
            <FiFileText size={14} /> Contratos ({contracts.length})
          </button>
          {currentUser?.role === 'admin' && (
            <button className={`contracts-tab ${contractsTab === 'vendors' ? 'active' : ''}`} onClick={() => setContractsTab('vendors')}>
              <FiUserCheck size={14} /> Vendedores ({vendors.length})
            </button>
          )}
        </div>

        {(contractsTab === 'contracts' || currentUser?.role !== 'admin') ? (
          <>
            {contracts.filter(c => c.daysRemaining <= 15).length > 0 && (
              <div className="contracts-alert-banner">
                <FiAlertCircle size={16} />
                <span><strong>{contracts.filter(c => c.daysRemaining <= 15).length}</strong> contrato(s) vencendo nos próximos 15 dias!</span>
              </div>
            )}

            {contractsLoading ? (
              <div className="empty-state"><FiClock size={36} /><p>Carregando contratos...</p></div>
            ) : contracts.length === 0 ? (
              <div className="empty-state">
                <FiDollarSign size={36} />
                <p>Nenhum contrato encontrado.</p>
                <p style={{fontSize: '12px', color: 'var(--text-muted)'}}>Aguardando sincronização de contratos do sistema de origem.</p>
              </div>
            ) : (
              <div className="contracts-table-wrapper">
                <table className="contracts-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Anunciante</th>
                      <th>Vencimento</th>
                      <th>Valor</th>
                      <th>Vendedor</th>
                      <th>Dias</th>
                      <th>Comercial</th>
                      <th>Notificado</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...contracts].sort((a, b) => a.daysRemaining - b.daysRemaining).map(c => {
                      const urgency = getUrgencyStyle(c.daysRemaining);
                      const followUp = getFollowUpBadge(c.salesFollowUpStatus);
                      return (
                        <tr key={c.id} className={c.daysRemaining <= 15 ? 'contract-urgent' : ''}>
                          <td>
                            <span className="contract-urgency-badge" style={{background: urgency.bg, color: urgency.color}}>
                              {urgency.icon} {urgency.label}
                            </span>
                          </td>
                          <td className="contract-advertiser">{c.advertiser}</td>
                          <td>{c.expirationDate ? new Date(c.expirationDate + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}</td>
                          <td className="contract-value">{c.value ? `R$ ${Number(c.value).toLocaleString('pt-BR', {minimumFractionDigits: 2})}` : '-'}</td>
                          <td>
                            {c.vendorName || '-'}
                            {c.Vendor && <span className="contract-vendor-linked" title="Vendedor vinculado"><FiUserCheck size={12} /></span>}
                          </td>
                          <td>
                            <span className="contract-days" style={{color: urgency.color, fontWeight: 700}}>
                              {c.daysRemaining} dias
                            </span>
                          </td>
                          <td>
                            <div className="contract-follow-up">
                              <span className="contract-follow-up-badge" style={{ background: followUp.bg, color: followUp.color }}>
                                {followUp.label}
                              </span>
                              {['admin', 'comercial'].includes(currentUser?.role) && (
                                <div className="contract-follow-up-actions">
                                  <button className="btn-icon" title="Marcar como contatado" onClick={() => updateContractFollowUp(c.id, 'contacted')}>
                                    <FiPhone size={14} />
                                  </button>
                                  <button className="btn-icon" title="Marcar como renovado" onClick={() => updateContractFollowUp(c.id, 'renewed')}>
                                    <FiCheckCircle size={14} />
                                  </button>
                                  <button className="btn-icon danger" title="Marcar como não renovado" onClick={() => updateContractFollowUp(c.id, 'not_renewed')}>
                                    <FiAlertCircle size={14} />
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                          <td>
                            {c.notified ? (
                              <span className="contract-notified" title={c.lastNotifiedAt ? `Último: ${new Date(c.lastNotifiedAt).toLocaleString('pt-BR')}` : ''}>
                                <FiCheckCircle size={14} color="#28A745" /> Sim
                              </span>
                            ) : (
                              <span style={{color: 'var(--text-muted)'}}>Não</span>
                            )}
                          </td>
                          <td className="contract-actions-cell">
                            {currentUser?.role === 'admin' && (c.Vendor || c.vendorId) && c.daysRemaining <= 15 && (
                              <button className="btn-icon" title="Enviar WhatsApp" onClick={() => notifyContract(c.id)}>
                                <FiSend size={14} />
                              </button>
                            )}
                            {currentUser?.role === 'admin' && (
                              <button className="btn-icon danger" title="Remover" onClick={() => deleteContract(c.id)}>
                                <FiTrash2 size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="vendors-header">
              <button className="btn-primary" onClick={() => { setVendorForm({ name: '', phone: '', email: '' }); setEditingVendor(null); setShowVendorModal(true); }}>
                <FiPlus size={14} /> Novo Vendedor
              </button>
            </div>

            {vendors.length === 0 ? (
              <div className="empty-state">
                <FiUserCheck size={36} />
                <p>Nenhum vendedor cadastrado.</p>
                <p style={{fontSize: '12px', color: 'var(--text-muted)'}}>Cadastre vendedores para receber notificações automáticas de contratos a vencer.</p>
              </div>
            ) : (
              <div className="vendors-grid">
                {vendors.map(v => (
                  <div key={v.id} className="vendor-card">
                    <div className="vendor-card-header">
                      <div className="vendor-avatar"><FiUser size={20} /></div>
                      <div className="vendor-info">
                        <h4>{v.name}</h4>
                        {v.email && <span className="vendor-email">{v.email}</span>}
                      </div>
                      <span className={`vendor-status ${v.active ? 'active' : 'inactive'}`}>
                        {v.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                    <div className="vendor-card-body">
                      <div className="vendor-phone"><FiPhone size={13} /> {v.phone}</div>
                    </div>
                    <div className="vendor-card-actions">
                      <button className="btn-secondary btn-sm" onClick={() => { setVendorForm({ name: v.name, phone: v.phone, email: v.email || '' }); setEditingVendor(v); setShowVendorModal(true); }}>
                        <FiEdit size={13} /> Editar
                      </button>
                      <button className="btn-secondary btn-sm danger-text" onClick={() => deleteVendor(v.id)}>
                        <FiTrash2 size={13} /> Remover
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Vendor Modal */}
        {showVendorModal && (
          <div className="modal-overlay" onClick={() => setShowVendorModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{editingVendor ? 'Editar Vendedor' : 'Novo Vendedor'}</h2>
                <button className="modal-close" onClick={() => setShowVendorModal(false)}>×</button>
              </div>
              <div className="modal-body">
                <label>Nome *</label>
                <input type="text" placeholder="Nome do vendedor" value={vendorForm.name} onChange={(e) => setVendorForm({...vendorForm, name: e.target.value})} />
                <label>Telefone * <span style={{fontSize: '11px', color: 'var(--text-muted)'}}>(formato: 43988005719)</span></label>
                <input type="text" placeholder="43988005719" value={vendorForm.phone} onChange={(e) => setVendorForm({...vendorForm, phone: e.target.value})} />
                <label>Email</label>
                <input type="email" placeholder="email@exemplo.com" value={vendorForm.email} onChange={(e) => setVendorForm({...vendorForm, email: e.target.value})} />
              </div>
              <div className="modal-footer">
                <button onClick={() => setShowVendorModal(false)} className="btn-secondary">Cancelar</button>
                <button onClick={saveVendor} className="btn-primary">{editingVendor ? 'Salvar' : 'Cadastrar'}</button>
              </div>
            </div>
          </div>
        )}
      </div>

      ) : activePage === 'backups' ? (
      <div className="backup-page">
        {/* Origin Sync Section */}
        <div className="backup-header" style={{marginBottom: '24px'}}>
          <div className="backup-title">
            <h3><FiRefreshCw size={18} /> Sincronização com Sistema de Origem</h3>
            <p>Importe monitores e sincronize status do sistema redeintermidia.com.</p>
          </div>
          <div className="backup-actions">
            <button className="btn-primary" onClick={importFromOrigin} disabled={importLoading}>
              <FiDownload size={14} /> {importLoading ? 'Importando...' : 'Importar Monitores'}
            </button>
            <button className="btn-secondary" onClick={syncFromOrigin} disabled={syncLoading}>
              <FiRefreshCw size={14} /> {syncLoading ? 'Sincronizando...' : 'Sincronizar Agora'}
            </button>
            <button className="btn-secondary" style={{background: '#DC3545', color: '#fff', borderColor: '#DC3545'}} onClick={resetAllData}>
              <FiTrash2 size={14} /> Resetar Dados
            </button>
          </div>
        </div>

        <div className="backup-header">
          <div className="backup-title">
            <h3><FiDatabase size={18} /> Backups do Banco de Dados</h3>
            <p>Crie backups manuais ou restaure uma versão anterior.</p>
          </div>
          <div className="backup-actions">
            <button className="btn-primary" onClick={createBackup}>
              <FiPlus size={14} /> Criar Backup
            </button>
            <button className="btn-secondary" onClick={fetchBackups}>
              Atualizar Lista
            </button>
          </div>
        </div>

        {backupsLoading ? (
          <div className="backup-loading">Carregando backups...</div>
        ) : backups.length === 0 ? (
          <div className="backup-empty">Nenhum backup encontrado.</div>
        ) : (
          <div className="backup-list">
            {backups.map((b) => (
              <div key={b.name} className="backup-item">
                <div className="backup-info">
                  <span className="backup-name">{b.name}</span>
                  <span className="backup-meta">{formatFileSize(b.size)} — {new Date(b.created).toLocaleString('pt-BR')}</span>
                </div>
                <button className="backup-restore-btn" onClick={() => restoreBackup(b.name)}>
                  Restaurar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      ) : activePage === 'approvals' ? (
      <div className="approvals-page">
        <div className="page-header">
          <div>
            <h2><FiUserCheck size={20} /> Aprovações de Técnicos</h2>
            <p>Gerencie os pedidos de acesso enviados pelos técnicos.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {['pending','approved','rejected'].map(s => (
              <button key={s} className={`btn-secondary ${regStatusFilter === s ? 'active' : ''}`}
                style={{ fontWeight: regStatusFilter === s ? 700 : 400, opacity: regStatusFilter === s ? 1 : 0.7 }}
                onClick={() => { setRegStatusFilter(s); fetchPendingRegistrations(s); }}>
                {s === 'pending' ? '⏳ Pendentes' : s === 'approved' ? '✅ Aprovados' : '❌ Rejeitados'}
              </button>
            ))}
            <button className="btn-secondary" onClick={() => fetchPendingRegistrations(regStatusFilter)} title="Atualizar">
              <FiRefreshCw size={14} />
            </button>
          </div>
        </div>

        {pendingRegLoading ? (
          <div className="loading-state">Carregando solicitações...</div>
        ) : pendingRegistrations.length === 0 ? (
          <div className="empty-state">
            <FiUserCheck size={40} style={{ opacity: 0.3 }} />
            <p>{regStatusFilter === 'pending' ? 'Nenhuma solicitação pendente.' : 'Nenhum registro encontrado.'}</p>
          </div>
        ) : (
          <div className="approvals-grid">
            {pendingRegistrations.map(reg => (
              <div key={reg.id} className={`approval-card status-${reg.status}`}>
                <div className="approval-photo">
                  {reg.photoData
                    ? <img src={reg.photoData} alt="Foto" />
                    : <div className="approval-photo-placeholder">{reg.firstName?.charAt(0)}{reg.lastName?.charAt(0)}</div>
                  }
                  <span className={`approval-badge badge-${reg.status}`}>
                    {reg.status === 'pending' ? 'Pendente' : reg.status === 'approved' ? 'Aprovado' : 'Rejeitado'}
                  </span>
                </div>
                <div className="approval-info">
                  <div className="approval-name">{reg.firstName} {reg.lastName}</div>
                  <div className="approval-detail"><strong>CPF:</strong> {reg.cpf}</div>
                  <div className="approval-detail"><strong>E-mail:</strong> {reg.email}</div>
                  <div className="approval-detail"><strong>Solicitado:</strong> {new Date(reg.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</div>
                  {reg.reviewedBy && <div className="approval-detail"><strong>Revisado por:</strong> {reg.reviewedBy}</div>}
                  {reg.rejectionReason && <div className="approval-detail rejection-reason"><strong>Motivo:</strong> {reg.rejectionReason}</div>}
                </div>
                {reg.status === 'pending' && (
                  <div className="approval-actions">
                    <button className="btn-approve" onClick={() => approveRegistration(reg.id)}>
                      ✅ Aprovar
                    </button>
                    <button className="btn-reject" onClick={() => { setRegRejectModal(reg); setRegRejectReason(''); }}>
                      ❌ Rejeitar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 20, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              <h3 style={{ margin: 0 }}>Usuários do Sistema</h3>
              <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>Controle papéis e usuários ativos para atribuição em tickets/agendamentos.</p>
            </div>
            <button className="btn-secondary" onClick={fetchAdminUsers}>
              <FiRefreshCw size={14} /> Atualizar Usuários
            </button>
          </div>

          {adminUsersLoading ? (
            <div className="loading-state">Carregando usuários...</div>
          ) : adminUsers.length === 0 ? (
            <div className="empty-state" style={{ padding: 12 }}>Nenhum usuário encontrado.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ padding: '8px 6px' }}>Usuário</th>
                    <th style={{ padding: '8px 6px' }}>Papel</th>
                    <th style={{ padding: '8px 6px' }}>Status</th>
                    <th style={{ padding: '8px 6px' }}>Criado em</th>
                    <th style={{ padding: '8px 6px' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {adminUsers.map((user) => (
                    <tr key={user.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 6px' }}>
                        <strong>{user.username}</strong>
                        {currentUser?.id === user.id ? <span style={{ marginLeft: 8, fontSize: 11, color: '#64748b' }}>(você)</span> : null}
                      </td>
                      <td style={{ padding: '8px 6px' }}>
                        <select value={user.role} onChange={(e) => updateAdminUser(user.id, { role: e.target.value })}>
                          <option value="user">Técnico</option>
                          <option value="comercial">Comercial</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td style={{ padding: '8px 6px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 999,
                          fontSize: 12,
                          background: user.active ? '#ecfdf3' : '#fef2f2',
                          color: user.active ? '#166534' : '#991b1b'
                        }}>
                          {user.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 6px', fontSize: 12, color: '#64748b' }}>
                        {user.createdAt ? new Date(user.createdAt).toLocaleString('pt-BR') : '-'}
                      </td>
                      <td style={{ padding: '8px 6px' }}>
                        <button
                          className="btn-secondary"
                          onClick={() => updateAdminUser(user.id, { active: !user.active })}
                          disabled={currentUser?.id === user.id && user.active}
                          title={currentUser?.id === user.id && user.active ? 'Você não pode desativar seu próprio usuário' : ''}
                        >
                          {user.active ? 'Desativar' : 'Ativar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Reject reason modal */}
        {regRejectModal && (
          <div className="modal-overlay" onClick={() => setRegRejectModal(null)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Rejeitar solicitação</h2>
                <button className="modal-close" onClick={() => setRegRejectModal(null)}>×</button>
              </div>
              <div className="modal-body">
                <p style={{ marginBottom: 12 }}>Rejeitar o pedido de <strong>{regRejectModal.firstName} {regRejectModal.lastName}</strong>?</p>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Motivo (opcional)</label>
                <textarea className="note-input" rows={3} placeholder="Ex.: Documentação insuficiente..."
                  value={regRejectReason} onChange={e => setRegRejectReason(e.target.value)} style={{ marginTop: 6 }} />
              </div>
              <div className="modal-footer">
                <button className="btn-secondary" onClick={() => setRegRejectModal(null)}>Cancelar</button>
                <button className="btn-primary" style={{ background: '#dc3545', borderColor: '#dc3545' }}
                  onClick={() => rejectRegistration(regRejectModal.id, regRejectReason)}>
                  Confirmar rejeição
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      ) : null}

        </div>
      </div>

      {/* Modal para Adicionar Anotação */}
      {showNoteModal && (
        <div className="modal-overlay" onClick={() => setShowNoteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Adicionar Anotação de Manutenção</h2>
              <button className="modal-close" onClick={() => setShowNoteModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <label>Usuário</label>
              <input
                type="text"
                value={getUserDisplayName(currentUser)}
                className="note-author"
                readOnly
              />
              <textarea
                placeholder="Descreva a anotação de manutenção..."
                value={noteText}
                onChange={(e) => {
                  setNoteText(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${e.target.scrollHeight}px`;
                }}
                rows="1"
                className="note-input note-textarea-auto"
              />
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowNoteModal(false)} className="btn-secondary">Cancelar</button>
              <button onClick={addNote} className="btn-primary">Adicionar</button>
            </div>
          </div>
        </div>
      )}
      {/* Modal para Adicionar Tela */}
      {showScreenModal && (
        <div className="modal-overlay" onClick={() => { setShowScreenModal(false); setSelectedLocationForNewScreen(''); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Adicionar Tela</h2>
              <button className="modal-close" onClick={() => { setShowScreenModal(false); setSelectedLocationForNewScreen(''); }}>×</button>
            </div>
            <div className="modal-body">
              <input
                type="text"
                placeholder="Nome do display"
                value={newScreenName}
                onChange={(e) => setNewScreenName(e.target.value)}
                className="note-author"
              />
              <input
                type="text"
                placeholder="Display ID (opcional)"
                value={newScreenDisplayId}
                onChange={(e) => setNewScreenDisplayId(e.target.value)}
                className="note-input"
              />
              <label style={{ fontSize: 13, color: 'var(--palette-deep)' }}>Local</label>
              <select value={selectedLocationForNewScreen} onChange={(e) => setSelectedLocationForNewScreen(e.target.value)} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--palette-border)' }}>
                <option value="">-- Sem Local --</option>
                {locations.map(loc => (
                  <option key={loc.name} value={loc.name}>{loc.name}</option>
                ))}
              </select>
              <div style={{ marginTop: 8 }}>
                <button className="btn-secondary" onClick={() => { setShowLocationModal(true); }}>+ Adicionar Local</button>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => { setShowScreenModal(false); setSelectedLocationForNewScreen(''); }} className="btn-secondary">Cancelar</button>
              <button onClick={createScreen} className="btn-primary">Adicionar Tela</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para Adicionar Local (client-side) */}
      {showLocationModal && (
        <div className="modal-overlay" onClick={() => setShowLocationModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Adicionar Local</h2>
              <button className="modal-close" onClick={() => setShowLocationModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <input
                type="text"
                placeholder="Nome do local"
                value={newLocationName}
                onChange={(e) => setNewLocationName(e.target.value)}
                className="note-author"
              />
              <input
                type="text"
                placeholder="Endereço"
                value={newLocationAddress}
                onChange={(e) => setNewLocationAddress(e.target.value)}
                className="note-input"
              />
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowLocationModal(false)} className="btn-secondary">Cancelar</button>
              <button onClick={() => {
                const cleaned = newLocationName.trim();
                if (!cleaned) return showAlert('Digite o nome do local', 'warning');
                if (!locations.some(l => l.name === cleaned)) {
                  const updated = [...locations, { name: cleaned, address: newLocationAddress.trim() }];
                  saveLocations(updated);
                }
                setNewLocationName('');
                setNewLocationAddress('');
                setShowLocationModal(false);
              }} className="btn-primary">Adicionar Local</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para Editar Local */}
      {editingLocation && (
        <div className="modal-overlay" onClick={() => setEditingLocation(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Editar Local</h2>
              <button className="modal-close" onClick={() => setEditingLocation(null)}>×</button>
            </div>
            <div className="modal-body">
              <input
                type="text"
                placeholder="Nome do local"
                value={editLocationName}
                onChange={(e) => setEditLocationName(e.target.value)}
                className="note-author"
              />
              <input
                type="text"
                placeholder="Endereço"
                value={editLocationAddress}
                onChange={(e) => setEditLocationAddress(e.target.value)}
                className="note-input"
              />
            </div>
            <div className="modal-footer">
              <button onClick={() => setEditingLocation(null)} className="btn-secondary">Cancelar</button>
              <button onClick={saveEditLocation} className="btn-primary">Salvar</button>
            </div>
          </div>
        </div>
      )}

      {showRegisterModal && (
        <div className="modal-overlay" onClick={() => setShowRegisterModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Criar Usuário</h2>
              <button className="modal-close" onClick={() => setShowRegisterModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <input
                type="email"
                placeholder="E-mail do usuário"
                value={registerEmail}
                onChange={(e) => setRegisterEmail(e.target.value)}
                className="note-author"
              />
              <input
                type="password"
                placeholder="Senha"
                value={registerPassword}
                onChange={(e) => setRegisterPassword(e.target.value)}
                className="note-input"
              />
              <label style={{ fontSize: 13, color: 'var(--palette-deep)' }}>Perfil</label>
              <select value={registerRole} onChange={(e) => setRegisterRole(e.target.value)} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--palette-border)' }}>
                <option value="tecnico">Técnico</option>
                <option value="comercial">Comercial</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowRegisterModal(false)} className="btn-secondary">Cancelar</button>
              <button onClick={registerUser} className="btn-primary">Criar</button>
            </div>
          </div>
        </div>
      )}

      {showChangePasswordModal && (
        <div className="modal-overlay" onClick={() => setShowChangePasswordModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Alterar Senha</h2>
              <button className="modal-close" onClick={() => setShowChangePasswordModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <input
                type="password"
                placeholder="Senha atual"
                value={currentPasswordInput}
                onChange={(e) => setCurrentPasswordInput(e.target.value)}
                className="note-author"
              />
              <input
                type="password"
                placeholder="Nova senha"
                value={newPasswordInput}
                onChange={(e) => setNewPasswordInput(e.target.value)}
                className="note-input"
              />
              <input
                type="password"
                placeholder="Confirmar nova senha"
                value={confirmPasswordInput}
                onChange={(e) => setConfirmPasswordInput(e.target.value)}
                className="note-input"
              />
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowChangePasswordModal(false)} className="btn-secondary">Cancelar</button>
              <button onClick={changePassword} className="btn-primary">Salvar</button>
            </div>
          </div>
        </div>
      )}

      {showContactModal && (
        <div className="modal-overlay" onClick={() => setShowContactModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Adicionar Contato</h2>
              <button className="modal-close" onClick={() => setShowContactModal(false)}>×</button>
            </div>
            <div className="modal-body contacts-form-modal">
              <input
                type="text"
                placeholder="Nome"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="contact-input"
              />
              <select
                value={contactTarget}
                onChange={(e) => setContactTarget(e.target.value)}
                className="contact-input"
              >
                <option value="">Local (atribuição)</option>
                {localOptions.map((locationName) => (
                  <option key={`local-${locationName}`} value={`local:${locationName}`}>
                    Local: {locationName}
                  </option>
                ))}
                {screenOptions.map((screen) => (
                  <option key={`screen-${screen.id}`} value={`screen:${screen.id}`}>
                    Tela: {screen.name}
                  </option>
                ))}
              </select>
              <input
                type="tel"
                placeholder="Contato (ex: (11) 99999-9999)"
                value={contactPhone}
                onChange={(e) => setContactPhone(formatPhone(e.target.value))}
                className="contact-input"
              />
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowContactModal(false)}>Cancelar</button>
              <button
                className="btn-primary"
                onClick={async () => {
                  const created = await saveContact();
                  if (created) setShowContactModal(false);
                }}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Editar/Adicionar Monitor no Sistema de Origem */}
      {showOriginEditModal && (
        <div className="modal-overlay" onClick={() => { setShowOriginEditModal(false); setOriginFormData(null); }}>
          <div className="modal-content modal-origin-edit" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{originFormData?.id ? 'Editar Monitor (Sistema Origem)' : 'Adicionar Monitor (Sistema Origem)'}</h2>
              <button className="modal-close" onClick={() => { setShowOriginEditModal(false); setOriginFormData(null); }}>×</button>
            </div>
            <div className="modal-body">
              {originFormLoading && !originFormData?.options ? (
                <p style={{ textAlign: 'center', padding: 20 }}>Carregando...</p>
              ) : originFormData ? (
                <div className="origin-form">
                  <div className="origin-form-row">
                    <label>Nome</label>
                    <input type="text" value={originFormData.nome} onChange={e => setOriginFormData({...originFormData, nome: e.target.value})} />
                  </div>
                  <div className="origin-form-row">
                    <label>Descrição</label>
                    <input type="text" value={originFormData.polegadas} onChange={e => setOriginFormData({...originFormData, polegadas: e.target.value})} />
                  </div>
                  <div className="origin-form-grid">
                    <div className="origin-form-row">
                      <label>Tipo de Tela</label>
                      <select value={originFormData.tipo_tela} onChange={e => setOriginFormData({...originFormData, tipo_tela: e.target.value})}>
                        {originFormData.options?.tipo_tela?.map(o => (
                          <option key={o.value} value={o.value}>{o.text}</option>
                        )) || <>
                          <option value="1">Elevador</option>
                          <option value="2">Painel Led</option>
                          <option value="3">Indoor</option>
                          <option value="4">Frontlight OOH</option>
                          <option value="5">Backlight OOH</option>
                        </>}
                      </select>
                    </div>
                    <div className="origin-form-row">
                      <label>Tipo de Player</label>
                      <select value={originFormData.player} onChange={e => setOriginFormData({...originFormData, player: e.target.value})}>
                        {originFormData.options?.player?.map(o => (
                          <option key={o.value} value={o.value}>{o.text}</option>
                        )) || <>
                          <option value="Android">Android</option>
                          <option value="Linux">Linux</option>
                          <option value="Windows">Windows</option>
                        </>}
                      </select>
                    </div>
                  </div>
                  <div className="origin-form-grid">
                    <div className="origin-form-row">
                      <label>Orientação</label>
                      <select value={originFormData.orientacao} onChange={e => setOriginFormData({...originFormData, orientacao: e.target.value})}>
                        {originFormData.options?.orientacao?.map(o => (
                          <option key={o.value} value={o.value}>{o.text}</option>
                        )) || <>
                          <option value="H,100,0">Horizontal</option>
                          <option value="V,100,0">Vertical</option>
                          <option value="I,100,0">Vertical (Invertida)</option>
                        </>}
                      </select>
                    </div>
                    <div className="origin-form-row">
                      <label>Barra</label>
                      <select value={originFormData.barra} onChange={e => setOriginFormData({...originFormData, barra: e.target.value})}>
                        {originFormData.options?.barra?.map(o => (
                          <option key={o.value} value={o.value}>{o.text}</option>
                        )) || <>
                          <option value="">Nenhuma</option>
                          <option value="1">Intermidia</option>
                        </>}
                      </select>
                    </div>
                  </div>
                  <div className="origin-form-row">
                    <label>Local (Vínculo)</label>
                    <select value={originFormData.vinculo} onChange={e => setOriginFormData({...originFormData, vinculo: e.target.value})}>
                      <option value="">-- Selecione o local --</option>
                      {originFormData.options?.vinculo?.map(o => (
                        <option key={o.value} value={o.value}>{o.text}</option>
                      ))}
                    </select>
                  </div>
                  <div className="origin-form-grid">
                    <div className="origin-form-row">
                      <label>Largura Player</label>
                      <input type="text" value={originFormData.player_width} onChange={e => setOriginFormData({...originFormData, player_width: e.target.value})} />
                    </div>
                    <div className="origin-form-row">
                      <label>Altura Player</label>
                      <input type="text" value={originFormData.player_height} onChange={e => setOriginFormData({...originFormData, player_height: e.target.value})} />
                    </div>
                    <div className="origin-form-row">
                      <label>Tempo de Ciclo (s)</label>
                      <input type="text" value={originFormData.tempo_ciclo} onChange={e => setOriginFormData({...originFormData, tempo_ciclo: e.target.value})} />
                    </div>
                  </div>
                  <div className="origin-form-row">
                    <label>Informações Técnicas</label>
                    <textarea rows={5} value={originFormData.informacoes} onChange={e => setOriginFormData({...originFormData, informacoes: e.target.value})} />
                  </div>
                </div>
              ) : null}
            </div>
            <div className="modal-footer">
              <button onClick={() => { setShowOriginEditModal(false); setOriginFormData(null); }} className="btn-secondary">Cancelar</button>
              <button onClick={saveOriginMonitor} className="btn-primary" disabled={originSaving || originFormLoading}>
                {originSaving ? 'Salvando...' : 'Salvar no Sistema'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== TICKET MODAL ===== */}
      {showTicketModal && (
        <div className="modal-overlay" onClick={() => setShowTicketModal(false)}>
          <div className="modal-content modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingTicket ? 'Editar Ticket' : 'Novo Ticket'}</h2>
              <button className="modal-close" onClick={() => setShowTicketModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group flex-2">
                  <label>Título</label>
                  <input type="text" value={ticketForm.title} onChange={(e) => setTicketForm(p => ({ ...p, title: e.target.value }))} placeholder="Descrição breve do problema" />
                </div>
                <div className="form-group">
                  <label>Prioridade</label>
                  <select value={ticketForm.priority} onChange={(e) => setTicketForm(p => ({ ...p, priority: e.target.value }))}>
                    <option value="low">Baixa</option>
                    <option value="medium">Média</option>
                    <option value="high">Alta</option>
                    <option value="critical">Crítica</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Categoria</label>
                  <select value={ticketForm.category} onChange={(e) => setTicketForm(p => ({ ...p, category: e.target.value }))}>
                    <option value="network">Rede</option>
                    <option value="hardware">Hardware</option>
                    <option value="software">Software</option>
                    <option value="power">Energia</option>
                    <option value="display">Display</option>
                    <option value="player">Player</option>
                    <option value="general">Geral</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Display</label>
                  <select value={ticketForm.screenId} onChange={(e) => setTicketForm(p => ({ ...p, screenId: e.target.value }))}>
                    <option value="">Nenhum</option>
                    {screens.map(s => <option key={s.id} value={s.id}>{s.name} - {s.location}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Atribuir a</label>
                  <select value={ticketForm.assignedTo} onChange={(e) => setTicketForm(p => ({ ...p, assignedTo: e.target.value }))}>
                    <option value="">Ninguém</option>
                    {usersList.map(u => <option key={u.id} value={u.username}>{u.username}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Descrição</label>
                <textarea rows="3" value={ticketForm.description} onChange={(e) => setTicketForm(p => ({ ...p, description: e.target.value }))} placeholder="Detalhes do problema..."></textarea>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Tempo gasto (min)</label>
                  <input type="number" min="0" value={ticketForm.timeSpentMinutes} onChange={(e) => setTicketForm(p => ({ ...p, timeSpentMinutes: e.target.value }))} placeholder="0" />
                </div>
                <div className="form-group">
                  <label>Custo total (R$)</label>
                  <input type="number" min="0" step="0.01" value={ticketForm.actualCost} onChange={(e) => setTicketForm(p => ({ ...p, actualCost: e.target.value }))} placeholder="Opcional" />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowTicketModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={saveTicket}>{editingTicket ? 'Salvar' : 'Criar Ticket'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== SCHEDULE MODAL ===== */}
      {showScheduleModal && (
        <div className="modal-overlay" onClick={() => setShowScheduleModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Novo Agendamento</h2>
              <button className="modal-close" onClick={() => setShowScheduleModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Título</label>
                <input type="text" value={scheduleForm.title} onChange={(e) => setScheduleForm(p => ({ ...p, title: e.target.value }))} placeholder="Ex: Manutenção preventiva" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Data</label>
                  <input type="date" value={scheduleForm.scheduledDate} onChange={(e) => setScheduleForm(p => ({ ...p, scheduledDate: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Horário</label>
                  <input type="time" value={scheduleForm.scheduledTime} onChange={(e) => setScheduleForm(p => ({ ...p, scheduledTime: e.target.value }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Display</label>
                  <select value={scheduleForm.screenId} onChange={(e) => setScheduleForm(p => ({ ...p, screenId: e.target.value }))}>
                    <option value="">Nenhum</option>
                    {screens.map(s => <option key={s.id} value={s.id}>{s.name} - {s.location}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Responsável</label>
                  <select value={scheduleForm.assignedTo} onChange={(e) => setScheduleForm(p => ({ ...p, assignedTo: e.target.value }))}>
                    <option value="">Ninguém</option>
                    {usersList.map(u => <option key={u.id} value={u.username}>{u.username}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Local</label>
                <input type="text" value={scheduleForm.location} onChange={(e) => setScheduleForm(p => ({ ...p, location: e.target.value }))} placeholder="Endereço ou local" />
              </div>
              <div className="form-group">
                <label>Cor</label>
                <input type="color" value={scheduleForm.color} onChange={(e) => setScheduleForm(p => ({ ...p, color: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Descrição</label>
                <textarea rows="2" value={scheduleForm.description} onChange={(e) => setScheduleForm(p => ({ ...p, description: e.target.value }))} placeholder="Notas adicionais..."></textarea>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowScheduleModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={saveSchedule}>Agendar</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== PART/INVENTORY MODAL ===== */}
      {showPartModal && (
        <div className="modal-overlay" onClick={() => setShowPartModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingPart ? 'Editar Peça' : 'Nova Peça'}</h2>
              <button className="modal-close" onClick={() => setShowPartModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Nome</label>
                <input type="text" value={partForm.name} onChange={(e) => setPartForm(p => ({ ...p, name: e.target.value }))} placeholder="Nome da peça" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Categoria</label>
                  <select value={partForm.category} onChange={(e) => setPartForm(p => ({ ...p, category: e.target.value }))}>
                    <option value="player">Player</option>
                    <option value="cable">Cabo</option>
                    <option value="display">Display</option>
                    <option value="power_supply">Fonte</option>
                    <option value="router">Router</option>
                    <option value="mount">Suporte</option>
                    <option value="other">Outro</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Quantidade</label>
                  <input type="number" min="0" value={partForm.quantity} onChange={(e) => setPartForm(p => ({ ...p, quantity: parseInt(e.target.value) || 0 }))} />
                </div>
                <div className="form-group">
                  <label>Qtd Mínima</label>
                  <input type="number" min="0" value={partForm.minQuantity} onChange={(e) => setPartForm(p => ({ ...p, minQuantity: parseInt(e.target.value) || 0 }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Localização</label>
                  <input type="text" value={partForm.location} onChange={(e) => setPartForm(p => ({ ...p, location: e.target.value }))} placeholder="Onde está armazenado" />
                </div>
                <div className="form-group">
                  <label>Custo Unitário (R$)</label>
                  <input type="number" step="0.01" min="0" value={partForm.unitCost} onChange={(e) => setPartForm(p => ({ ...p, unitCost: parseFloat(e.target.value) || '' }))} />
                </div>
              </div>
              <div className="form-group">
                <label>Notas</label>
                <textarea rows="2" value={partForm.notes} onChange={(e) => setPartForm(p => ({ ...p, notes: e.target.value }))} placeholder="Observações..."></textarea>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowPartModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={savePart}>{editingPart ? 'Salvar' : 'Adicionar'}</button>
            </div>
          </div>
        </div>
      )}

      {appAlert.open && (
        <div className="modal-overlay app-alert-overlay" onClick={closeAlert}>
          <div className="modal-content app-alert-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {appAlert.type === 'success' && 'Sucesso'}
                {appAlert.type === 'error' && 'Erro'}
                {appAlert.type === 'warning' && 'Atenção'}
                {appAlert.type === 'info' && 'Aviso'}
              </h2>
              <button className="modal-close" onClick={closeAlert}>×</button>
            </div>
            <div className="modal-body">
              <p className={`app-alert-message ${appAlert.type}`}>{appAlert.message}</p>
            </div>
            <div className="modal-footer">
              <button onClick={closeAlert} className={`btn-primary app-alert-btn ${appAlert.type}`}>OK</button>
            </div>
          </div>
        </div>
      )}

      {showAnalytics && (
        <Analytics onClose={() => setShowAnalytics(false)} />
      )}
    </div>
  );
}

export default App;
