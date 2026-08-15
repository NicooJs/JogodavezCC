import { useCallback, useEffect, useRef, useState } from 'react'

// espelha isPresenterOwner/setPresenterMode/checkPresenterAccess do app.js
// vanilla -- sessão de admin é um cookie por leilão (requireLeilaoAdmin no
// server), não tem token pra guardar aqui, só o estado derivado dela.
export function usePresenterMode(leilaoId) {
  const [active, setActive] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const pendingAfterLogin = useRef(null)

  const checkAccess = useCallback(async () => {
    if (!leilaoId) return false
    try {
      const res = await fetch(`/api/l/${leilaoId}/admin/check-session`, { credentials: 'same-origin' })
      const { isPresenter, isOwner: owner } = await res.json()
      setIsOwner(!!owner)
      return !!isPresenter
    } catch {
      setIsOwner(false)
      return false
    }
  }, [leilaoId])

  useEffect(() => {
    checkAccess().then((isPresenter) => {
      if (isPresenter) setActive(true)
    })
  }, [checkAccess])

  const login = useCallback(
    async (password) => {
      const res = await fetch(`/api/l/${leilaoId}/admin/login`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Código incorreto ou expirado')
      }
      setActive(true)
      if (pendingAfterLogin.current) {
        const fn = pendingAfterLogin.current
        pendingAfterLogin.current = null
        fn()
      }
    },
    [leilaoId],
  )

  const logout = useCallback(async () => {
    await fetch(`/api/l/${leilaoId}/admin/logout`, { method: 'POST', credentials: 'same-origin' }).catch(() => {})
    setIsOwner(false)
    setActive(false)
  }, [leilaoId])

  const runAfterLogin = useCallback((fn) => {
    pendingAfterLogin.current = fn
  }, [])

  return { active, isOwner, checkAccess, login, logout, runAfterLogin }
}
