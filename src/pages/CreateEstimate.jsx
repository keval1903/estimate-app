import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../hooks/useToast.jsx'

// ── Helpers ──────────────────────────────────────────────────────────────────
function todayIST() {
  const now = new Date()
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
  const dd = String(ist.getDate()).padStart(2, '0')
  const mm = String(ist.getMonth() + 1).padStart(2, '0')
  const yyyy = ist.getFullYear()
  return `${dd}-${mm}-${yyyy}`
}

function calcItem(item) {
  const nos = parseFloat(item.nos) || 0
  const qty = parseFloat(item.quantity) || 0
  const rate = parseFloat(item.rate) || 0
  const L = parseFloat(item.length_snapshot) || 0
  const W = parseFloat(item.width_snapshot) || 0
  if (item.calculation_type_snapshot === 'SQFT') {
    const quantity = L * W * nos
    const amount = quantity * rate
    return { quantity: +quantity.toFixed(2), amount: +amount.toFixed(2) }
  } else {
    const amount = qty * rate
    return { quantity: qty, amount: +amount.toFixed(2) }
  }
}

function calcTotals(items) {
  let total_nos = 0, total_quantity = 0, grand_total = 0
  for (const it of items) {
    total_nos      += parseFloat(it.nos) || 0
    total_quantity += parseFloat(it.quantity) || 0
    grand_total    += parseFloat(it.amount) || 0
  }
  return {
    total_nos: +total_nos.toFixed(2),
    total_quantity: +total_quantity.toFixed(2),
    grand_total: +grand_total.toFixed(2)
  }
}

