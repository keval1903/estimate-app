import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Home() {
  const navigate = useNavigate()
  const [connOk, setConnOk] = useState(null)
  const [lowStockCount, setLowStockCount] = useState(0)

  useEffect(() => {
    supabase.from('products').select('id', { count: 'exact', head: true })
      .then(({ error }) => setConnOk(!error))

    // Fetch low stock items count
    supabase.from('products').select('stock, min_stock, has_stock')
      .eq('has_stock', true)
      .then(({ data }) => {
        if (data) {
          const count = data.filter(p => Number(p.stock || 0) < Number(p.min_stock ?? 5)).length
          setLowStockCount(count)
        }
      })
  }, [])

  return (
    <div className="app-container">
      <div className="top-nav">
        <span className="nav-title">📋 AB Estimate App</span>
        {connOk !== null && (
          <span className={`conn-status ${connOk ? 'conn-ok' : 'conn-err'}`}>
            {connOk ? '● Live' : '● Offline'}
          </span>
        )}
      </div>

      <div className="page">
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 4 }}>
            Welcome back
          </div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>What would you like to do?</div>
        </div>

        <button className="home-btn" onClick={() => navigate('/estimate/new')}>
          <div className="home-btn-icon" style={{ background: '#e8f5ec' }}>📝</div>
          <div>
            <div className="home-btn-text">CREATE NEW QUOTATION / ESTIMATE</div>
            <div className="home-btn-sub">Start a quote or direct bill for a site</div>
          </div>
        </button>

        <button className="home-btn" onClick={() => navigate('/products')}>
          <div className="home-btn-icon" style={{ background: '#dbeafe' }}>📦</div>
          <div>
            <div className="home-btn-text">PRODUCT MASTER</div>
            <div className="home-btn-sub">Add, edit or update product rates & stock</div>
          </div>
        </button>

        <button className="home-btn" onClick={() => navigate('/stock-report?tab=reorder')}>
          <div className="home-btn-icon" style={{ background: '#fee2e2' }}>⚠️</div>
          <div>
            <div className="home-btn-text">
              LOW STOCK ALERTS {lowStockCount > 0 ? `(${lowStockCount})` : ''}
            </div>
            <div className="home-btn-sub">
              {lowStockCount > 0 ? `${lowStockCount} items below minimum stock level` : 'View items below minimum stock level'}
            </div>
          </div>
        </button>

        <button className="home-btn" onClick={() => navigate('/estimates?tab=quotations')}>
          <div className="home-btn-icon" style={{ background: '#fce7f3' }}>📜</div>
          <div>
            <div className="home-btn-text">PREVIOUS QUOTATIONS</div>
            <div className="home-btn-sub">View quotes or convert them to estimates</div>
          </div>
        </button>

        <button className="home-btn" onClick={() => navigate('/estimates?tab=estimates')}>
          <div className="home-btn-icon" style={{ background: '#fef3c7' }}>🗂️</div>
          <div>
            <div className="home-btn-text">PREVIOUS ESTIMATES</div>
            <div className="home-btn-sub">View, edit or reprint old bills</div>
          </div>
        </button>

        <button className="home-btn" onClick={() => navigate('/stock-report')}>
          <div className="home-btn-icon" style={{ background: '#ecfdf5' }}>📊</div>
          <div>
            <div className="home-btn-text">STOCK MOVEMENT REPORT</div>
            <div className="home-btn-sub">View pieces added, sold & stock audit log</div>
          </div>
        </button>
      </div>
    </div>
  )
}
