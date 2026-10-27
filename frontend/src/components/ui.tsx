import type { ReactNode } from 'react'

export function Panel({ title, subtitle, actions, children }: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        {actions && <div className="panel-actions">{actions}</div>}
      </header>
      {children}
    </section>
  )
}

export function Kpi({ label, value, hint, tone }: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'good' | 'warn' | 'bad'
}) {
  return (
    <div className={`kpi ${tone ?? ''}`}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {hint && <span className="kpi-hint">{hint}</span>}
    </div>
  )
}

export function Status({ loading, error }: { loading: boolean; error: string | null }) {
  if (error) return <div className="status error">Couldn't load data: {error}</div>
  if (loading) return <div className="status">Loading…</div>
  return null
}

export function HorizonSlider({ value, onChange, max = 48 }: {
  value: number
  onChange: (v: number) => void
  max?: number
}) {
  return (
    <label className="field horizon">
      <span>
        Forecast horizon <strong>{value}h</strong>
      </span>
      <input type="range" min={0} max={max} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="range-ticks">
        <span>0h</span>
        <span>24h</span>
        <span>{max}h</span>
      </span>
    </label>
  )
}
