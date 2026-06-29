import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { dashboardService, reservationsService } from '../services/api'
import { usePMSStore } from '../store'

export default function DashboardPage() {
  const navigate = useNavigate()
  const { dashboardData, setDashboard } = usePMSStore()
  const [today, setToday] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([dashboardService.get(), reservationsService.today()]).then(([dash, t]) => {
      setDashboard(dash); setToday(t); setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const today_str = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e6ea', padding: '0 16px', height: '38px', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <h2 style={{ fontSize: '13px', fontWeight: 500 }}>Dashboard — {today_str}</h2>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          <button className="btn btn-secondary" onClick={() => window.print()}><i className="ti ti-printer" /> Imprimir</button>
          <button className="btn btn-primary" onClick={() => navigate('/reservations')}><i className="ti ti-plus" /> Nueva Reserva</button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
        {loading ? <div style={{ textAlign: 'center', padding: '40px', color: '#8892a0' }}>Cargando dashboard...</div> : (
          <>
            {/* KPI cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '14px' }}>
              {[
                { label: 'Ocupación', value: `${dashboardData?.occupancy_pct || 0}%`, sub: `${dashboardData?.rooms?.occupied || 0} de ${(dashboardData?.rooms?.occupied||0)+(dashboardData?.rooms?.vacant||0)} hab.`, trend: '↑ +4.2%', color: '#4a9fd4' },
                { label: 'Ingresos hoy', value: `${dashboardData?.today_revenue || 0}€`, sub: 'cobrado hoy', trend: '↑ Actualizado', color: '#2d8a4e' },
                { label: 'ADR', value: `${dashboardData?.adr || 0}€`, sub: 'tarifa media diaria', trend: 'RevPAR: ' + (dashboardData?.revpar||0) + '€', color: '#d4a843' },
                { label: 'Incidencias', value: dashboardData?.maintenance_open || 0, sub: 'tickets abiertos', trend: dashboardData?.maintenance_urgent > 0 ? `⚠️ ${dashboardData.maintenance_urgent} urgentes` : '✓ Sin urgentes', color: dashboardData?.maintenance_urgent > 0 ? '#c0392b' : '#2d8a4e' },
              ].map((k, i) => (
                <div key={i} className="pms-card" style={{ padding: '14px' }}>
                  <div style={{ fontSize: '10px', color: '#8892a0', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '8px' }}>{k.label}</div>
                  <div style={{ fontSize: '28px', fontWeight: 500, color: '#1a2035' }}>{k.value}</div>
                  <div style={{ fontSize: '10.5px', color: '#8892a0', marginTop: '2px' }}>{k.sub}</div>
                  <div style={{ fontSize: '10.5px', color: k.color, marginTop: '4px' }}>{k.trend}</div>
                </div>
              ))}
            </div>

            {/* Arrivals & Departures */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div className="pms-card">
                <div className="pms-card-head"><i className="ti ti-login" style={{ color: '#4a9fd4' }} /><h3>Llegadas hoy</h3><span style={{ marginLeft: 'auto', background: '#3a7fb5', color: '#fff', borderRadius: '10px', padding: '1px 8px', fontSize: '10px' }}>{today?.arrivals?.length || 0}</span></div>
                <div style={{ overflowY: 'auto', maxHeight: '200px' }}>
                  <table className="pms-table">
                    <thead><tr><th>Hora</th><th>Huésped</th><th>Hab.</th><th>Estado</th><th></th></tr></thead>
                    <tbody>
                      {(today?.arrivals || []).map(r => (
                        <tr key={r.id}>
                          <td>{r.estimated_arrival || '—'}</td>
                          <td>{r.guests?.last_name}, {r.guests?.first_name}</td>
                          <td>{r.rooms?.room_number || '—'}</td>
                          <td><span className="badge badge-confirmed">Confirmada</span></td>
                          <td><button className="btn btn-success btn-sm" onClick={() => navigate('/checkin')}><i className="ti ti-login" /> CI</button></td>
                        </tr>
                      ))}
                      {(!today?.arrivals?.length) && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#8892a0', padding: '16px' }}>Sin llegadas pendientes</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="pms-card">
                <div className="pms-card-head"><i className="ti ti-logout" style={{ color: '#c0392b' }} /><h3>Salidas hoy</h3><span style={{ marginLeft: 'auto', background: '#c0392b', color: '#fff', borderRadius: '10px', padding: '1px 8px', fontSize: '10px' }}>{today?.departures?.length || 0}</span></div>
                <div style={{ overflowY: 'auto', maxHeight: '200px' }}>
                  <table className="pms-table">
                    <thead><tr><th>Hab.</th><th>Huésped</th><th>Importe</th><th>Saldo</th><th></th></tr></thead>
                    <tbody>
                      {(today?.departures || []).map(r => (
                        <tr key={r.id}>
                          <td>{r.rooms?.room_number}</td>
                          <td>{r.guests?.last_name}, {r.guests?.first_name}</td>
                          <td>{r.total_amount}€</td>
                          <td style={{ color: (r.folios?.[0]?.balance || 0) > 0 ? '#c0392b' : '#2d8a4e' }}>{r.folios?.[0]?.balance || 0}€</td>
                          <td><button className="btn btn-danger btn-sm" onClick={() => navigate('/checkout')}><i className="ti ti-logout" /> CO</button></td>
                        </tr>
                      ))}
                      {(!today?.departures?.length) && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#8892a0', padding: '16px' }}>Sin salidas pendientes</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
