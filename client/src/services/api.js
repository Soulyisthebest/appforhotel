import axios from 'axios'
import toast from 'react-hot-toast'


const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
})

// Request interceptor — attach token
api.interceptors.request.use(config => {
  const token = localStorage.getItem('pms_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Response interceptor — handle errors globally
api.interceptors.response.use(
  res => res.data,
  err => {
    const msg = err.response?.data?.error || err.message || 'Error de conexión'
    if (err.response?.status === 401) {
      localStorage.removeItem('pms_token')
      window.location.href = '/login'
      return Promise.reject(err)
    }
    if (err.response?.status !== 404) toast.error(msg)
    return Promise.reject(err)
  }
)

// ── Services ────────────────────────────────────────────────

export const authService = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  pinLogin: (pin_code, hotel_id) => api.post('/auth/pin-login', { pin_code, hotel_id }),
  me: () => api.get('/auth/me'),
  refresh: () => api.post('/auth/refresh')
}

export const dashboardService = {
  get: () => api.get('/dashboard')
}

export const roomsService = {
  list: (params) => api.get('/rooms', { params }),
  rack: () => api.get('/rooms/rack'),
  availability: (params) => api.get('/rooms/availability', { params }),
  get: (id) => api.get(`/rooms/${id}`),
  create: (data) => api.post('/rooms', data),
  update: (id, data) => api.put(`/rooms/${id}`, data),
  updateStatus: (id, data) => api.patch(`/rooms/${id}/status`, data)
}

export const reservationsService = {
  list: (params) => api.get('/reservations', { params }),
  today: () => api.get('/reservations/today'),
  get: (id) => api.get(`/reservations/${id}`),
  create: (data) => api.post('/reservations', data),
  update: (id, data) => api.put(`/reservations/${id}`, data),
  cancel: (id, reason) => api.delete(`/reservations/${id}`, { data: { reason } })
}

export const checkinService = {
  pending: () => api.get('/checkin/pending'),
  scanPassport: (data) => api.post('/checkin/scan-passport', data),
  complete: (id, data) => api.post(`/checkin/${id}`, data)
}

export const checkoutService = {
  pending: () => api.get('/checkout/pending'),
  complete: (id, data) => api.post(`/checkout/${id}`, data)
}

export const guestsService = {
  list: (params) => api.get('/guests', { params }),
  get: (id) => api.get(`/guests/${id}`),
  create: (data) => api.post('/guests', data),
  update: (id, data) => api.put(`/guests/${id}`, data)
}

export const foliosService = {
  get: (id) => api.get(`/folios/${id}`),
  addCharge: (id, data) => api.post(`/folios/${id}/charge`, data),
  voidCharge: (folioId, chargeId) => api.delete(`/folios/${folioId}/charge/${chargeId}`)
}

export const paymentsService = {
  list: (params) => api.get('/payments', { params }),
  create: (data) => api.post('/payments', data),
  refund: (id, data) => api.post(`/payments/${id}/refund`, data)
}

export const housekeepingService = {
  list: (params) => api.get('/housekeeping', { params }),
  roomStatus: () => api.get('/housekeeping/room-status'),
  assign: (data) => api.post('/housekeeping/assign', data),
  updateStatus: (id, data) => api.patch(`/housekeeping/${id}/status`, data)
}

export const maintenanceService = {
  list: (params) => api.get('/maintenance', { params }),
  create: (data) => api.post('/maintenance', data),
  updateStatus: (id, data) => api.patch(`/maintenance/${id}/status`, data),
  addComment: (id, data) => api.post(`/maintenance/${id}/comment`, data)
}

export const channelsService = {
  list: () => api.get('/channels'),
  create: (data) => api.post('/channels', data),
  update: (id, data) => api.put(`/channels/${id}`, data),
  sync: (id) => api.post(`/channels/${id}/sync`),
  log: () => api.get('/channels/log')
}

export const ratesService = {
  list: (params) => api.get('/rates', { params }),
  bulkUpdate: (rates) => api.post('/rates/bulk', { rates }),
  roomTypes: () => api.get('/rates/room-types'),
  plans: () => api.get('/rates/plans')
}

export const reportsService = {
  occupancy: (params) => api.get('/reports/occupancy', { params }),
  revenue: (params) => api.get('/reports/revenue', { params })
}

export const staffService = {
  list: (params) => api.get('/staff', { params }),
  create: (data) => api.post('/staff', data),
  update: (id, data) => api.put(`/staff/${id}`, data)
}

export const notificationsService = {
  list: () => api.get('/notifications'),
  markRead: (id) => api.patch(`/notifications/${id}/read`)
}

export const hotelsService = {
  me: () => api.get('/hotels/me'),
  update: (data) => api.put('/hotels/me', data)
}

export default api