const EMPTY_ITEM = {
  product_id: null, product_name_snapshot: '',
  length_snapshot: null, width_snapshot: null,
  nos: '', quantity: '', unit_snapshot: '',
  rate: '', calculation_type_snapshot: 'QUANTITY', amount: 0
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function CreateEstimate() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)
  const { showToast, ToastEl } = useToast()

  // form state
  const [billDate, setBillDate] = useState(todayIST())
  const [transport, setTransport] = useState('')
  const [siteName, setSiteName] = useState('')
  const [items, setItems] = useState([])
  const [totals, setTotals] = useState({ total_nos: 0, total_quantity: 0, grand_total: 0 })
  const [existingBillNumber, setExistingBillNumber] = useState(null)

  // UI state
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [showItemModal, setShowItemModal] = useState(false)
  const [editingItemIdx, setEditingItemIdx] = useState(null)

  // item modal state
  const [itemForm, setItemForm] = useState(EMPTY_ITEM)
  const [productSearch, setProductSearch] = useState('')
  const [productSuggestions, setProductSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [allProducts, setAllProducts] = useState([])

  // site autocomplete
  const [siteSuggestions, setSiteSuggestions] = useState([])
  const [showSiteSuggestions, setShowSiteSuggestions] = useState(false)
  const [allSites, setAllSites] = useState([])

  const productInputRef = useRef()
  const siteInputRef = useRef()

  // ── Load products & sites ──
  useEffect(() => {
    supabase.from('products').select('*').order('product_name')
      .then(({ data }) => setAllProducts(data || []))
    supabase.from('sites').select('*').order('site_name')
      .then(({ data }) => setAllSites(data || []))
  }, [])

  // ── Load existing estimate for edit ──
  useEffect(() => {
    if (!isEdit) return
    async function load() {
      setLoading(true)
      const { data: est, error } = await supabase
        .from('estimates').select('*').eq('id', id).single()
      if (error || !est) { showToast('Estimate not found', 'error'); navigate('/estimates'); return }
      setBillDate(est.bill_date)
      setTransport(est.transport || '')
      setSiteName(est.site_name || '')
      setExistingBillNumber(est.bill_number)
      const { data: eitems } = await supabase
        .from('estimate_items').select('*')
        .eq('estimate_id', id).order('serial_number')
      setItems((eitems || []).map(it => ({
        id: it.id,
        product_id: it.product_id,
        product_name_snapshot: it.product_name_snapshot,
        length_snapshot: it.length_snapshot,
        width_snapshot: it.width_snapshot,
        nos: it.nos ?? '',
        quantity: it.quantity ?? '',
        unit_snapshot: it.unit_snapshot,
        rate: it.rate,
        calculation_type_snapshot: it.calculation_type_snapshot,
        amount: it.amount
      })))
      setLoading(false)
    }
    load()
  }, [id])

  // ── Recalc totals when items change ──
  useEffect(() => { setTotals(calcTotals(items)) }, [items])

  // ── Product search ──
  useEffect(() => {
    const q = productSearch.trim().toLowerCase()
    if (!q) { setProductSuggestions([]); return }
    const results = allProducts.filter(p =>
      p.product_name.toLowerCase().includes(q)
    ).slice(0, 8)
    setProductSuggestions(results)
    setShowSuggestions(results.length > 0)
  }, [productSearch, allProducts])

  // ── Site search ──
  useEffect(() => {
    const q = siteName.trim().toLowerCase()
    if (!q) { setSiteSuggestions([]); setShowSiteSuggestions(false); return }
    const results = allSites.filter(s =>
      s.site_name.toLowerCase().includes(q)
    ).slice(0, 5)
    setSiteSuggestions(results)
    setShowSiteSuggestions(results.length > 0)
  }, [siteName, allSites])

  // ── Select a product from suggestions ──
  function selectProduct(p) {
    setItemForm(f => {
      const next = {
        ...f,
        product_id: p.id,
        product_name_snapshot: p.product_name,
        length_snapshot: p.length,
        width_snapshot: p.width,
        unit_snapshot: p.unit,
        rate: p.rate,
        calculation_type_snapshot: p.calculation_type,
        nos: p.calculation_type === 'SQFT' ? (f.nos || '') : '',
        quantity: p.calculation_type === 'QUANTITY' ? (f.quantity || '') : '',
        amount: 0
      }
      // recalc immediately
      const { quantity, amount } = calcItem(next)
      next.quantity = quantity || ''
      next.amount = amount
      return next
    })
    setProductSearch(p.product_name)
    setShowSuggestions(false)
    setProductSuggestions([])
  }

  // ── Item form field change ──
  function handleItemChange(e) {
    const { name, value } = e.target
    setItemForm(f => {
      const next = { ...f, [name]: value }
      const { quantity, amount } = calcItem(next)
      if (next.calculation_type_snapshot === 'SQFT') {
        next.quantity = quantity
      }
      next.amount = amount
      return next
    })
  }

  // ── Open item modal ──
  function openAddItem() {
    setItemForm(EMPTY_ITEM)
    setProductSearch('')
    setEditingItemIdx(null)
    setShowItemModal(true)
    setTimeout(() => productInputRef.current?.focus(), 100)
  }

  function openEditItem(idx) {
    const it = items[idx]
    setItemForm({ ...it })
    setProductSearch(it.product_name_snapshot)
    setEditingItemIdx(idx)
    setShowItemModal(true)
  }

  // ── Save item ──
  function saveItem() {
    if (!itemForm.product_name_snapshot) { showToast('Select a product', 'error'); return }
    const rate = parseFloat(itemForm.rate)
    if (!rate || rate <= 0) { showToast('Enter a valid rate', 'error'); return }

    if (itemForm.calculation_type_snapshot === 'SQFT') {
      if (!itemForm.nos || parseFloat(itemForm.nos) <= 0) {
        showToast('Enter number of pieces (Nos)', 'error'); return
      }
    } else {
      if (!itemForm.quantity || parseFloat(itemForm.quantity) <= 0) {
        showToast('Enter quantity', 'error'); return
      }
    }

    const { quantity, amount } = calcItem(itemForm)
    const finalItem = {
      ...itemForm,
      quantity: itemForm.calculation_type_snapshot === 'SQFT' ? quantity : parseFloat(itemForm.quantity),
      amount
    }

    setItems(prev => {
      const next = [...prev]
      if (editingItemIdx !== null) {
        next[editingItemIdx] = finalItem
      } else {
        next.push(finalItem)
      }
      return next
    })
    setShowItemModal(false)
  }

  function removeItem(idx) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  // ── Generate / Save Estimate ──
  async function handleGenerate() {
    if (!siteName.trim()) { showToast('Enter a site name', 'error'); return }
    if (items.length === 0) { showToast('Add at least one product', 'error'); return }
    setSaving(true)
    try {
      const t = calcTotals(items)

      if (isEdit) {
        // UPDATE existing estimate
        const { error: estErr } = await supabase.from('estimates').update({
          bill_date: billDate,
          transport: transport.trim(),
          site_name: siteName.trim().toUpperCase(),
          total_nos: t.total_nos,
          total_quantity: t.total_quantity,
          grand_total: t.grand_total,
          updated_at: new Date().toISOString()
        }).eq('id', id)
        if (estErr) throw estErr

        // delete old items, reinsert
        await supabase.from('estimate_items').delete().eq('estimate_id', id)
        const newItems = items.map((it, i) => ({
          estimate_id: id,
          serial_number: i + 1,
          product_id: it.product_id,
          product_name_snapshot: it.product_name_snapshot,
          length_snapshot: it.length_snapshot,
          width_snapshot: it.width_snapshot,
          nos: parseFloat(it.nos) || null,
          quantity: parseFloat(it.quantity) || null,
          unit_snapshot: it.unit_snapshot,
          rate: parseFloat(it.rate),
          calculation_type_snapshot: it.calculation_type_snapshot,
          amount: it.amount
        }))
        const { error: itemErr } = await supabase.from('estimate_items').insert(newItems)
        if (itemErr) throw itemErr

        // save site if new
        await saveSite(siteName.trim().toUpperCase())
        showToast('Estimate updated ✓')
        navigate(`/estimate/view/${id}`)

      } else {
        // CREATE new estimate — get atomic bill number
        const { data: seqData, error: seqErr } = await supabase
          .rpc('get_next_bill_number')
        if (seqErr) throw seqErr
        const billNumber = seqData

        const { data: est, error: estErr } = await supabase.from('estimates').insert({
          bill_number: billNumber,
          bill_date: billDate,
          transport: transport.trim(),
          site_name: siteName.trim().toUpperCase(),
          total_nos: t.total_nos,
          total_quantity: t.total_quantity,
          grand_total: t.grand_total
        }).select().single()
        if (estErr) throw estErr

        const newItems = items.map((it, i) => ({
          estimate_id: est.id,
          serial_number: i + 1,
          product_id: it.product_id,
          product_name_snapshot: it.product_name_snapshot,
          length_snapshot: it.length_snapshot,
          width_snapshot: it.width_snapshot,
          nos: parseFloat(it.nos) || null,
          quantity: parseFloat(it.quantity) || null,
          unit_snapshot: it.unit_snapshot,
          rate: parseFloat(it.rate),
          calculation_type_snapshot: it.calculation_type_snapshot,
          amount: it.amount
        }))
        const { error: itemErr } = await supabase.from('estimate_items').insert(newItems)
        if (itemErr) throw itemErr

        await saveSite(siteName.trim().toUpperCase())
        showToast('Estimate saved ✓')
        navigate(`/estimate/view/${est.id}`)
      }
    } catch (err) {
      showToast('Save failed: ' + (err.message || err), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function saveSite(name) {
    const exists = allSites.find(s => s.site_name.toLowerCase() === name.toLowerCase())
    if (!exists) {
      await supabase.from('sites').insert({ site_name: name })
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="app-container">
      <div className="top-nav">
        <button className="nav-back" onClick={() => navigate(-1)}>←</button>
        <span className="nav-title">{isEdit ? 'Edit Estimate' : 'New Estimate'}</span>
      </div>
      <div className="spinner" />
    </div>
  )

  return (
    <div className="app-container">
      <div className="top-nav">
        <button className="nav-back" onClick={() => navigate(-1)}>←</button>
        <span className="nav-title">{isEdit ? `Edit Bill #${existingBillNumber}` : 'New Estimate'}</span>
      </div>

      <div className="page">

        {/* Bill info */}
        <div className="card">
          <div className="field-row">
            <div className="field">
              <label>Bill No.</label>
              <input readOnly value={isEdit ? existingBillNumber : '(Auto)'} />
            </div>
            <div className="field">
              <label>Date</label>
              <input type="text" value={billDate}
                onChange={e => setBillDate(e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label>Transport</label>
            <input value={transport} onChange={e => setTransport(e.target.value)}
              placeholder="Transporter name (optional)" />
          </div>

          {/* Site name with autocomplete */}
          <div className="field">
            <label>Site Name *</label>
            <div className="autocomplete-wrap">
              <input
                ref={siteInputRef}
                value={siteName}
                onChange={e => setSiteName(e.target.value)}
                onFocus={() => siteName && setShowSiteSuggestions(siteSuggestions.length > 0)}
                onBlur={() => setTimeout(() => setShowSiteSuggestions(false), 200)}
                placeholder="e.g. DINESH PANDE"
                style={{ textTransform: 'uppercase' }}
              />
              {showSiteSuggestions && (
                <div className="autocomplete-list">
                  {siteSuggestions.map(s => (
                    <div key={s.id} className="autocomplete-item"
                      onMouseDown={() => { setSiteName(s.site_name); setShowSiteSuggestions(false) }}>
                      {s.site_name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Items */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span className="section-label">{items.length} Item{items.length !== 1 ? 's' : ''}</span>
        </div>

        {items.length === 0 ? (
          <div className="empty-state" style={{ padding: '28px 20px' }}>
            <div className="empty-icon">📋</div>
            <p>No items yet. Tap + ADD ITEM below.</p>
          </div>
        ) : items.map((it, idx) => (
          <div key={idx} className="item-card">
            <div className="item-name">
              {idx + 1}. {it.product_name_snapshot}
            </div>
            <div className="item-grid">
              {it.calculation_type_snapshot === 'SQFT' ? (
                <>
                  <div><span style={{ color: 'var(--text-muted)', fontSize: 12 }}>NOS</span><br />{it.nos}</div>
                  <div><span style={{ color: 'var(--text-muted)', fontSize: 12 }}>QTY</span><br />{it.quantity} {it.unit_snapshot}</div>
                </>
              ) : (
                <div><span style={{ color: 'var(--text-muted)', fontSize: 12 }}>QTY</span><br />{it.quantity} {it.unit_snapshot}</div>
              )}
              <div><span style={{ color: 'var(--text-muted)', fontSize: 12 }}>RATE</span><br />₹{Number(it.rate).toFixed(2)}</div>
            </div>
            <div className="item-amount">₹{Number(it.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
            <div className="item-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => openEditItem(idx)}>✏️ Edit</button>
              <button className="btn btn-danger btn-sm" onClick={() => removeItem(idx)}>🗑 Remove</button>
            </div>
          </div>
        ))}

        {/* Add item button */}
        <button className="btn btn-secondary btn-full" style={{ marginTop: 4, marginBottom: 16 }}
          onClick={openAddItem}>
          + ADD ITEM
        </button>

        {/* Totals */}
        {items.length > 0 && (
          <div className="totals-bar">
            <div className="total-row">
              <span>Total Nos.</span>
              <span>{totals.total_nos}</span>
            </div>
            <div className="total-row">
              <span>Total Quantity</span>
              <span>{totals.total_quantity}</span>
            </div>
            <div className="total-row grand">
              <span>Gr. Total</span>
              <span>₹{totals.grand_total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        )}
      </div>

      {/* Sticky generate button */}
      <div className="sticky-bottom">
        <div className="sticky-bottom-inner">
          <button className="btn btn-secondary" onClick={() => navigate(-1)}
            style={{ flexShrink: 0 }}>Cancel</button>
          <button className="btn btn-primary btn-full btn-lg"
            onClick={handleGenerate} disabled={saving}>
            {saving ? 'Saving...' : isEdit ? '💾 SAVE CHANGES' : '📄 GENERATE ESTIMATE'}
          </button>
        </div>
      </div>

      {/* ── Item Add/Edit Modal ── */}
      {showItemModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowItemModal(false)}>
          <div className="modal-box">
            <div className="modal-title">
              <span>{editingItemIdx !== null ? 'Edit Item' : 'Add Item'}</span>
              <button className="btn btn-ghost" onClick={() => setShowItemModal(false)}>✕</button>
            </div>

            {/* Product search */}
            <div className="field">
              <label>Product *</label>
              <div className="autocomplete-wrap">
                <input
                  ref={productInputRef}
                  value={productSearch}
                  onChange={e => { setProductSearch(e.target.value); setShowSuggestions(true) }}
                  onFocus={() => setShowSuggestions(productSuggestions.length > 0)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder="Type product name to search..."
                  autoComplete="off"
                />
                {showSuggestions && productSuggestions.length > 0 && (
                  <div className="autocomplete-list">
                    {productSuggestions.map(p => (
                      <div key={p.id} className="autocomplete-item"
                        onMouseDown={() => selectProduct(p)}>
                        <div style={{ fontWeight: 600 }}>{p.product_name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {p.unit} · ₹{p.rate} · {p.calculation_type}
                          {p.calculation_type === 'SQFT' && ` · ${p.length}×${p.width} ft`}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Show selected product details */}
            {itemForm.product_name_snapshot && (
              <div style={{ background: 'var(--accent-light)', border: '1px solid var(--accent)', borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: 13 }}>
                <strong>{itemForm.product_name_snapshot}</strong><br />
                {itemForm.unit_snapshot} · {itemForm.calculation_type_snapshot}
                {itemForm.calculation_type_snapshot === 'SQFT' &&
                  ` · ${itemForm.length_snapshot} × ${itemForm.width_snapshot} ft`}
              </div>
            )}

            {/* Nos (SQFT only) */}
            {itemForm.calculation_type_snapshot === 'SQFT' && (
              <div className="field">
                <label>Nos. (Number of Pieces) *</label>
                <input name="nos" type="number" inputMode="decimal"
                  value={itemForm.nos} onChange={handleItemChange}
                  placeholder="e.g. 10" autoFocus={false} />
                {itemForm.nos && itemForm.length_snapshot && itemForm.width_snapshot && (
                  <div style={{ fontSize: 13, color: 'var(--accent)', marginTop: 4, fontWeight: 600 }}>
                    {itemForm.length_snapshot} × {itemForm.width_snapshot} × {itemForm.nos}
                    = {(itemForm.length_snapshot * itemForm.width_snapshot * (parseFloat(itemForm.nos)||0)).toFixed(2)} {itemForm.unit_snapshot}
                  </div>
                )}
              </div>
            )}

            {/* Quantity (QUANTITY type) */}
            {itemForm.calculation_type_snapshot === 'QUANTITY' && (
              <div className="field">
                <label>Quantity ({itemForm.unit_snapshot || 'units'}) *</label>
                <input name="quantity" type="number" inputMode="decimal"
                  value={itemForm.quantity} onChange={handleItemChange}
                  placeholder="e.g. 5" />
              </div>
            )}

            {/* Rate */}
            <div className="field">
              <label>Rate (₹) *</label>
              <input name="rate" type="number" inputMode="decimal"
                value={itemForm.rate} onChange={handleItemChange}
                placeholder="0.00" />
            </div>

            {/* Calculated amount preview */}
            {itemForm.amount > 0 && (
              <div style={{ textAlign: 'right', fontSize: 20, fontWeight: 700, color: 'var(--accent)', marginBottom: 16 }}>
                Amount: ₹{Number(itemForm.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary btn-full" onClick={() => setShowItemModal(false)}>Cancel</button>
              <button className="btn btn-primary btn-full" onClick={saveItem}>
                {editingItemIdx !== null ? 'Update Item' : 'Add Item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {ToastEl}
    </div>
  )
}
