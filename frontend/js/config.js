// Point this at your deployed backend. For local development against
// `uvicorn app.main:app --reload` this default is correct.
window.API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:8000/api'
  : 'https://YOUR-BACKEND-URL.onrender.com/api'; // <-- replace after deploying the backend
