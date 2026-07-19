import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../hooks/useToast.jsx'

export default function EstimateList() {
  const navigate = useNavigate()
  const { showToast, ToastEl } = useToast()
  const [estimates, setEstimates] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const fetchEstimates = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('estimates')
      .select('*')
      .order('bill_number', { ascending: false })

    if (search.trim()) {
      const s = search.trim()
      // search by bill number or site name
      if (!isNaN(s)) {
        query = query.eq('bill_number', parseInt(s))
      } else {
        query = query.ilike('site_name', `%${s}%`)
      }
    }

    const { data, error } = await query
    if (error) showToast('Failed to load estimates', 'error')
    else setEstimates(data || [])
    setLoading(false)
  }, [search])

  useEffect(() => {
    const t = setTimeout(fetchEstimates, 300)
    return () => clearTimeout(t)
  }, [fetchEstimates])

  async function handleDelete(est) {
    setDeleting(true)
    // items cascade-delete via FK
    const { error } = await supabase.from('estimates').delete().eq('id', est.id)
    if (error) showToast('Delete failed: ' + error.message, 'error')
    else {
      showToast(`Bill #${est.bill_number} deleted`)
      fetchEstimates()
    }
    setDeleteConfirm(null)
    setDeleting(false)
  }

  function formatTotal(val) {
    return Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2 })
  }

  return (
    <div className="app-container">
      <div className="top-nav">
        <button className="nav-back" onClick={() => navigate('/')}>←</button>
        <span className="nav-title">Previous Estimates</span>
      </div>

      <div className="page">
        {/* Search */}
        <div className="search-bar">
          <span>🔍</span>
          <input
            placeholder="Search by bill number or site name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="btn btn-ghost btn-sm" onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span className="section-label">{estimates.length} Estimate{estimates.length !== 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div className="spinner" />
        ) : estimates.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🗂️</div>
            <p>{search ? 'No estimates match your search' : 'No estimates yet. Create your first one!'}</p>
          </div>
        ) : (
          estimates.map(est => (
            <div key={est.id} className="estimate-row">
              <div className="est-header">
                <div>
                  <div className="est-bill">Bill #{est.bill_number}</div>
                  <div className="est-meta">
                    📅 {est.bill_date}
                    {est.transport ? ` · 🚛 ${est.transport}` : ''}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>📍 {est.site_name}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="est-total">₹{formatTotal(est.grand_total)}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {est.total_nos} nos · {est.total_quantity} qty
                  </div>
                </div>
              </div>

              <div className="est-actions">
                <button className="btn btn-secondary btn-sm"
                  onClick={() => navigate(`/estimate/view/${est.id}`)}>
                  👁 View
                </button>
                <button className="btn btn-primary btn-sm"
                  onClick={() => navigate(`/estimate/edit/${est.id}`)}>
                  ✏️ Edit
                </button>
                <button className="btn btn-secondary btn-sm"
                  onClick={() => {
                    navigate(`/estimate/view/${est.id}`)
                    setTimeout(() => window.print(), 800)
                  }}>
                  🖨 Print
                </button>
                <button className="btn btn-danger btn-sm"
                  onClick={() => setDeleteConfirm(est)}>
                  🗑
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Sticky new estimate button */}
      <div className="sticky-bottom">
        <div className="sticky-bottom-inner">
          <button className="btn btn-primary btn-full btn-lg"
            onClick={() => navigate('/estimate/new')}>
            + CREATE NEW ESTIMATE
          </button>
        </div>
      </div>

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <div className="modal-overlay"
          onClick={e => e.target === e.currentTarget && setDeleteConfirm(null)}>
          <div className="modal-box">
            <div className="modal-title">Delete Estimate</div>
            <p style={{ marginBottom: 8 }}>
              Delete <strong>Bill #{deleteConfirm.bill_number}</strong>?
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
              Site: {deleteConfirm.site_name} · ₹{formatTotal(deleteConfirm.grand_total)}<br />
              This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary btn-full"
                onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger btn-full"
                onClick={() => handleDelete(deleteConfirm)}
                disabled={deleting}>
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {ToastEl}
    </div>
  )
}
