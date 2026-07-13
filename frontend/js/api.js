const Auth = {
  getToken() { return localStorage.getItem('lf_token'); },
  getUser() {
    const raw = localStorage.getItem('lf_user');
    return raw ? JSON.parse(raw) : null;
  },
  setSession(token, user) {
    localStorage.setItem('lf_token', token);
    localStorage.setItem('lf_user', JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem('lf_token');
    localStorage.removeItem('lf_user');
  },
  isAdmin() {
    const u = this.getUser();
    return !!u && u.role === 'super_admin';
  },
  requireAuth() {
    if (!this.getToken()) window.location.href = 'index.html';
  },
};

const Api = {
  async _request(path, { method = 'GET', body = null, form = false } = {}) {
    const headers = {};
    const token = Auth.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let payload = undefined;
    if (body !== null) {
      if (form) {
        payload = body; // URLSearchParams
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      } else {
        payload = JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
      }
    }

    const res = await fetch(`${window.API_BASE_URL}${path}`, { method, headers, body: payload });

    if (res.status === 401) {
      Auth.clear();
      window.location.href = 'index.html';
      throw new Error('Session expired. Please sign in again.');
    }

    if (!res.ok) {
      let detail = `Request failed (${res.status})`;
      try {
        const errBody = await res.json();
        if (errBody.detail) detail = typeof errBody.detail === 'string' ? errBody.detail : JSON.stringify(errBody.detail);
      } catch (_) {}
      throw new Error(detail);
    }

    if (res.status === 204) return null;
    return res.json();
  },

  login(email, password) {
    const form = new URLSearchParams();
    form.set('username', email);
    form.set('password', password);
    return this._request('/auth/login', { method: 'POST', body: form, form: true });
  },
  me() { return this._request('/auth/me'); },

  // Leads
  listLeads(params = {}) {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return this._request(`/leads${suffix}`);
  },
  getLead(id) { return this._request(`/leads/${id}`); },
  createLead(data) { return this._request('/leads', { method: 'POST', body: data }); },
  updateLead(id, data) { return this._request(`/leads/${id}`, { method: 'PATCH', body: data }); },
  deleteLead(id) { return this._request(`/leads/${id}`, { method: 'DELETE' }); },

  // Follow-ups
  listFollowups(params = {}) {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return this._request(`/followups${suffix}`);
  },
  getLeadFollowups(leadId) { return this._request(`/followups?lead_id=${leadId}`); },
  createFollowup(data) { return this._request('/followups', { method: 'POST', body: data }); },
  updateFollowup(id, data) { return this._request(`/followups/${id}`, { method: 'PATCH', body: data }); },
  deleteFollowup(id) { return this._request(`/followups/${id}`, { method: 'DELETE' }); },

  // Activities
  listActivities(params = {}) {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return this._request(`/activities${suffix}`);
  },
  getLeadActivities(leadId) { return this._request(`/activities?lead_id=${leadId}&limit=50`); },

  // Users
  listUsers() { return this._request('/users'); },
  createUser(data) { return this._request('/users', { method: 'POST', body: data }); },
  updateUser(id, data) { return this._request(`/users/${id}`, { method: 'PATCH', body: data }); },
  deleteUser(id) { return this._request(`/users/${id}`, { method: 'DELETE' }); },

  // Dashboards
  adminDashboard() { return this._request('/dashboard/admin'); },
  myDashboard() { return this._request('/dashboard/me'); },
  analyticsDashboard(params = {}) {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return this._request(`/dashboard/analytics${suffix}`);
  },

  // Leads extras
  getLeadLocations() { return this._request('/leads/locations'); },
};
