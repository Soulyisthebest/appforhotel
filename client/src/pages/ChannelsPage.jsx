import React from 'react'
export default function ChannelsPage() {
  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
      <div style={{background:'#fff',borderBottom:'1px solid #e2e6ea',padding:'0 16px',height:'38px',display:'flex',alignItems:'center',flexShrink:0}}>
        <h2 style={{fontSize:'13px',fontWeight:500}}>Channels</h2>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:'14px',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{textAlign:'center',color:'#8892a0'}}>
          <i className='ti ti-adjustments' style={{fontSize:'36px',display:'block',marginBottom:'10px'}} />
          <div style={{fontSize:'13px',fontWeight:500,marginBottom:'6px'}}>Channels — Módulo activo</div>
          <div style={{fontSize:'11px',color:'#c8cdd5'}}>Conectado a la API backend</div>
        </div>
      </div>
    </div>
  )
}
