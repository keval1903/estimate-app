import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Clients() {
  const navigate = useNavigate()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Add Client Modal State
  const [showModal, setShowModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newMobile, setNewMobile] = useState('')
  const [newBalance, setNewBalance] = useState('')

  async function handleAddClient(e) {
    e.preventDefault()
    if (!newName.trim()) return
    
    const { data, error } = await supabase.from('clients').insert([{
      name: newName.trim().toUpperCase(),
      mobile: newMobile.trim(),
      opening_balance: Number(newBalance) || 0
    }]).select('id').single()

    if (error) {
      alert("Failed to add client: " + error.message)
    } else {
      setShowModal(false)
      setNewName('')
      setNewMobile('')
      setNewBalance('')
      loadClients()
    }
  }

  async function loadClients() {
    setLoading(true)
    try {
      const { data: clientData } = await supabase.from('clients').select('*').order('name')
      const { data: estData } = await supabase.from('estimates').select('client_id, grand_total').eq('type', 'ESTIMATE')
      const { data: payData } = await supabase.from('payments').select('client_id, amount')

      const combined = (clientData || []).map(c => {
        const estTotal = (estData || []).filter(e => e.client_id === c.id).reduce((sum, e) => sum + (Number(e.grand_total) || 0), 0)
        const payTotal = (payData || []).filter(p => p.client_id === c.id).reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
        const balance = Number(c.opening_balance || 0) + estTotal - payTotal
        return { ...c, balance }
      })

      setClients(combined)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  useEffect(() => { loadClients() }, [])

  return (
    <div className="app-container">
      <div className="header">
        <button className="back-btn" onClick={() => navigate(-1)}>← Back</button>
        <h1>Clients & Ledger</h1>
        <div style={{ width: 60 }} />
      </div>

      <div className="page" style={{ padding: 16 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 20 }}>Loading...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div className="search-bar" style={{ flex: 1, margin: 0 }}>
                <span>🔍</span>
                <input
                  placeholder="Search clients by name or mobile..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setSearch('')}>✕</button>
                )}
              </div>
              <button className="btn btn-primary" style={{ margin: 0, whiteSpace: 'nowrap' }} onClick={() => setShowModal(true)}>
                ➕ Add Client
              </button>
            </div>
            
            {clients.filter(c => {
              if (!search.trim()) return true;
              const searchTerms = search.toLowerCase().trim().split(/\s+/);
              const targetStr = `${c.name || ''} ${c.mobile || ''}`.toLowerCase();
              return searchTerms.every(term => targetStr.includes(term));
            }).map(c => (
              <div key={c.id} className="card" style={{ padding: 16, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={() => navigate(`/clients/${c.id}`)}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>{c.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{c.mobile || 'No Mobile'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Outstanding Balance</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: c.balance > 0 ? '#ef4444' : (c.balance < 0 ? '#10b981' : '#000') }}>
                    ₹ {Math.abs(c.balance).toFixed(2)} {c.balance > 0 ? 'Dr' : (c.balance < 0 ? 'Cr' : '')}
                  </div>
                </div>
              </div>
            ))}
            {clients.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
                No clients found.
              </div>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ marginTop: 0 }}>Add New Client</h3>
            <form onSubmit={handleAddClient} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Client Name <span style={{color: 'red'}}>*</span></label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)} required style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: 4, textTransform: 'uppercase' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Mobile Number</label>
                <input type="text" value={newMobile} onChange={e => setNewMobile(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: 4 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Previous Pending Payment (₹)</label>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 4px 0' }}>If this client owes you money from before, enter it here.</p>
                <input type="number" step="0.01" value={newBalance} onChange={e => setNewBalance(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: 4 }} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button type="submit" className="primary-btn" style={{ flex: 1, margin: 0 }}>Save Client</button>
                <button type="button" className="home-btn" style={{ flex: 1, margin: 0, background: '#f1f5f9' }} onClick={() => setShowModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
