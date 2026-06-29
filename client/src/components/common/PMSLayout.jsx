import React, { useEffect, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore, usePMSStore } from '../../store'
import { dashboardService, notificationsService } from '../../services/api'
import toast from 'react-hot-toast'

const navItems = [
  { section: 'Recepción', items: [
    { path: '/', label: 'Dashboard', icon: 'ti-layout-dashboard' },
    { path: '/rooms', label: 'Habitaciones', icon: 'ti-bed' },
    { path: '/checkin', label: 'Check-In', icon: 'ti-login', badge: 'arrivals' },
    { path: '/checkout', label: 'Check-Out', icon: 'ti-logout', badge: 'departures', badgeUrgent: true },
    { path: '/reservations', label: 'Reservas', icon: 'ti-calendar' },
  ]},
  { section: 'Operaciones', items: [
    { path: '/housekeeping', label: 'Gobernanta', icon: 'ti-wash-machine' },
    { path: '/maintenance', label: 'Mantenimiento', icon: 'ti-tool' },
    { path: '/guests', label: 'Huéspedes', icon: 'ti-users' },
  ]},
  { section: 'Ingresos', items: [
    { path: '/payments', label: 'Pagos', icon: 'ti-credit-card' },
    { path: '/channels', label: 'Channel Manager', icon: 'ti-world' },
    { path: '/rates', label: 'Tarifas', icon: 'ti-coin' },
    { path: '/reports', label: 'Informes', icon: 'ti-chart-bar' },
  ]},
  { section: 'Administración', items: [
    { path: '/staff', label: 'Personal', icon: 'ti-user-circle' },
    { path: '/settings', label: 'Configuración', icon: 'ti-settings' },
  ]}
]

