
import axios from 'axios';

const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
const isLocalNetworkHost =
  hostname === 'localhost' ||
  hostname === '127.0.0.1' ||
  /^10\./.test(hostname) ||
  /^192\.168\./.test(hostname) ||
  /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
const developmentApiBase =
  import.meta.env.DEV && isLocalNetworkHost
    ? `${window.location.protocol}//${hostname}:5000/api/v1`
    : null;

export const api = axios.create({
  baseURL:
    developmentApiBase ||
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_API_URL ||
    'http://10.1.1.223:5000/api/v1',

  withCredentials: true,

  headers: {
    'Content-Type': 'application/json',
  },
});
