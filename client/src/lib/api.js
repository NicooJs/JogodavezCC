// espelha presenterFetch do app.js vanilla -- mesmo padrão de credentials,
// FormData sem Content-Type fixo, e erro lido do corpo JSON quando falha.
export async function presenterFetch(leilaoId, path, options = {}) {
  const isFormData = options.body instanceof FormData
  const res = await fetch(`/api/l/${leilaoId}${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Erro ${res.status}`)
  }
  return res.status === 204 ? null : res.json()
}

// mesma coisa, mas pra rotas de conta (/api/perfil/*, sem leilaoId --
// espelha perfilFetch do perfil.js vanilla)
export async function perfilFetch(path, options = {}) {
  const isFormData = options.body instanceof FormData
  const res = await fetch(`/api/perfil${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Erro ${res.status}`)
  }
  return res.status === 204 ? null : res.json()
}