export default function PMSLayout() {
  const { staff, hotel, logout } = useAuthStore()
  const { dashboardData, setDashboard, notifications, setNotifications, unreadCount } = usePMSStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [clock, setClock] = useState('')
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    loadDashboard()
    loadNotifications()
    const interval = setInterval(() => {
      const now = new Date()
      setClock(now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const loadDashboard = async () => {
    try {
      const data = await dashboardService.get()
      setDashboard(data)
    } catch {}
  }

  const loadNotifications = async () => {
    try {
      const data = await notificationsService.list()
      setNotifications(data)
    } catch {}
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
    toast.success('Sesión cerrada')
  }

  const isActive = (path) => path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#1a2640' }}>

      {/* TOP MENU BAR */}
      <div style={{ background: '#243352', height: '36px', display: 'flex', alignItems: 'center', borderBottom: '1px solid #2d3f63', flexShrink: 0 }}>
        <div style={{ padding: '0 14px', fontSize: '13px', fontWeight: 500, color: '#d4a843', borderRight: '1px solid #2d3f63', height: '100%', display: 'flex', alignItems: 'center', gap: '6px', letterSpacing: '.5px' }}>
          <i className="ti ti-building-hotel" /> HotelOS PMS
          <span style={{ fontSize: '10px', color: '#8892a0', marginLeft: '4px' }}>v1.0</span>
        </div>
        <div style={{ display: 'flex', height: '100%' }}>
          {[
            { path: '/', label: 'Inicio', icon: 'ti-home' },
            { path: '/rooms', label: 'Habitaciones', icon: 'ti-bed' },
            { path: '/reservations', label: 'Reservas', icon: 'ti-calendar' },
            { path: '/checkin', label: 'Check-In', icon: 'ti-login' },
            { path: '/checkout', label: 'Check-Out', icon: 'ti-logout' },
            { path: '/housekeeping', label: 'Pisos', icon: 'ti-wash-machine' },
            { path: '/maintenance', label: 'Mant.', icon: 'ti-tool' },
            { path: '/reports', label: 'Informes', icon: 'ti-chart-bar' },
          ].map(item => (
            <button key={item.path} onClick={() => navigate(item.path)}
              style={{ padding: '0 12px', color: isActive(item.path) ? '#fff' : '#b0b8c8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', border: 'none', borderRight: '1px solid rgba(255,255,255,.05)', background: isActive(item.path) ? '#2d3f63' : 'transparent', transition: 'background .15s' }}>
              <i className={`ti ${item.icon}`} /> {item.label}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', height: '100%' }}>
          <div style={{ padding: '0 12px', color: '#b0b8c8', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', borderLeft: '1px solid rgba(255,255,255,.05)', position: 'relative', cursor: 'pointer' }} onClick={() => navigate('/')}>
            <i className="ti ti-bell" />
            {unreadCount > 0 && <span style={{ background: '#c0392b', color: '#fff', borderRadius: '8px', padding: '1px 5px', fontSize: '9px', position: 'absolute', top: '6px', right: '4px' }}>{unreadCount}</span>}
          </div>
          <button onClick={handleLogout} style={{ padding: '0 12px', color: '#b0b8c8', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', border: 'none', borderLeft: '1px solid rgba(255,255,255,.05)', background: 'transparent', cursor: 'pointer' }}>
            <i className="ti ti-user-circle" /> {staff?.first_name}
          </button>
        </div>
      </div>

      {/* STATS BAR */}
      {dashboardData && (
        <div style={{ background: '#243352', display: 'flex', borderBottom: '1px solid #2d3f63', flexShrink: 0 }}>
          {[
            { num: dashboardData.rooms?.occupied || 0, label: 'Ocupadas', sub: `${dashboardData.occupancy_pct}%`, color: '#4a9fd4' },
            { num: dashboardData.rooms?.vacant || 0, label: 'Libres', sub: 'disponibles', color: '#2d8a4e' },
            { num: dashboardData.departures || 0, label: 'Check-Out Hoy', sub: 'pendientes', color: '#c0392b' },
            { num: dashboardData.arrivals || 0, label: 'Check-In Hoy', sub: 'esperados', color: '#3a7fb5' },
            { num: dashboardData.maintenance_open || 0, label: 'Mantenimiento', sub: 'abiertos', color: '#d4a843' },
            { num: `${dashboardData.adr}€`, label: 'ADR', sub: 'tarifa media', color: '#fff' },
            { num: `${dashboardData.revpar}€`, label: 'RevPAR', sub: 'por hab.', color: '#fff' },
          ].map((s, i) => (
            <div key={i} style={{ flex: 1, padding: '6px 10px', borderRight: '1px solid #2d3f63', textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 500, color: s.color }}>{s.num}</div>
              <div style={{ fontSize: '9.5px', color: '#8892a0', textTransform: 'uppercase', letterSpacing: '.5px' }}>{s.label}</div>
              <div style={{ fontSize: '9.5px', color: '#4a9fd4' }}>{s.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* MAIN */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* SIDEBAR */}
        <div style={{ width: '200px', background: '#243352', borderRight: '1px solid #2d3f63', flexShrink: 0, overflowY: 'auto' }}>
          {navItems.map(section => (
            <div key={section.section} style={{ padding: '5px 0' }}>
              <div style={{ padding: '4px 12px', fontSize: '9.5px', fontWeight: 500, color: '#8892a0', textTransform: 'uppercase', letterSpacing: '.8px' }}>{section.section}</div>
              {section.items.map(item => (
                <button key={item.path} onClick={() => navigate(item.path)}
                  style={{ width: '100%', padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: isActive(item.path) ? '#4a9fd4' : '#a8b4c4', fontSize: '11.5px', border: 'none', borderLeft: isActive(item.path) ? '2px solid #4a9fd4' : '2px solid transparent', background: isActive(item.path) ? 'rgba(74,159,212,.15)' : 'transparent', transition: 'background .12s', textAlign: 'left' }}>
                  <i className={`ti ${item.icon}`} style={{ fontSize: '14px', width: '16px' }} />
                  {item.label}
                  {item.badge === 'arrivals' && dashboardData?.arrivals > 0 && (
                    <span style={{ marginLeft: 'auto', background: '#3a7fb5', color: '#fff', borderRadius: '10px', padding: '1px 6px', fontSize: '9px' }}>{dashboardData.arrivals}</span>
                  )}
                  {item.badge === 'departures' && dashboardData?.departures > 0 && (
                    <span style={{ marginLeft: 'auto', background: '#c0392b', color: '#fff', borderRadius: '10px', padding: '1px 6px', fontSize: '9px' }}>{dashboardData.departures}</span>
                  )}
                </button>
              ))}
              <div style={{ height: '1px', background: '#2d3f63', margin: '3px 0' }} />
            </div>
          ))}
        </div>

        {/* PAGE CONTENT */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f0f2f5' }}>
          <Outlet />
        </div>
      </div>

      {/* STATUS BAR */}
      <div style={{ background: '#2d3f63', height: '24px', display: 'flex', alignItems: 'center', padding: '0 12px', gap: '16px', fontSize: '10.5px', color: '#8892a0', flexShrink: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#2d8a4e', display: 'inline-block' }} /> Sistema operativo</span>
        <span><i className="ti ti-wifi" style={{ fontSize: '12px' }} /> Online</span>
        <span><i className="ti ti-clock" style={{ fontSize: '12px' }} /> {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} — {clock}</span>
        <span><i className="ti ti-user" style={{ fontSize: '12px' }} /> {staff?.first_name} {staff?.last_name} · {staff?.role}</span>
        <span style={{ marginLeft: 'auto' }}><i className="ti ti-building" style={{ fontSize: '12px' }} /> {hotel?.name}</span>
      </div>
    </div>
  )
}
