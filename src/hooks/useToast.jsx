import { useState, useCallback } from 'react'

export function useToast() {
  const [toast, setToast] = useState(null)

  const showToast = useCallback((message, type = 'success', duration = 2500) => {
    setToast({ message, type })
    setTimeout(() => setToast(null), duration)
  }, [])

  const ToastEl = toast ? (
    <div className={`toast ${toast.type}`}>{toast.message}</div>
  ) : null

  return { showToast, ToastEl }
}
