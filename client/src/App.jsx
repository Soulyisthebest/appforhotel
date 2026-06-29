import React, { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store'
import PMSLayout from './components/common/PMSLayout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import RoomsPage from './pages/RoomsPage'
import ReservationsPage from './pages/ReservationsPage'
import CheckInPage from './pages/CheckInPage'
import CheckOutPage from './pages/CheckOutPage'
import HousekeepingPage from './pages/HousekeepingPage'
import MaintenancePage from './pages/MaintenancePage'
import PaymentsPage from './pages/PaymentsPage'
import ChannelsPage from './pages/ChannelsPage'
import RatesPage from './pages/RatesPage'
import GuestsPage from './pages/GuestsPage'
import ReportsPage from './pages/ReportsPage'
import StaffPage from './pages/StaffPage'
import SettingsPage from './pages/SettingsPage'

const PrivateRoute = ({ children }) => {
  const { isAuthenticated } = useAuthStore()
  return isAuthenticated ? children : <Navigate to="/login" replace />
}

export default function App() {
  const { isAuthenticated } = useAuthStore()

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<PrivateRoute><PMSLayout /></PrivateRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="rooms" element={<RoomsPage />} />
        <Route path="reservations" element={<ReservationsPage />} />
        <Route path="checkin" element={<CheckInPage />} />
        <Route path="checkout" element={<CheckOutPage />} />
        <Route path="housekeeping" element={<HousekeepingPage />} />
        <Route path="maintenance" element={<MaintenancePage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="channels" element={<ChannelsPage />} />
        <Route path="rates" element={<RatesPage />} />
        <Route path="guests" element={<GuestsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
