import { useMemo, useState } from 'react'
import {
  CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps,
} from 'recharts'
import { api } from '../api'
import { HorizonSlider, Kpi, Panel, Status } from '../components/ui'
import { fmtAxisDate, fmtDateTime, fmtMW, fmtPct, fmtSigned, gwAxis } from '../format'
import { useApi, useDebounced } from '../hooks'

// January is GMT, so UK time == UTC here
const MIN = '2026-01-01T00:00'
const MAX = '2026-02-02T23:00'
const toIso = (local: string) => `${local}:00Z`

interface Row {
  t: number
  actual?: number
  forecast?: number
  publishTime?: string | null
  horizonH?: number | null
}

export default function MonitorView() {
  const [start, setStart] = useState('2026-01-10T00:00')
  const [end, setEnd] = useState('2026-01-17T00:00')
  const [horizon, setHorizon] = useState(4)
  const h = useDebounced(horizon)

  const valid = start < end
  const { data, error, loading } = useApi(
    () => (valid ? api.series(toIso(start), toIso(end), h) : Promise.reject(new Error('Start must be before end'))),
    [start, end, h],
  )

  const rows = useMemo<Row[]>(() => {
    if (!data) return []
    const byT = new Map<number, Row>()
    for (const a of data.actualsHalfHourly) byT.set(Date.parse(a.time), { t: Date.parse(a.time), actual: a.actual })
    for (const p of data.points) {
      const t = Date.parse(p.time)
      const row = byT.get(t) ?? { t }
      if (p.forecast != null) Object.assign(row, { forecast: p.forecast, publishTime: p.publishTime, horizonH: p.horizonH })
      byT.set(t, row)
    }
    return [...byT.values()].sort((a, b) => a.t - b.t)
  }, [data])

  const m = data?.metrics

  return (
    <div className="stack">
      <Panel
        title="Wind generation: actual vs forecast"
        subtitle={
          <>
            For each half-hour we show the <b>latest forecast that was already published {horizon}h before</b> it -
            exactly what a trader would have seen at that point.
          </>
        }
      >
        <div className="controls">
          <label className="field">
            <span>Start (UK time)</span>
            <input type="datetime-local" min={MIN} max={MAX} value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="field">
            <span>End (UK time)</span>
            <input type="datetime-local" min={MIN} max={MAX} value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <HorizonSlider value={horizon} onChange={setHorizon} />
          <div className="presets">
            {[0, 4, 12, 24, 36].map((v) => (
              <button key={v} className={v === horizon ? 'chip on' : 'chip'} onClick={() => setHorizon(v)}>
                {v}h
              </button>
            ))}
          </div>
        </div>

        <Status loading={loading && !data} error={error} />
        <div className={`chart-wrap ${loading ? 'dim' : ''}`}>
          <ResponsiveContainer width="100%" height={380}>
            <ComposedChart data={rows} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis
                dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']}
                tickFormatter={fmtAxisDate} stroke="var(--axis)" fontSize={12} minTickGap={60}
              />
              <YAxis {...gwAxis(rows.flatMap((r) => [r.actual, r.forecast]))} stroke="var(--axis)" fontSize={12} width={52} />
              <Tooltip content={<SeriesTooltip />} />
              <Legend verticalAlign="top" wrapperStyle={{ paddingBottom: 8 }} />
              <Line name="Actual (FUELHH)" dataKey="actual" stroke="var(--actual)" dot={false} strokeWidth={2} isAnimationActive={false} />
              <Line
                name={`Forecast @ ${horizon}h (WINDFOR)`} dataKey="forecast" stroke="var(--forecast)"
                dot={false} strokeWidth={2} connectNulls isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      {m && (
        <div className="kpis">
          <Kpi label="Mean absolute error" value={fmtMW(m.mae)} hint={`${fmtPct(m.nmae)} of mean output`} />
          <Kpi label="RMSE" value={fmtMW(m.rmse)} hint="penalises big misses" />
          <Kpi
            label="Bias (forecast − actual)" value={fmtSigned(m.bias)}
            tone={m.bias != null && Math.abs(m.bias) > 500 ? 'warn' : undefined}
            hint={m.bias != null && m.bias > 0 ? 'forecast runs high' : 'forecast runs low'}
          />
          <Kpi label="P90 absolute error" value={fmtMW(m.p90AbsError)} hint="9 in 10 hours are within this" />
          <Kpi label="Worst miss" value={fmtMW(m.maxAbsError)} />
          <Kpi label="Hours compared" value={m.n.toLocaleString()} hint={data!.missingForecasts ? `${data!.missingForecasts} with no forecast in range` : 'full coverage'} />
        </div>
      )}
    </div>
  )
}

function SeriesTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  const r: Row = payload[0].payload
  const err = r.forecast != null && r.actual != null ? r.forecast - r.actual : null
  return (
    <div className="tooltip">
      <strong>{fmtDateTime(new Date(r.t).toISOString())}</strong>
      <div><i className="dot actual" /> Actual {fmtMW(r.actual)}</div>
      {r.forecast != null && (
        <>
          <div><i className="dot forecast" /> Forecast {fmtMW(r.forecast)}</div>
          <div className="muted">Error {fmtSigned(err)}</div>
          <div className="muted">Published {fmtDateTime(r.publishTime)} ({r.horizonH}h ahead)</div>
        </>
      )}
    </div>
  )
}
