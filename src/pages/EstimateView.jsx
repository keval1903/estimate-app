import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../hooks/useToast.jsx'

export default function EstimateView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { showToast, ToastEl } = useToast()
  const [estimate, setEstimate] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState('')
  const [paperSize, setPaperSize] = useState('a5')
  const [layoutMode, setLayoutMode] = useState('full')
  const previewRef = useRef()

  useEffect(() => {
    async function load() {
      const { data: est } = await supabase
        .from('estimates').select('*').eq('id', id).single()
      const { data: eitems } = await supabase
        .from('estimate_items').select('*')
        .eq('estimate_id', id).order('serial_number')
      setEstimate(est)
      setItems(eitems || [])
      setLoading(false)
    }
    load()
  }, [id])

  function getFilename(ext) {
    const site = (estimate?.site_name || 'SITE').replace(/\s+/g, '-')
    return `Estimate-${estimate?.bill_number}-${site}.${ext}`
  }

  function getSummaryText() {
    return `Estimate No. ${estimate.bill_number}\nDate: ${estimate.bill_date}\nSite: ${estimate.site_name}${estimate.transport ? '\nTransport: ' + estimate.transport : ''}\nGrand Total: ₹${Number(estimate.grand_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
  }

  function handlePrint() {
    window.print()
  }

  async function handleSavePDF() {
    setExporting('pdf')
    try {
      const { default: jsPDF } = await import('jspdf')
      const { default: html2canvas } = await import('html2canvas')
      const el = previewRef.current
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#fff', scrollY: -window.scrollY })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: paperSize })
      const pdfW = pdf.internal.pageSize.getWidth()
      const pdfH = (canvas.height * pdfW) / canvas.width
      pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH)
      pdf.save(getFilename('pdf'))
      showToast('PDF saved ✓')
    } catch (e) {
      showToast('PDF failed: ' + e.message, 'error')
    }
    setExporting('')
  }

  async function handleSaveImage() {
    setExporting('img')
    try {
      const { default: html2canvas } = await import('html2canvas')
      const el = previewRef.current
      const canvas = await html2canvas(el, { scale: 3, useCORS: true, backgroundColor: '#fff', scrollY: -window.scrollY })
      const link = document.createElement('a')
      link.download = getFilename('png')
      link.href = canvas.toDataURL('image/png')
      link.click()
      showToast('Image saved ✓')
    } catch (e) {
      showToast('Image failed: ' + e.message, 'error')
    }
    setExporting('')
  }

  async function handleShare() {
    const text = getSummaryText()
    if (navigator.share) {
      try {
        await navigator.share({ title: `Estimate #${estimate.bill_number}`, text })
      } catch { }
    } else {
      try {
        await navigator.clipboard.writeText(text)
        showToast('Summary copied!')
      } catch {
        showToast('Copy failed', 'error')
      }
    }
  }

  async function handleWhatsApp() {
    const text = getSummaryText()
    // Try native share with image first (mobile)
    if (navigator.share && navigator.canShare) {
      try {
        const { default: html2canvas } = await import('html2canvas')
        const el = previewRef.current
        const canvas = await html2canvas(el, { scale: 3, useCORS: true, backgroundColor: '#fff', scrollY: -window.scrollY })
        canvas.toBlob(async (blob) => {
          const file = new File([blob], getFilename('png'), { type: 'image/png' })
          if (navigator.canShare({ files: [file] })) {
            // Windows native share often drops the 'text' field when passing to WhatsApp Desktop. 
            // We copy it to clipboard so the user can easily paste it as a caption.
            try { 
              await navigator.clipboard.writeText(text)
              showToast('Caption copied! Paste it in WhatsApp') 
            } catch(e) {}
            
            await navigator.share({ files: [file], title: `Estimate #${estimate.bill_number}`, text })
            return
          }
          // fallback to wa.me
          window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
        }, 'image/png')
        return
      } catch { }
    }
    // Desktop: open WhatsApp Web with text
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  if (loading) return <div className="app-container"><div className="spinner" /></div>
  if (!estimate) return (
    <div className="app-container">
      <div className="page"><p>Estimate not found.</p></div>
    </div>
  )

  const totalNos = Number(estimate.total_nos)
  const totalQty = Number(estimate.total_quantity)
  const grandTotal = Number(estimate.grand_total)

  return (
    <div className="app-container">
      {/* Nav */}
      <div className="top-nav no-print">
        <button className="nav-back" onClick={() => navigate('/estimates')}>←</button>
        <span className="nav-title">Bill #{estimate.bill_number}</span>
      </div>

      {/* Action buttons */}
      <div className="preview-actions no-print">
        <div style={{ display: 'inline-flex', gap: 8, marginRight: 'auto' }}>
          <select className="btn btn-secondary btn-sm" value={paperSize} onChange={e => setPaperSize(e.target.value)}>
            <option value="a4">Size: A4</option>
            <option value="a5">Size: A5</option>
          </select>
          <select className="btn btn-secondary btn-sm" value={layoutMode} onChange={e => setLayoutMode(e.target.value)}>
            <option value="full">Layout: Full</option>
            <option value="compact">Layout: Compact</option>
          </select>
        </div>
        
        <button className="btn btn-secondary btn-sm"
          onClick={() => navigate(`/estimate/edit/${id}`)}>✏️ Edit</button>
        <button className="btn btn-primary btn-sm"
          onClick={handlePrint}>🖨 Print</button>
        <button className="btn btn-secondary btn-sm"
          onClick={handleSavePDF} disabled={exporting === 'pdf'}>
          {exporting === 'pdf' ? '...' : '📄 PDF'}
        </button>
        <button className="btn btn-secondary btn-sm"
          onClick={handleSaveImage} disabled={exporting === 'img'}>
          {exporting === 'img' ? '...' : '🖼 Image'}
        </button>
        <button className="btn btn-secondary btn-sm"
          onClick={handleShare}>📤 Share</button>
        <button className="btn btn-whatsapp btn-sm"
          onClick={handleWhatsApp}>💬 WhatsApp</button>
      </div>

      {/* ── ESTIMATE PREVIEW ── */}
      <div id="print-area" style={{ padding: '0 8px 100px', background: 'var(--bg)' }}>
        <div id="estimate-preview" ref={previewRef}>
          <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid #000', fontFamily: 'Arial, sans-serif', fontSize: 13, color: '#000', background: '#fff' }}>
            <colgroup>
              <col style={{ width: 42 }} />     {/* Sr No */}
              <col style={{ width: 'auto' }} /> {/* Description */}
              <col style={{ width: 42 }} />     {/* Nos. */}
              <col style={{ width: 68 }} />     {/* Quantity */}
              <col style={{ width: 56 }} />     {/* Rate */}
              <col style={{ width: 76 }} />     {/* Amount */}
            </colgroup>
            <tbody>
              {/* Title row */}
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, letterSpacing: 2, padding: '6px 0', borderBottom: '1px solid #000' }}>
                  B I L L
                </td>
              </tr>

              {/* Meta details */}
              <tr>
                {/* Left side: Site & Transport */}
                <td colSpan={3} style={{ padding: '6px 10px', verticalAlign: 'top', borderBottom: '1px solid #000', borderRight: '1px solid #000' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <tbody>
                      {[
                        ['Site', estimate.site_name],
                        ['Transport', estimate.transport || ''],
                      ].map(([label, val]) => (
                        <tr key={label}>
                          <td style={{ width: 64, fontWeight: 600, paddingBottom: 2 }}>{label}</td>
                          <td style={{ width: 10, paddingBottom: 2 }}>:</td>
                          <td style={{ fontWeight: label === 'Site' ? 700 : 400, paddingBottom: 2 }}>{val}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </td>
                {/* Right side: Date & No. */}
                <td colSpan={3} style={{ padding: '6px 10px', verticalAlign: 'top', borderBottom: '1px solid #000' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <tbody>
                      {[
                        ['Date', estimate.bill_date],
                        ['No.', estimate.bill_number],
                      ].map(([label, val]) => (
                        <tr key={label}>
                          <td style={{ width: 44, fontWeight: 600, paddingBottom: 2 }}>{label}</td>
                          <td style={{ width: 10, paddingBottom: 2 }}>:</td>
                          <td style={{ fontWeight: 400, paddingBottom: 2 }}>{val}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </td>
              </tr>

              {/* Table header */}
              <tr style={{ background: '#f0f0f0' }}>
                {['Sr No', 'Description of Goods', 'Nos.', 'Quantity', 'Rate', 'Amount'].map((h, i) => (
                  <td key={h} style={{
                    border: '1px solid #000', padding: '6px 4px', fontWeight: 700,
                    textAlign: i === 1 ? 'left' : 'center',
                    fontSize: 12,
                    whiteSpace: 'nowrap',
                    width: i === 0 ? 42 : i === 1 ? 'auto' : i === 2 ? 42 : i === 3 ? 68 : i === 4 ? 56 : 76
                  }}>{h}</td>
                ))}
              </tr>

              {/* Items */}
              {items.map(it => (
                <tr key={it.id}>
                  <td style={{ border: '1px solid #000', padding: '8px 6px', textAlign: 'center', fontSize: 12 }}>{it.serial_number}</td>
                  <td style={{ border: '1px solid #000', padding: '8px 6px', fontSize: 12 }}>{it.product_name_snapshot}</td>
                  <td style={{ border: '1px solid #000', padding: '8px 6px', textAlign: 'center', fontSize: 12 }}>
                    {it.calculation_type_snapshot === 'SQFT' ? it.nos : ''}
                  </td>
                  <td style={{ border: '1px solid #000', padding: '8px 6px', textAlign: 'center', fontSize: 12 }}>
                    {it.quantity} {it.unit_snapshot}
                  </td>
                  <td style={{ border: '1px solid #000', padding: '8px 6px', textAlign: 'right', fontSize: 12 }}>
                    {Number(it.rate).toFixed(2)}
                  </td>
                  <td style={{ border: '1px solid #000', padding: '8px 6px', textAlign: 'right', fontSize: 12 }}>
                    {Number(it.amount).toFixed(2)}
                  </td>
                </tr>
              ))}

              {/* Empty padding rows */}
              {Array.from({ length: layoutMode === 'compact' ? 2 : Math.max(0, (paperSize === 'a5' ? 15 : 30) - items.length) }).map((_, i) => (
                <tr key={`empty-${i}`}>
                  <td style={{ border: '1px solid #000', height: 35 }}>&nbsp;</td>
                  <td style={{ border: '1px solid #000' }} />
                  <td style={{ border: '1px solid #000' }} />
                  <td style={{ border: '1px solid #000' }} />
                  <td style={{ border: '1px solid #000' }} />
                  <td style={{ border: '1px solid #000' }} />
                </tr>
              ))}

              {/* Totals row */}
              <tr style={{ background: '#f9f9f9', fontWeight: 700 }}>
                <td colSpan={2} style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center', fontSize: 13 }}>Total</td>
                <td style={{ border: '1px solid #000', padding: '6px 6px', textAlign: 'center', fontSize: 13 }}>
                  {totalNos % 1 === 0 ? totalNos : totalNos.toFixed(2)}
                </td>
                <td style={{ border: '1px solid #000', padding: '6px 6px', textAlign: 'center', fontSize: 13 }}>
                  {totalQty % 1 === 0 ? totalQty : totalQty.toFixed(2)}
                </td>
                <td style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'right', fontSize: 13, whiteSpace: 'nowrap' }}>Gr.Total</td>
                <td style={{ border: '1px solid #000', padding: '6px 6px', textAlign: 'right', fontSize: 14, fontWeight: 700 }}>
                  {grandTotal.toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Print CSS */}
      <style>{`
        @page {
          size: ${paperSize === 'a5' ? 'A5' : 'A4'} portrait;
          margin: 0;
        }
        @media print {
          .no-print, .toast { display: none !important; }
          html, body, #root, .app-container { 
            height: auto !important; 
            min-height: auto !important; 
            margin: 0 !important; 
            padding: 0 !important; 
            overflow: visible !important;
          }
          #print-area {
            padding: 0 !important;
            background: white !important;
            margin: 0 !important;
            box-sizing: border-box !important;
          }
          #estimate-preview {
            max-width: none !important;
            padding: 0 !important;
          }
          #estimate-preview table {
            width: 100% !important;
            table-layout: fixed !important;
          }
          #estimate-preview td {
            word-wrap: break-word !important;
            overflow-wrap: break-word !important;
          }
        }
      `}</style>

      {ToastEl}
    </div>
  )
}