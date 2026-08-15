import { useEffect, useState } from 'react'
import { presenterFetch } from '../lib/api.js'

function formatValue(value) {
  return (value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// edição inline do valor/minuto direto na tela do reacts -- sem passar por
// Configurações. draft fica sincronizado com o valor do servidor até o
// apresentador começar a digitar, e só envia no Enter/clique de confirmar.
export function useReactMultiplierEditor(leilaoId, serverValue) {
  const [draft, setDraft] = useState(() => formatValue(serverValue))
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!dirty) setDraft(formatValue(serverValue))
  }, [serverValue, dirty])

  const handleChange = (value) => {
    setDirty(true)
    setDraft(value)
  }

  const commit = async () => {
    const amount = Number(String(draft).replace(',', '.'))
    if (!Number.isFinite(amount) || amount <= 0) {
      setDirty(false)
      setDraft(formatValue(serverValue))
      return
    }
    try {
      await presenterFetch(leilaoId, '/admin/reacts/multiplier', {
        method: 'POST',
        body: JSON.stringify({ amount }),
      })
      setDirty(false)
    } catch (err) {
      alert(err.message)
    }
  }

  return { draft, setDraft: handleChange, commit }
}
