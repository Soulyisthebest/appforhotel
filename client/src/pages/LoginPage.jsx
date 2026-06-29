import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store'
import { authService } from '../services/api'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [mode, setMode] = useState('email') // email | pin
  const [loading, setLoading] = useState(false)
  const { login } = useAuthStore()
  const navigate = useNavigate()

  const HOTEL_ID = import.meta.env.VITE_HOTEL_ID || '00000000-0000-0000-0000-000000000001'

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      let data
      if (mode === 'email') {
        data = await authService.login(email, password)
      } else {
        data = await authService.pinLogin(pin, HOTEL_ID)
      }
      login(data.token, data.staff, data.hotel)
      toast.success(`Bienvenido, ${data.staff.first_name}`)
      navigate('/')
    } catch (err) {
      toast.error('Credenciales incorrectas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ height: '100vh', background: '#1a2640', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '380px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '32px', color: '#d4a843', marginBottom: '8px' }}>
            <i className="ti ti-building-hotel" />
          </div>
          <h1 style={{ color: '#fff', fontSize: '22px', fontWeight: 500, letterSpacing: '.5px' }}>HotelOS PMS</h1>
          <p style={{ color: '#8892a0', fontSize: '12px', marginTop: '4px' }}>Sistema de Gestión Hotelera</p>
        </div>

        {/* Card */}
        <div style={{ background: '#243352', borderRadius: '6px', padding: '28px', border: '1px solid #2d3f63' }}>
          {/* Mode toggle */}
          <div style={{ display: 'flex', marginBottom: '20px', borderRadius: '4px', overflow: 'hidden', border: '1px solid #2d3f63' }}>
            <button onClick={() => setMode('email')} style={{ flex: 1, padding: '7px', border: 'none', cursor: 'pointer', fontSize: '11.5px', background: mode === 'email' ? '#4a9fd4' : 'transparent', color: mode === 'email' ? '#fff' : '#8892a0', transition: 'all .15s' }}>
              <i className="ti ti-mail" /> Email
            </button>
            <button onClick={() => setMode('pin')} style={{ flex: 1, padding: '7px', border: 'none', cursor: 'pointer', fontSize: '11.5px', background: mode === 'pin' ? '#4a9fd4' : 'transparent', color: mode === 'pin' ? '#fff' : '#8892a0', transition: 'all .15s' }}>
              <i className="ti ti-keypad" /> PIN
            </button>
          </div>

          <form onSubmit={handleLogin}>
            {mode === 'email' ? (
              <>
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#8892a0', marginBottom: '4px', fontWeight: 500 }}>Email</label>
                  <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="usuario@hotel.com" required
                    style={{ width: '100%', background: '#1a2640', border: '1px solid #2d3f63', borderRadius: '3px', padding: '8px 10px', color: '#fff', fontSize: '12px', outline: 'none', fontFamily: 'inherit' }} />
                </div>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#8892a0', marginBottom: '4px', fontWeight: 500 }}>Contraseña</label>
                  <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="••••••••" required
                    style={{ width: '100%', background: '#1a2640', border: '1px solid #2d3f63', borderRadius: '3px', padding: '8px 10px', color: '#fff', fontSize: '12px', outline: 'none', fontFamily: 'inherit' }} />
                </div>
              </>
            ) : (
              <div style={{ marginBottom: '20px', textAlign: 'center' }}>
                <label style={{ display: 'block', fontSize: '11px', color: '#8892a0', marginBottom: '12px', fontWeight: 500 }}>Código PIN</label>
                <input value={pin} onChange={e => setPin(e.target.value)} type="password" placeholder="PIN" maxLength={6} required
                  style={{ width: '140px', background: '#1a2640', border: '1px solid #2d3f63', borderRadius: '3px', padding: '12px', color: '#fff', fontSize: '22px', outline: 'none', fontFamily: 'inherit', textAlign: 'center', letterSpacing: '8px' }} />
              </div>
            )}

            <button type="submit" disabled={loading}
              style={{ width: '100%', padding: '9px', background: loading ? '#2d3f63' : '#4a9fd4', color: '#fff', border: 'none', borderRadius: '3px', fontSize: '12px', fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontFamily: 'inherit', transition: 'background .15s' }}>
              {loading ? <><i className="ti ti-loader" /> Accediendo...</> : <><i className="ti ti-login" /> Iniciar sesión</>}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', color: '#4a4f5c', fontSize: '10.5px', marginTop: '16px' }}>
          HotelOS PMS © 2026 — Todos los derechos reservados
        </p>
      </div>
    </div>
  )
}
