import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../hooks/useToast.jsx'

const EMPTY_FORM = {
  product_name: '', length: '', width: '',
  unit: '', rate: '', calculation_type: 'QUANTITY',
  stock_quantity: ''
}
const UNITS = ['Sq.Ft', 'Nos.', 'Kg.', 'Bundle', 'Rft','Pcs','Sheet','Patti','Dz', 'Ltr', 'Pkt', 'Box', 'Set', 'Pair']

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
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [stockModal, setStockModal] = useState(null)
  const [stockLedger, setStockLedger] = useState([])
  const [stockAction, setStockAction] = useState('ADD')
  const [stockQty, setStockQty] = useState('')
  const [stockNote, setStockNote] = useState('')
  const [stockSaving, setStockSaving] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [showDeleteAll, setShowDeleteAll] = useState(false)
  const [deleting, setDeleting] = useState(false)  

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
      calculation_type: p.calculation_type,
      stock_quantity: p.stock_quantity ?? ''
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

  // Find existing product with same name (for duplicate warning)
  function findDuplicate(name) {
    if (!name || editingId) return null
    return products.find(p => p.product_name.toLowerCase() === name.trim().toLowerCase()) || null
  }

  function switchToEdit(p) {
    setForm({
      product_name: p.product_name, length: p.length ?? '',
      width: p.width ?? '', unit: p.unit, rate: p.rate,
      calculation_type: p.calculation_type
    })
    setEditingId(p.id)
  }

  function validate() {
    if (!form.product_name.trim()) return 'Product name is required'
    if (!form.unit.trim()) return 'Unit is required'
    if (!form.rate || isNaN(form.rate) || Number(form.rate) < 0) return 'Valid rate is required'
    if (form.calculation_type === 'SQFT') {
      if (!form.length || isNaN(form.length)) return 'Length required for Sq.Ft products'
      if (!form.width  || isNaN(form.width))  return 'Width required for Sq.Ft products'
    }
    // block duplicate when adding new
    if (!editingId && findDuplicate(form.product_name)) {
      return 'Product already exists. Use "Edit existing product instead" above.'
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
      stock_quantity: form.stock_quantity !== '' ? Number(form.stock_quantity) : null,
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
      if (product_name.toLowerCase().includes('product') && rate?.toLowerCase().includes('rate')) continue
      if (isNaN(Number(rate)) || !product_name || !unit) continue
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
    setSaving(true); let added = 0, updated = 0
    for (const row of importPreview) {
      const existing = products.find(p => p.product_name.toLowerCase() === row.product_name.toLowerCase())
      if (existing) {
        // update existing product
        const { error } = await supabase.from('products').update({
          unit: row.unit, rate: row.rate,
          length: row.length, width: row.width,
          calculation_type: row.calculation_type,
          updated_at: new Date().toISOString()
        }).eq('id', existing.id)
        if (!error) updated++
      } else {
      const { error } = await supabase.from('products').insert(row)
      if (!error) added++
      }
    }
    setSaving(false)
    showToast(`Added ${added}, updated ${updated} products`)
    setShowImport(false); setImportPreview([]); setImportText('')
    fetchProducts()
  }

  async function openStockModal(p) {
    setStockModal(p)
    setStockAction('ADD')
    setStockQty('')
    setStockNote('')
    const { data } = await supabase.from('stock_ledger')
      .select('*').eq('product_id', p.id)
      .order('created_at', { ascending: false }).limit(20)
    setStockLedger(data || [])
  }

  async function handleStockUpdate() {
    if (!stockQty || isNaN(stockQty) || Number(stockQty) <= 0) {
      showToast('Enter a valid quantity', 'error'); return
    }
    setStockSaving(true)
    const qty = Number(stockQty)
    const p = stockModal
    let newStock
    if (stockAction === 'ADD') newStock = Number(p.stock_quantity || 0) + qty
    else newStock = qty // SET

    // Update product stock
    const { error: pErr } = await supabase.from('products')
      .update({ stock_quantity: newStock, updated_at: new Date().toISOString() })
      .eq('id', p.id)
    if (pErr) { showToast('Update failed', 'error'); setStockSaving(false); return }

    // Log to ledger
    await supabase.from('stock_ledger').insert({
      product_id: p.id,
      product_name: p.product_name,
      action: stockAction,
      quantity: stockAction === 'ADD' ? qty : qty,
      note: stockNote.trim() || null
    })

    showToast(`Stock ${stockAction === 'ADD' ? 'added' : 'set'} ✓`)
    setStockSaving(false)
    setStockQty('')
    setStockNote('')
    // refresh ledger and products
    const { data } = await supabase.from('stock_ledger')
      .select('*').eq('product_id', p.id)
      .order('created_at', { ascending: false }).limit(20)
    setStockLedger(data || [])
    fetchProducts()
    // update local stockModal ref
    setStockModal(prev => ({ ...prev, stock_quantity: newStock }))
  }

  function handleExport() {
    if (products.length === 0) { showToast('No products to export', 'error'); return }
    const headers = 'Product Name,Length,Width,Unit,Rate,Calculation Type'
    const rows = products.map(p =>
      `${p.product_name},${p.length ?? ''},${p.width ?? ''},${p.unit},${p.rate},${p.calculation_type}`
    )
    const csv = [headers, ...rows].join(String.fromCharCode(10))
    const blob = new Blob([csv], { type: 'text/csv' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `products-${new Date().toISOString().slice(0,10)}.csv`
    link.click()
    showToast(`Exported ${products.length} products ✓`)
  }

  async function openStockModal(p) {
    setStockModal(p)
    setStockAction('ADD')
    setStockQty('')
    setStockNote('')
    const { data } = await supabase.from('stock_ledger')
      .select('*').eq('product_id', p.id)
      .order('created_at', { ascending: false }).limit(20)
    setStockLedger(data || [])
  }

  async function handleStockUpdate() {
    if (!stockQty || isNaN(stockQty) || Number(stockQty) <= 0) {
      showToast('Enter a valid quantity', 'error'); return
    }
    setStockSaving(true)
    const qty = Number(stockQty)
    const p = stockModal
    let newStock
    if (stockAction === 'ADD') newStock = Number(p.stock_quantity || 0) + qty
    else newStock = qty // SET

    // Update product stock
    const { error: pErr } = await supabase.from('products')
      .update({ stock_quantity: newStock, updated_at: new Date().toISOString() })
      .eq('id', p.id)
    if (pErr) { showToast('Update failed', 'error'); setStockSaving(false); return }

    // Log to ledger
    await supabase.from('stock_ledger').insert({
      product_id: p.id,
      product_name: p.product_name,
      action: stockAction,
      quantity: stockAction === 'ADD' ? qty : qty,
      note: stockNote.trim() || null
    })

    showToast(`Stock ${stockAction === 'ADD' ? 'added' : 'set'} ✓`)
    setStockSaving(false)
    setStockQty('')
    setStockNote('')
    // refresh ledger and products
    const { data } = await supabase.from('stock_ledger')
      .select('*').eq('product_id', p.id)
      .order('created_at', { ascending: false }).limit(20)
    setStockLedger(data || [])
    fetchProducts()
    // update local stockModal ref
    setStockModal(prev => ({ ...prev, stock_quantity: newStock }))
  }

  function handleExport() {
    const headers = 'Product Name,Length,Width,Unit,Rate,Calculation Type'
    const rows = products.map(p =>
      [
        p.product_name,
        p.length ?? '',
        p.width ?? '',
        p.unit,
        p.rate,
        p.calculation_type
      ].join(',')
    )
    const csv = [headers, ...rows].join(String.fromCharCode(10))
    const blob = new Blob([csv], { type: 'text/csv' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `products-${new Date().toISOString().slice(0,10)}.csv`
    link.click()
    showToast(`Exported ${products.length} products ✓`)
  }

  return (
    <div className="app-container">
      <div className="top-nav">
        <button className="nav-back" onClick={() => navigate('/')}>←</button>
        <span className="nav-title">Product Master</span>
        <div style={{ display:'flex', gap:6, marginLeft:'auto' }}>
          <button className="btn btn-sm"
            style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)' }}
            onClick={handleExport}>⬇ Export</button>
        <button className="btn btn-sm"
          style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)' }}
          onClick={() => setShowImport(true)}>⬆ Import</button>
          <button className="btn btn-sm"
            style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)' }}
            onClick={() => { setSelectMode(m => !m); setSelectedIds(new Set()) }}>
            {selectMode ? 'Cancel' : '☑ Select'}
          </button>
          <button className="btn btn-sm" style={{ background: '#c0392b', color: '#fff' }}
            onClick={() => setShowDeleteAll(true)}>🗑 All</button>
        </div>
      </div>

      <div className="page">
        <div className="search-bar">
          <span>🔍</span>
          <input placeholder="Search product name or unit..."
            value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button className="btn btn-ghost btn-sm" onClick={() => setSearch('')}>✕</button>}
        </div>

        {selectMode && (
          <div style={{ background:'#fff', border:'2px solid var(--accent)', borderRadius:8, padding:'10px 14px', marginBottom:12, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
            <span style={{ fontSize:14, fontWeight:600 }}>{selectedIds.size} selected</span>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelectedIds(new Set(filtered.map(p => p.id)))}>Select All</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelectedIds(new Set())}>Clear</button>
            {selectedIds.size > 0 && (
              <button className="btn btn-danger btn-sm" disabled={deleting} onClick={async () => {
                setDeleting(true)
                const ids = [...selectedIds]
                const { error } = await supabase.from('products').delete().in('id', ids)
                if (error) showToast('Delete failed', 'error')
                else { showToast(`${ids.length} product(s) deleted`); setSelectedIds(new Set()); fetchProducts() }
                setDeleting(false)
              }}>
                {deleting ? 'Deleting...' : `🗑 Delete ${selectedIds.size}`}
              </button>
            )}
          </div>
        )}

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <span className="section-label">{filtered.length} Products</span>
        </div>

        {loading ? <div className="spinner" /> : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <p>{search ? 'No products match your search' : 'No products yet. Tap + ADD PRODUCT below!'}</p>
          </div>
        ) : filtered.map(p => (
          <div key={p.id} className="item-card" style={{ opacity: selectMode && selectedIds.has(p.id) ? 0.85 : 1, borderColor: selectMode && selectedIds.has(p.id) ? 'var(--accent)' : undefined }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
              {selectMode && (
                <input type="checkbox" style={{ width:18, height:18, marginTop:2, flexShrink:0, cursor:'pointer' }}
                  checked={selectedIds.has(p.id)}
                  onChange={() => setSelectedIds(prev => { const next = new Set(prev); next.has(p.id) ? next.delete(p.id) : next.add(p.id); return next })} />
              )}
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
              {p.stock_quantity !== null && p.stock_quantity !== undefined && (
                <div style={{ gridColumn: '1/-1' }}>
                  <span style={{ color:'var(--text-muted)', fontSize:12 }}>STOCK</span><br />
                  <span style={{ fontWeight:700, color: p.stock_quantity <= 0 ? 'var(--danger)' : p.stock_quantity < 10 ? 'var(--warning)' : 'var(--accent)' }}>
                    {p.stock_quantity} {p.unit}
                    {p.stock_quantity <= 0 ? ' ⚠️ Out of stock' : p.stock_quantity < 10 ? ' ⚠️ Low stock' : ''}
                  </span>
                </div>
              )}
            </div>
            <div className="item-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => openEdit(p)}>✏️ Edit</button>
              {p.stock_quantity !== null && p.stock_quantity !== undefined && (
                <button className="btn btn-sm" style={{ background:'#dbeafe', color:'#1e40af', border:'none', borderRadius:8, padding:'8px 14px', fontWeight:600, cursor:'pointer' }}
                  onClick={() => openStockModal(p)}>📦 Stock</button>
              )}
              <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(p)}>🗑 Delete</button>
            </div>
          </div>
        ))}
      </div>

      <div className="sticky-bottom">
        <div className="sticky-bottom-inner">
          {selectMode && selectedIds.size > 0 ? (
            <button className="btn btn-danger btn-full btn-lg" disabled={deleting} onClick={async () => {
              setDeleting(true)
              const ids = [...selectedIds]
              const { error } = await supabase.from('products').delete().in('id', ids)
              if (error) showToast('Delete failed', 'error')
              else { showToast(`${ids.length} product(s) deleted`); setSelectedIds(new Set()); setSelectMode(false); fetchProducts() }
              setDeleting(false)
            }}>
              {deleting ? 'Deleting...' : `🗑 Delete ${selectedIds.size} Selected`}
            </button>
          ) : (
          <button className="btn btn-primary btn-full btn-lg" onClick={openAdd}>+ ADD PRODUCT</button>
          )}
        </div>
      </div>

      {showDeleteAll && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowDeleteAll(false)}>
          <div className="modal-box">
            <div className="modal-title">⚠️ Delete All Products</div>
            <p style={{ marginBottom:8, color:'var(--danger)', fontWeight:600 }}>
              This will permanently delete ALL {products.length} products!
            </p>
            <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:20 }}>
              Old estimates will not be affected. This cannot be undone.
            </p>
            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-secondary btn-full" onClick={() => setShowDeleteAll(false)}>Cancel</button>
              <button className="btn btn-danger btn-full" disabled={deleting} onClick={async () => {
                setDeleting(true)
                const { error } = await supabase.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000')
                if (error) showToast('Delete failed', 'error')
                else { showToast('All products deleted'); setShowDeleteAll(false); fetchProducts() }
                setDeleting(false)
              }}>
                {deleting ? 'Deleting...' : 'Yes, Delete All'}
              </button>
            </div>
          </div>
        </div>
      )}

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
              {(() => {
                const dup = findDuplicate(form.product_name)
                return dup ? (
                  <div style={{ marginTop:6, padding:'8px 12px', background:'#fff3cd', border:'1px solid #ffc107', borderRadius:6, fontSize:13 }}>
                    ⚠️ <strong>{dup.product_name}</strong> already exists (₹{dup.rate} / {dup.unit})
                    <br />
                    <button type="button" className="btn btn-sm btn-secondary" style={{ marginTop:6 }}
                      onClick={() => switchToEdit(dup)}>
                      ✏️ Edit existing product instead
                    </button>
                  </div>
                ) : null
              })()}
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
            <div className="field">
              <label>Opening Stock (leave blank if not tracking)</label>
              <input name="stock_quantity" type="number" inputMode="decimal"
                value={form.stock_quantity} onChange={handleFormChange}
                placeholder="e.g. 100 (optional)" />
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

      {/* Stock Modal */}
      {stockModal && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setStockModal(null)}>
          <div className="modal-box">
            <div className="modal-title">
              <span>📦 {stockModal.product_name}</span>
              <button className="btn btn-ghost" onClick={() => setStockModal(null)}>✕</button>
            </div>

            {/* Current stock */}
            <div style={{ background:'var(--accent-light)', border:'2px solid var(--accent)', borderRadius:8, padding:'12px 14px', marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:14, fontWeight:600 }}>Current Stock</span>
              <span style={{ fontSize:22, fontWeight:700, color: stockModal.stock_quantity <= 0 ? 'var(--danger)' : 'var(--accent)' }}>
                {stockModal.stock_quantity} {stockModal.unit}
              </span>
            </div>

            {/* Action toggle */}
            <div style={{ display:'flex', gap:8, marginBottom:12 }}>
              <button className={`btn btn-sm btn-full ${stockAction==='ADD' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setStockAction('ADD')}>➕ Add Stock</button>
              <button className={`btn btn-sm btn-full ${stockAction==='SET' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setStockAction('SET')}>🔄 Set Stock</button>
            </div>

            <div className="field">
              <label>{stockAction === 'ADD' ? 'Quantity to Add' : 'Set Stock To'} *</label>
              <input type="number" inputMode="decimal" value={stockQty}
                onChange={e => setStockQty(e.target.value)}
                placeholder={stockAction === 'ADD' ? 'e.g. 50' : 'e.g. 100'} />
              {stockAction === 'ADD' && stockQty && (
                <div style={{ fontSize:13, color:'var(--accent)', marginTop:4, fontWeight:600 }}>
                  New stock: {Number(stockModal.stock_quantity || 0) + Number(stockQty)} {stockModal.unit}
                </div>
              )}
            </div>

            <div className="field">
              <label>Note (optional)</label>
              <input type="text" value={stockNote} onChange={e => setStockNote(e.target.value)}
                placeholder="e.g. New stock received, Physical count..." />
            </div>

            <button className="btn btn-primary btn-full" onClick={handleStockUpdate} disabled={stockSaving}>
              {stockSaving ? 'Saving...' : stockAction === 'ADD' ? '➕ Add Stock' : '🔄 Set Stock'}
            </button>

            {/* Ledger history */}
            {stockLedger.length > 0 && (
              <div style={{ marginTop:16 }}>
                <div className="section-label">Stock History</div>
                <div style={{ maxHeight:200, overflowY:'auto' }}>
                  {stockLedger.map(l => {
                    const date = new Date(l.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'2-digit', year:'numeric', timeZone:'Asia/Kolkata' })
                    const time = new Date(l.created_at).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', timeZone:'Asia/Kolkata' })
                    return (
                      <div key={l.id} style={{ padding:'8px 0', borderBottom:'1px solid #f0f0f0', fontSize:13 }}>
                        <div style={{ display:'flex', justifyContent:'space-between' }}>
                          <span style={{ color: l.action === 'ESTIMATE' ? 'var(--danger)' : 'var(--accent)', fontWeight:700 }}>
                            {l.action === 'ADD' ? '➕' : l.action === 'SET' ? '🔄' : '📄'} {l.action}
                            {' '}{l.action === 'ESTIMATE' ? `-${l.quantity}` : `+${l.quantity}`} {stockModal.unit}
                          </span>
                          <span style={{ color:'var(--text-muted)' }}>{date} {time}</span>
                        </div>
                        {l.note && <div style={{ color:'var(--text-muted)', marginTop:2 }}>{l.note}</div>}
                        {l.bill_number && <div style={{ color:'var(--text-muted)', marginTop:2 }}>Bill #{l.bill_number} · {l.site_name}</div>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {ToastEl}
    </div>
  )
}
