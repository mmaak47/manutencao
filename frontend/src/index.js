import React from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import './index.css';
import App from './App';

axios.defaults.withCredentials = true;
axios.defaults.xsrfCookieName = 'csrf_token';
axios.defaults.xsrfHeaderName = 'X-CSRF-Token';

function getCookieValue(name) {
	const value = `; ${document.cookie}`;
	const parts = value.split(`; ${name}=`);
	if (parts.length === 2) {
		return decodeURIComponent(parts.pop().split(';').shift());
	}
	return '';
}

axios.interceptors.request.use((config) => {
	const method = String(config.method || 'get').toLowerCase();
	if (['post', 'put', 'patch', 'delete'].includes(method)) {
		const csrfToken = getCookieValue('csrf_token');
		if (csrfToken) {
			config.headers = config.headers || {};
			config.headers['X-CSRF-Token'] = csrfToken;
		}
	}
	return config;
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
