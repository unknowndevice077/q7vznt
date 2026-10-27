const UK = 'Europe/London'

export const fmtMW = (v: number | null | undefined, digits = 0) =>
  v == null ? '–' : `${v.toLocaleString('en-GB', { maximumFractionDigits: digits })} MW`

export const fmtGWh = (mwh: number | null | undefined) =>
  mwh == null ? '–' : `${(mwh / 1000).toLocaleString('en-GB', { maximumFractionDigits: 1 })} GWh`

export const fmtPct = (v: number | null | undefined, digits = 1) =>
  v == null ? '–' : `${(v * 100).toFixed(digits)}%`

export const fmtSigned = (v: number | null | undefined) =>
  v == null ? '–' : `${v > 0 ? '+' : ''}${Math.round(v).toLocaleString('en-GB')} MW`

export const fmtDateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        timeZone: UK,
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '–'

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { timeZone: UK, hour: '2-digit', minute: '2-digit' })

export const fmtAxisDate = (ms: number) => {
  const d = new Date(ms)
  const day = d.toLocaleDateString('en-GB', { timeZone: UK, day: 'numeric', month: 'short' })
  return `${day} ${fmtTime(d.toISOString())}`
}

export const fmtGW = (mw: number) => `${+(mw / 1000).toFixed(1)} GW`

// y-axis ticks every 5 GW
export const gwAxis = (values: (number | null | undefined)[]) => {
  const max = Math.max(5000, ...values.filter((v): v is number => v != null))
  const top = Math.ceil(max / 5000) * 5000
  const ticks = Array.from({ length: top / 5000 + 1 }, (_, i) => i * 5000)
  return { domain: [0, top] as [number, number], ticks, tickFormatter: fmtGW }
}
