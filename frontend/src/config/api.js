const rawApiUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const API_BASE_URL = rawApiUrl.replace(/\/$/, '').endsWith('/api')
  ? rawApiUrl.replace(/\/api\/?$/, '')
  : rawApiUrl.replace(/\/$/, '');

export const API_ROOT_URL = `${API_BASE_URL}/api`;
