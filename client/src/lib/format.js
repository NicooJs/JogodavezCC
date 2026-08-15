export function formatBRL(value) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function initial(name) {
  return ((name || '?')[0] || '?').toUpperCase()
}
