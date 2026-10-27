import { useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { api, type HorizonRow } from '../api'
import { HorizonSlider, Kpi, Panel, Status } from '../components/ui'
import { fmtMW, fmtPct, fmtSigned } from '../format'
import { useApi, useDebounced } from '../hooks'

const START = '2026-01-01T00:00:00Z'
const END = '2026-02-03T00:00:00Z'
const kMW = (v: number) => `${(v / 1000).toFixed(1)}k`

export default function AccuracyView() {
  const [horizon, setHorizon] = useState(24)
  const h = useDebounced(horizon)

  const hz = useApi(() => api.byHorizon(START, END), [])
  const dist = useApi(() => api.distribution(START, END, h), [h])
  const hour = useApi(() => api.byHour(START, END, h), [h])
  const level = useApi(() => api.byLevel(START, END, h), [h])

  const at = (x: number): HorizonRow | undefined => hz.data?.find((r) => r.horizonH === x)
  const h1 = at(1)
  const h24 = at(24)
  const sel = at(Math.min(h, 47))

  return (
    <div className="stack">
      <div className="kpis">
        <Kpi label="MAE, 1h ahead" value={fmtMW(h1?.mae)} hint={`${fmtPct(h1?.nmae)} of mean output`} />
        <Kpi label="MAE, 24h ahead" value={fmtMW(h24?.mae)} hint={`${fmtPct(h24?.nmae)} of mean output`} />
        <Kpi
          label="Systematic bias @ 24h" value={fmtSigned(h24?.bias)} tone="warn"
          hint={`over-forecast in ${fmtPct(h24?.overForecastShare, 0)} of hours`}
        />
        <Kpi label="R² @ 24h" value={h24?.r2?.toFixed(2) ?? '–'} hint="1.0 = perfect" />
      </div>

      <Panel
        title="How error grows with forecast horizon"
        subtitle="January 2026, all hours. Error = forecast − actual. Positive bias means the forecast promised more wind than turned up."
      >
        <Status loading={hz.loading} error={hz.error} />
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={hz.data ?? []} margin={{ top: 10, right: 16, bottom: 10, left: 0 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="horizonH" stroke="var(--axis)" fontSize={12} tickFormatter={(v) => `${v}h`} />
            <YAxis stroke="var(--axis)" fontSize={12} tickFormatter={kMW} width={44} />
            <Tooltip formatter={(v: number) => fmtMW(v)} labelFormatter={(l) => `${l}h ahead`} />
            <Legend verticalAlign="top" wrapperStyle={{ paddingBottom: 8 }} />
            <ReferenceLine x={h} stroke="var(--axis)" strokeDasharray="3 3" />
            <Line name="MAE" dataKey="mae" stroke="var(--forecast)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line name="RMSE" dataKey="rmse" stroke="var(--actual)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line name="Bias" dataKey="bias" stroke="var(--warn)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line name="P90 |error|" dataKey="p90AbsError" stroke="var(--muted-line)" strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      <Panel
        title="Drill into one horizon"
        subtitle={sel ? `At ${h}h: MAE ${fmtMW(sel.mae)}, 80% of errors between ${fmtSigned(sel.errP10)} and ${fmtSigned(sel.errP90)}` : undefined}
        actions={<HorizonSlider value={horizon} onChange={setHorizon} max={47} />}
      >
        <div className="grid-2">
          <div>
            <h3>Error distribution</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dist.data?.bins ?? []} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="from" stroke="var(--axis)" fontSize={11} tickFormatter={kMW} />
                <YAxis stroke="var(--axis)" fontSize={11} width={36} />
                <Tooltip
                  formatter={(v: number) => [`${v} hours`, 'count']}
                  labelFormatter={(l: number) => `${fmtSigned(l)} to ${fmtSigned(l + (dist.data?.binWidth ?? 0))}`}
                />
                <ReferenceLine x={0} stroke="var(--axis)" />
                <Bar dataKey="count" isAnimationActive={false}>
                  {(dist.data?.bins ?? []).map((b) => (
                    <Cell key={b.from} fill={b.from >= 0 ? 'var(--warn)' : 'var(--actual)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="legend-note"><i className="dot warn" /> over-forecast (short risk) <i className="dot actual" /> under-forecast (long risk)</p>
          </div>

          <div>
            <h3>Bias by forecast wind level</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={level.data ?? []} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="from" stroke="var(--axis)" fontSize={11} tickFormatter={(v) => `${v / 1000}+ GW`} />
                <YAxis stroke="var(--axis)" fontSize={11} tickFormatter={kMW} width={40} />
                <Tooltip
                  formatter={(v: number, name) => [name === 'n' ? v : fmtSigned(v), name]}
                  labelFormatter={(l: number) => `Forecast ${l / 1000}-${l / 1000 + 2.5} GW`}
                />
                <Legend verticalAlign="top" height={24} />
                <Bar name="bias" dataKey="bias" fill="var(--warn)" isAnimationActive={false} />
                <Bar name="MAE" dataKey="mae" fill="var(--forecast)" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
            <p className="legend-note">High-wind forecasts overshoot most - likely curtailment (constraint actions) cutting metered output.</p>
          </div>
        </div>

        <h3>MAE by hour of day (UK)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={hour.data ?? []} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="hour" stroke="var(--axis)" fontSize={11} tickFormatter={(v) => `${String(v).padStart(2, '0')}:00`} />
            <YAxis stroke="var(--axis)" fontSize={11} tickFormatter={kMW} width={40} />
            <Tooltip formatter={(v: number) => fmtMW(v)} labelFormatter={(l) => `${String(l).padStart(2, '0')}:00`} />
            <Bar name="MAE" dataKey="mae" fill="var(--forecast)" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  )
}
