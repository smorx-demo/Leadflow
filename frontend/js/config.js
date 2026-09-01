const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
window.API_BASE_URL = isLocal
  ? 'http://localhost:8000/api'
  : 'https://leadflow-zrjc.onrender.com/api';
