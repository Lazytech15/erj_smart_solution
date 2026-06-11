import axios from 'axios';
import { encryptPayload, decryptPayload } from '../utils/crypto';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — encrypt payload
api.interceptors.request.use(async (config) => {
  const token = localStorage.getItem('attms_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;

  if (config.data && import.meta.env.VITE_ENCRYPT_PAYLOADS === 'true') {
    config.data = await encryptPayload(config.data);
  }
  return config;
}, (error) => Promise.reject(error));

// Response interceptor — decrypt payload
api.interceptors.response.use(async (response) => {
  if (response.data?.encrypted) {
    response.data = await decryptPayload(response.data);
  }
  return response;
}, (error) => {
  const msg = error.response?.data?.message || error.message || 'An error occurred';
  return Promise.reject(new Error(msg));
});

export default api;