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

const EMPTY_PRODUCT_FORM = {
  product_name: '', length: '', width: '',
  unit: '', rate: '', calculation_type: 'QUANTITY'
}
const UNITS = ['Sq.Ft', 'Nos.', 'Kg.', 'Bundle', 'Rmt', 'Ltr', 'Pkt', 'Box', 'Set', 'Pair']

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
  const [suggestionIdx, setSuggestionIdx] = useState(-1)
  const [allProducts, setAllProducts] = useState([])

  // new product state
  const [showProductModal, setShowProductModal] = useState(false)
  const [productForm, setProductForm] = useState(EMPTY_PRODUCT_FORM)
  const [savingProduct, setSavingProduct] = useState(false)

  // site autocomplete
  const [siteSuggestions, setSiteSuggestions] = useState([])
  const [showSiteSuggestions, setShowSiteSuggestions] = useState(false)
  const [allSites, setAllSites] = useState([])

  const productInputRef = useRef()
  const siteInputRef = useRef()
  const nosInputRef = useRef()
  const qtyInputRef = useRef()

  // ── Load products & sites ──
  useEffect(() => {
    supabase.from('products').select('*').order('product_name')
      .then(({ data }) => setAllProducts(data || []))
    supabase.from('sites').select('*').order('site_name')
      .then(({ data }) => setAllSites(data || []))
  }, [])

  const draftKey = isEdit ? `estimate_draft_${id}` : 'estimate_draft_new'

  // ── Load existing estimate or draft ──
  useEffect(() => {
    async function load() {
      let parsedDraft = null
      const savedDraft = localStorage.getItem(draftKey)
      if (savedDraft) {
        try { parsedDraft = JSON.parse(savedDraft) } catch (e) {}
      }

      if (isEdit) {
        setLoading(true)
        const { data: est, error } = await supabase
          .from('estimates').select('*').eq('id', id).single()
        if (error || !est) { showToast('Estimate not found', 'error'); navigate('/estimates'); return }
        
        if (parsedDraft) {
          setBillDate(parsedDraft.billDate)
          setTransport(parsedDraft.transport || '')
          setSiteName(parsedDraft.siteName || '')
          setItems(parsedDraft.items || [])
          setTimeout(() => showToast('Unsaved draft restored'), 500)
        } else {
          setBillDate(est.bill_date)
          setTransport(est.transport || '')
          setSiteName(est.site_name || '')
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
        }
        setExistingBillNumber(est.bill_number)
        setLoading(false)
      } else {
        if (parsedDraft) {
          setBillDate(parsedDraft.billDate)
          setTransport(parsedDraft.transport || '')
          setSiteName(parsedDraft.siteName || '')
          setItems(parsedDraft.items || [])
          setTimeout(() => showToast('Unsaved draft restored'), 500)
        }
        setLoading(false)
      }
    }
    load()
  }, [id])

  // ── Auto-save draft ──
  useEffect(() => {
    if (loading) return // don't save while initial load is happening
    const draft = { billDate, transport, siteName, items }
    localStorage.setItem(draftKey, JSON.stringify(draft))
  }, [billDate, transport, siteName, items, draftKey, loading])

  // ── Recalc totals when items change ──
  useEffect(() => { setTotals(calcTotals(items)) }, [items])

  // ── Product search ──
  useEffect(() => {
    const q = productSearch.trim().toLowerCase()
    if (!q) { setProductSuggestions([]); setSuggestionIdx(-1); return }
    const results = allProducts.filter(p =>
      p.product_name.toLowerCase().includes(q)
    ).slice(0, 8)
    setProductSuggestions(results)
    setShowSuggestions(results.length > 0)
    setSuggestionIdx(-1)
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
        stock_quantity: p.stock_quantity ?? null,
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
    setSuggestionIdx(-1)

    setTimeout(() => {
      if (p.calculation_type === 'SQFT') nosInputRef.current?.focus()
      else qtyInputRef.current?.focus()
    }, 50)
  }

  function handleProductKeyDown(e) {
    if (!showSuggestions || productSuggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSuggestionIdx(prev => (prev < productSuggestions.length - 1 ? prev + 1 : prev))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSuggestionIdx(prev => (prev > 0 ? prev - 1 : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (suggestionIdx >= 0 && suggestionIdx < productSuggestions.length) {
        selectProduct(productSuggestions[suggestionIdx])
      } else {
        selectProduct(productSuggestions[0])
      }
    }
  }

  function handleInputKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveItem()
    }
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

  // ── Create New Product ──
  function handleProductFormChange(e) {
    const { name, value } = e.target
    setProductForm(f => {
      const next = { ...f, [name]: value }
      if (name === 'unit') next.calculation_type = value === 'Sq.Ft' ? 'SQFT' : 'QUANTITY'
      if (name === 'calculation_type' && value === 'QUANTITY') { next.length = ''; next.width = '' }
      return next
    })
  }

  function validateProduct() {
    if (!productForm.product_name.trim()) return 'Product name is required'
    if (!productForm.unit.trim()) return 'Unit is required'
    if (!productForm.rate || isNaN(productForm.rate) || Number(productForm.rate) < 0) return 'Valid rate is required'
    if (productForm.calculation_type === 'SQFT') {
      if (!productForm.length || isNaN(productForm.length)) return 'Length required for Sq.Ft products'
      if (!productForm.width  || isNaN(productForm.width))  return 'Width required for Sq.Ft products'
    }
    return null
  }

  async function handleProductSave() {
    const err = validateProduct()
    if (err) { showToast(err, 'error'); return }
    setSavingProduct(true)
    const payload = {
      product_name: productForm.product_name.trim().toUpperCase(),
      unit: productForm.unit.trim(), rate: Number(productForm.rate),
      calculation_type: productForm.calculation_type,
      length: productForm.calculation_type === 'SQFT' ? Number(productForm.length) : null,
      width:  productForm.calculation_type === 'SQFT' ? Number(productForm.width)  : null,
      updated_at: new Date().toISOString()
    }
    
    const { data, error } = await supabase.from('products').insert(payload).select().single()
    setSavingProduct(false)
    if (error) { showToast('Save failed: ' + error.message, 'error'); return }
    
    showToast('Product added ✓')
    setAllProducts(prev => {
      const next = [...prev, data]
      next.sort((a,b) => a.product_name.localeCompare(b.product_name))
      return next
    })
    setShowProductModal(false)
    selectProduct(data)
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
        localStorage.removeItem(draftKey) // clear draft on success
        // Adjust stock for tracked products (deduct difference)
        for (const it of newItems) {
          if (!it.product_id) continue
          const product = allProducts.find(p => p.id === it.product_id)
          if (!product || product.stock_quantity === null || product.stock_quantity === undefined) continue
          // find original quantity for this product in old estimate
          const origItem = (await supabase.from('estimate_items').select('quantity')
            .eq('estimate_id', id).eq('product_id', it.product_id).single())?.data
          const origQty = parseFloat(origItem?.quantity) || 0
          const newQty = parseFloat(it.quantity) || 0
          const diff = newQty - origQty
          if (diff === 0) continue
          const newStock = Number(product.stock_quantity) - diff
          await supabase.from('products').update({ stock_quantity: newStock }).eq('id', product.id)
          if (diff > 0) {
            await supabase.from('stock_ledger').insert({
              product_id: product.id, product_name: product.product_name,
              action: 'ESTIMATE', quantity: diff,
              estimate_id: id, bill_number: existingBillNumber,
              site_name: siteName.trim().toUpperCase(),
              note: `Bill #${existingBillNumber} (edited)`
            })
          }
        }        
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
        localStorage.removeItem(draftKey) // clear draft on success
        // Deduct stock for tracked products
        for (const it of newItems) {
          if (!it.product_id) continue
          const product = allProducts.find(p => p.id === it.product_id)
          if (!product || product.stock_quantity === null || product.stock_quantity === undefined) continue
          const deduct = parseFloat(it.quantity) || 0
          const newStock = Number(product.stock_quantity) - deduct
          await supabase.from('products').update({ stock_quantity: newStock }).eq('id', product.id)
          await supabase.from('stock_ledger').insert({
            product_id: product.id,
            product_name: product.product_name,
            action: 'ESTIMATE',
            quantity: deduct,
            estimate_id: est.id,
            bill_number: billNumber,
            site_name: siteName.trim().toUpperCase(),
            note: `Bill #${billNumber}`
          })
        }        
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 24 }}>
          <span className="section-label" style={{ margin: 0 }}>{items.length} Item{items.length !== 1 ? 's' : ''}</span>
          <button className="btn btn-primary btn-sm" onClick={openAddItem}>+ ADD ITEM</button>
        </div>

        {items.length === 0 ? (
          <div className="empty-state" style={{ padding: '28px 20px' }}>
            <div className="empty-icon">📋</div>
            <p>No items yet. Tap + ADD ITEM to begin.</p>
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
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <div className="autocomplete-wrap" style={{ flex: 1 }}>
                  <input
                    ref={productInputRef}
                    value={productSearch}
                    onChange={e => { setProductSearch(e.target.value); setShowSuggestions(true) }}
                    onKeyDown={handleProductKeyDown}
                    onFocus={() => setShowSuggestions(productSuggestions.length > 0)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    placeholder="Type product name to search..."
                    autoComplete="off"
                  />
                  {showSuggestions && productSuggestions.length > 0 && (
                    <div className="autocomplete-list">
                      {productSuggestions.map((p, i) => (
                        <div key={p.id} className="autocomplete-item"
                          style={suggestionIdx === i ? { background: 'var(--bg)', borderLeft: '3px solid var(--accent)' } : {}}
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
                <button type="button" className="btn btn-secondary" style={{ padding: '0 12px', height: '42px', flexShrink: 0 }} onClick={() => {
                  setProductForm({ ...EMPTY_PRODUCT_FORM, product_name: productSearch })
                  setShowProductModal(true)
                }}>+ New</button>
              </div>
            </div>

            {/* Show selected product details */}
            {itemForm.product_name_snapshot && (
              <div style={{ background: 'var(--accent-light)', border: '1px solid var(--accent)', borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: 13 }}>
                <strong>{itemForm.product_name_snapshot}</strong><br />
                {itemForm.unit_snapshot} · {itemForm.calculation_type_snapshot}
                {itemForm.calculation_type_snapshot === 'SQFT' &&
                  ` · ${itemForm.length_snapshot} × ${itemForm.width_snapshot} ft`}
                {itemForm.stock_quantity !== null && itemForm.stock_quantity !== undefined && (
                  <div style={{ marginTop: 6, fontWeight: 700,
                    color: itemForm.stock_quantity <= 0 ? '#c0392b' : itemForm.stock_quantity < 10 ? '#e67e22' : '#1a5c2a' }}>
                    📦 Stock: {itemForm.stock_quantity} {itemForm.unit_snapshot}
                    {itemForm.stock_quantity <= 0 ? ' — Out of stock!' : itemForm.stock_quantity < 10 ? ' — Low stock!' : ''}
                  </div>
                )}                  
              </div>
            )}

            {/* Nos (SQFT only) */}
            {itemForm.calculation_type_snapshot === 'SQFT' && (
              <div className="field">
                <label>Nos. (Number of Pieces) *</label>
                <input name="nos" type="number" inputMode="decimal"
                  ref={nosInputRef}
                  value={itemForm.nos} onChange={handleItemChange}
                  onKeyDown={handleInputKeyDown}
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
                  ref={qtyInputRef}
                  value={itemForm.quantity} onChange={handleItemChange}
                  onKeyDown={handleInputKeyDown}
                  placeholder="e.g. 5" />
              </div>
            )}

            {/* Rate */}
            <div className="field">
              <label>Rate (₹) *</label>
              <input name="rate" type="number" inputMode="decimal"
                value={itemForm.rate} onChange={handleItemChange}
                onKeyDown={handleInputKeyDown}
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

      {/* ── Create Product Modal ── */}
      {showProductModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowProductModal(false)} style={{ zIndex: 1100 }}>
          <div className="modal-box">
            <div className="modal-title">
              <span>Add New Product</span>
              <button className="btn btn-ghost" onClick={() => setShowProductModal(false)}>✕</button>
            </div>
            <div className="field">
              <label>Product Name *</label>
              <input name="product_name" value={productForm.product_name} onChange={handleProductFormChange}
                placeholder="e.g. C PLY 4 18 MM 7 x 4" style={{ textTransform: 'uppercase' }} />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Unit *</label>
                <select name="unit" value={productForm.unit} onChange={handleProductFormChange}>
                  <option value="">Select unit</option>
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Calculation Type *</label>
                <select name="calculation_type" value={productForm.calculation_type} onChange={handleProductFormChange}>
                  <option value="QUANTITY">QUANTITY</option>
                  <option value="SQFT">SQFT</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label>Rate (₹) *</label>
              <input name="rate" type="number" inputMode="decimal"
                value={productForm.rate} onChange={handleProductFormChange} placeholder="0.00" />
            </div>
            {productForm.calculation_type === 'SQFT' && (
              <div className="field-row">
                <div className="field">
                  <label>Length (ft) *</label>
                  <input name="length" type="number" inputMode="decimal"
                    value={productForm.length} onChange={handleProductFormChange} placeholder="e.g. 7" />
                </div>
                <div className="field">
                  <label>Width (ft) *</label>
                  <input name="width" type="number" inputMode="decimal"
                    value={productForm.width} onChange={handleProductFormChange} placeholder="e.g. 4" />
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button className="btn btn-secondary btn-full" onClick={() => setShowProductModal(false)}>Cancel</button>
              <button className="btn btn-primary btn-full" onClick={handleProductSave} disabled={savingProduct}>
                {savingProduct ? 'Saving...' : 'Add Product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {ToastEl}
    </div>
  )
}
