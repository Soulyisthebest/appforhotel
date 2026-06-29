import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(persist(
  (set, get) => ({
    token: null,
    staff: null,
    hotel: null,
    isAuthenticated: false,

    login: (token, staff, hotel) => {
      localStorage.setItem('pms_token', token)
      set({ token, staff, hotel, isAuthenticated: true })
    },

    logout: () => {
      localStorage.removeItem('pms_token')
      set({ token: null, staff: null, hotel: null, isAuthenticated: false })
    },

    updateHotel: (hotel) => set({ hotel }),
    updateStaff: (staff) => set({ staff })
  }),
  { name: 'pms-auth', partialize: s => ({ token: s.token, staff: s.staff, hotel: s.hotel, isAuthenticated: s.isAuthenticated }) }
))

export const usePMSStore = create((set, get) => ({
  // Dashboard
  dashboardData: null,
  setDashboard: (data) => set({ dashboardData: data }),

  // Selected items
  selectedRoom: null,
  setSelectedRoom: (room) => set({ selectedRoom: room }),

  selectedReservation: null,
  setSelectedReservation: (res) => set({ selectedReservation: res }),

  // Notifications
  notifications: [],
  unreadCount: 0,
  setNotifications: (notifications) => set({
    notifications,
    unreadCount: notifications.filter(n => !n.read).length
  }),

  // Current view
  currentView: 'dashboard',
  setView: (view) => set({ currentView: view }),

  // Modal
  modal: null,
  modalData: null,
  openModal: (modal, data = null) => set({ modal, modalData: data }),
  closeModal: () => set({ modal: null, modalData: null }),

  // Rooms rack
  rooms: [],
  setRooms: (rooms) => set({ rooms }),

  // Today stats
  todayArrivals: 0,
  todayDepartures: 0,
  setTodayStats: (arrivals, departures) => set({ todayArrivals: arrivals, todayDepartures: departures })
}))
