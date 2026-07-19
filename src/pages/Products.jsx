import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../hooks/useToast.jsx'

const EMPTY_FORM = {
  product_name: '', length: '', width: '',
  unit: '', rate: '', calculation_type: 'QUANTITY'
}
const UNITS = ['Sq.Ft', 'Nos.', 'Kg.', 'Bundle', 'Rmt', 'Ltr', 'Pkt', 'Box', 'Set', 'Pair']

export default function Products() {
  const navigate = useNavigate()
  const { showToast, ToastEl } = useToast()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [importText, setImportText] = useState('')
  const [importPreview, setImportPreview] = useState([])
  const fileRef = useRef()

  useEffect(() => { fetchProducts() }, [])

  async function fetchProducts() {
    setLoading(true)
    const { data, error } = await supabase.from('products').select('*').order('product_name')
    if (error) showToast('Failed to load products', 'error')
    else setProducts(data || [])
    setLoading(false)
  }

  const filtered = products.filter(p =>
    p.product_name.toLowerCase().includes(search.toLowerCase()) ||
    p.unit.toLowerCase().includes(search.toLowerCase())
  )

  function openAdd() { setForm(EMPTY_FORM); setEditingId(null); setShowModal(true) }

  function openEdit(p) {
    setForm({
      product_name: p.product_name, length: p.length ?? '',
      width: p.width ?? '', unit: p.unit, rate: p.rate,
      calculation_type: p.calculation_type
    })
    setEditingId(p.id); setShowModal(true)
  }

  function handleFormChange(e) {
    const { name, value } = e.target
    setForm(f => {
      const next = { ...f, [name]: value }
      if (name === 'unit') next.calculation_type = value === 'Sq.Ft' ? 'SQFT' : 'QUANTITY'
      if (name === 'calculation_type' && value === 'QUANTITY') { next.length = ''; next.width = '' }
      return next
    })
  }

  function validate() {
    if (!form.product_name.trim()) return 'Product name is required'
    if (!form.unit.trim()) return 'Unit is required'
    if (!form.rate || isNaN(form.rate) || Number(form.rate) < 0) return 'Valid rate is required'
    if (form.calculation_type === 'SQFT') {
      if (!form.length || isNaN(form.length)) return 'Length required for Sq.Ft products'
      if (!form.width  || isNaN(form.width))  return 'Width required for Sq.Ft products'
    }
    return null
  }

  async function handleSave() {
    const err = validate()
    if (err) { showToast(err, 'error'); return }
    setSaving(true)
    const payload = {
      product_name: form.product_name.trim().toUpperCase(),
      unit: form.unit.trim(), rate: Number(form.rate),
      calculation_type: form.calculation_type,
      length: form.calculation_type === 'SQFT' ? Number(form.length) : null,
      width:  form.calculation_type === 'SQFT' ? Number(form.width)  : null,
      updated_at: new Date().toISOString()
    }
    let error
    if (editingId) {
      ;({ error } = await supabase.from('products').update(payload).eq('id', editingId))
    } else {
      ;({ error } = await supabase.from('products').insert(payload))
    }
    setSaving(false)
    if (error) { showToast('Save failed: ' + error.message, 'error'); return }
    showToast(editingId ? 'Product updated ✓' : 'Product added ✓')
    setShowModal(false); fetchProducts()
  }

  async function handleDelete(id) {
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) showToast('Delete failed', 'error')
    else { showToast('Product deleted'); fetchProducts() }
    setDeleteConfirm(null)
  }

  function handleFileChange(e) {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => { setImportText(ev.target.result); parseImport(ev.target.result) }
    reader.readAsText(file)
  }

  function parseImport(text) {
    const lines = text.trim().split('\n').filter(Boolean); const rows = []
    for (const line of lines) {
      const cols = line.split(/,|\t/).map(c => c.trim().replace(/^"|"$/g, ''))
      if (cols.length < 3) continue
      const [product_name, length, width, unit, rate, calculation_type] = cols
      if (!product_name || !unit || !rate) continue
      const calcType = calculation_type?.toUpperCase().trim() === 'SQFT' ? 'SQFT' : 'QUANTITY'
      rows.push({
        product_name: product_name.toUpperCase(),
        length: length ? Number(length) : null,
        width:  width  ? Number(width)  : null,
        unit: unit.trim(), rate: Number(rate), calculation_type: calcType
      })
    }
    setImportPreview(rows)
  }

  async function handleImport() {
    if (!importPreview.length) { showToast('No valid rows to import', 'error'); return }
    setSaving(true); let added = 0, skipped = 0
    for (const row of importPreview) {
      const existing = products.find(p => p.product_name.toLowerCase() === row.product_name.toLowerCase())
      if (existing) { skipped++; continue }
      const { error } = await supabase.from('products').insert(row)
      if (!error) added++
    }
    setSaving(false)
    showToast(`Imported ${added} products, skipped ${skipped} duplicates`)
    setShowImport(false); setImportPreview([]); setImportText('')
    fetchProducts()
  }

  return (
    <div className="app-container">
      <div className="top-nav">
        <button className="nav-back" onClick={() => navigate('/')}>←</button>
        <span className="nav-title">Product Master</span>
        <button className="btn btn-sm"
          style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)' }}
          onClick={() => setShowImport(true)}>⬆ Import</button>
      </div>

      <div className="page">
        <div className="search-bar">
          <span>🔍</span>
          <input placeholder="Search product name or unit..."
            value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button className="btn btn-ghost btn-sm" onClick={() => setSearch('')}>✕</button>}
        </div>

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <span className="section-label">{filtered.length} Products</span>
        </div>

        {loading ? <div className="spinner" /> : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <p>{search ? 'No products match your search' : 'No products yet. Tap + ADD PRODUCT below!'}</p>
          </div>
        ) : filtered.map(p => (
          <div key={p.id} className="item-card">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div className="item-name" style={{ flex:1, marginRight:8 }}>{p.product_name}</div>
              <span className={`badge ${p.calculation_type === 'SQFT' ? 'badge-sqft' : 'badge-qty'}`}>
                {p.calculation_type}
              </span>
            </div>
            <div className="item-grid" style={{ marginTop:8 }}>
              <div><span style={{ color:'var(--text-muted)', fontSize:12 }}>UNIT</span><br />{p.unit}</div>
              <div><span style={{ color:'var(--text-muted)', fontSize:12 }}>RATE</span><br />₹{Number(p.rate).toFixed(2)}</div>
              {p.calculation_type === 'SQFT' && (
                <>
                  <div><span style={{ color:'var(--text-muted)', fontSize:12 }}>LENGTH</span><br />{p.length} ft</div>
                  <div><span style={{ color:'var(--text-muted)', fontSize:12 }}>WIDTH</span><br />{p.width} ft</div>
                </>
              )}
            </div>
            <div className="item-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => openEdit(p)}>✏️ Edit</button>
              <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(p)}>🗑 Delete</button>
            </div>
          </div>
        ))}
      </div>

      <div className="sticky-bottom">
        <div className="sticky-bottom-inner">
          <button className="btn btn-primary btn-full btn-lg" onClick={openAdd}>+ ADD PRODUCT</button>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowModal(false)}>
          <div className="modal-box">
            <div className="modal-title">
              <span>{editingId ? 'Edit Product' : 'Add Product'}</span>
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="field">
              <label>Product Name *</label>
              <input name="product_name" value={form.product_name} onChange={handleFormChange}
                placeholder="e.g. C PLY 4 18 MM 7 x 4" style={{ textTransform:'uppercase' }} />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Unit *</label>
                <select name="unit" value={form.unit} onChange={handleFormChange}>
                  <option value="">Select unit</option>
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Calculation Type *</label>
                <select name="calculation_type" value={form.calculation_type} onChange={handleFormChange}>
                  <option value="QUANTITY">QUANTITY</option>
                  <option value="SQFT">SQFT</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label>Rate (₹) *</label>
              <input name="rate" type="number" inputMode="decimal"
                value={form.rate} onChange={handleFormChange} placeholder="0.00" />
            </div>
            {form.calculation_type === 'SQFT' && (
              <div className="field-row">
                <div className="field">
                  <label>Length (ft) *</label>
                  <input name="length" type="number" inputMode="decimal"
                    value={form.length} onChange={handleFormChange} placeholder="e.g. 7" />
                </div>
                <div className="field">
                  <label>Width (ft) *</label>
                  <input name="width" type="number" inputMode="decimal"
                    value={form.width} onChange={handleFormChange} placeholder="e.g. 4" />
                </div>
              </div>
            )}
            <div style={{ display:'flex', gap:10, marginTop:8 }}>
              <button className="btn btn-secondary btn-full" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary btn-full" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Update Product' : 'Add Product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setDeleteConfirm(null)}>
          <div className="modal-box">
            <div className="modal-title">Delete Product</div>
            <p style={{ marginBottom:16 }}>
              Delete <strong>{deleteConfirm.product_name}</strong>? Old estimates will not be affected.
            </p>
            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-secondary btn-full" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger btn-full" onClick={() => handleDelete(deleteConfirm.id)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowImport(false)}>
          <div className="modal-box">
            <div className="modal-title">
              <span>Import Products (CSV)</span>
              <button className="btn btn-ghost" onClick={() => setShowImport(false)}>✕</button>
            </div>
            <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:12 }}>
              Columns: <strong>Product Name, Length, Width, Unit, Rate, Calculation Type</strong><br />
              Leave Length/Width blank for QUANTITY products.
            </p>
            <div className="field">
              <label>Upload CSV File</label>
              <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFileChange}
                style={{ padding:'10px 0', border:'none', fontSize:14 }} />
            </div>
            <div className="field">
              <label>Or Paste CSV Text</label>
              <textarea rows={5}
                style={{ width:'100%', padding:12, border:'2px solid var(--border-light)', borderRadius:8, fontSize:13, fontFamily:'monospace' }}
                placeholder={"C PLY 4 18 MM 7 x 4,7,4,Sq.Ft,57.50,SQFT\nNAILS 14 X 1 3/4,,,Kg.,130,QUANTITY"}
                value={importText}
                onChange={e => { setImportText(e.target.value); parseImport(e.target.value) }} />
            </div>
            {importPreview.length > 0 && (
              <div style={{ marginBottom:16 }}>
                <div className="section-label">{importPreview.length} rows ready</div>
                <div style={{ maxHeight:160, overflowY:'auto', fontSize:13 }}>
                  {importPreview.map((r,i) => (
                    <div key={i} style={{ padding:'6px 0', borderBottom:'1px solid #f0f0f0' }}>
                      <strong>{r.product_name}</strong> — {r.unit} @ ₹{r.rate}
                      {r.calculation_type === 'SQFT' && ` (${r.length}×${r.width} ft)`}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-secondary btn-full" onClick={() => setShowImport(false)}>Cancel</button>
              <button className="btn btn-primary btn-full" onClick={handleImport}
                disabled={saving || importPreview.length === 0}>
                {saving ? 'Importing...' : `Import ${importPreview.length} Products`}
              </button>
            </div>
          </div>
        </div>
      )}

      {ToastEl}
    </div>
  )
}
