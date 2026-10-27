import { useMemo, useState } from 'react'
import {
  Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps,
} from 'recharts'
import { api } from '../api'
import { Kpi, Panel, Status } from '../components/ui'
import { fmtDateTime, fmtGWh, gwAxis, fmtMW, fmtPct, fmtSigned, fmtTime } from '../format'
import { useApi } from '../hooks'

export default function DayAheadView() {
  const [day, setDay] = useState('2026-01-15')
  const [gateHour, setGateHour] = useState(11)
  const [reveal, setReveal] = useState(true)

  const { data, error, loading } = useApi(() => api.dayAhead(day, gateHour), [day, gateHour])

  const rows = useMemo(
    () =>
      data?.points.map((p) => ({
        t: Date.parse(p.time),
        forecast: p.forecast,
        actual: reveal ? p.actual : null,
        band: p.p10 != null && p.p90 != null ? [p.p10, p.p90] : null,
        p10: p.p10,
        p90: p.p90,
        horizonH: p.horizonH,
      })) ?? [],
    [data, reveal],
  )

  const s = data?.summary
  const band = data?.band

  return (
    <div className="stack">
      <Panel
        title="Day-ahead decision view"
        subtitle={
          <>
            What the desk sees at the GB day-ahead auction gate: the latest wind forecast published before{' '}
            <b>{String(gateHour).padStart(2, '0')}:00 UK on D-1</b>, with an uncertainty band built only from errors
            already observed by then.
          </>
        }
      >
        <div className="controls">
          <label className="field">
            <span>Delivery day</span>
            <input type="date" min="2026-01-02" max="2026-02-01" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
          </label>
          <label className="field">
            <span>Gate closure (UK, D-1)</span>
            <select value={gateHour} onChange={(e) => setGateHour(Number(e.target.value))}>
              {[9, 10, 11, 12, 14, 16].map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00{h === 11 ? ' - N2EX/EPEX auction' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={reveal} onChange={(e) => setReveal(e.target.checked)} />
            <span>Show what actually happened</span>
          </label>
        </div>

        <Status loading={loading && !data} error={error} />
        {data && (
          <p className="gate-note">
            Gate closure <b>{fmtDateTime(data.gateClosure)}</b> · forecast run used:{' '}
            <b>{data.forecastRunsUsed.map(fmtDateTime).join(', ') || 'none'}</b>
            {band && (
              <>
                {' '}· lead time {band.horizonRange[0]}-{band.horizonRange[1]}h
              </>
            )}
          </p>
        )}

        <div className={`chart-wrap ${loading ? 'dim' : ''}`}>
          <ResponsiveContainer width="100%" height={360}>
            <ComposedChart data={rows} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis
                dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']}
                tickFormatter={(ms) => fmtTime(new Date(ms).toISOString())} stroke="var(--axis)" fontSize={12}
              />
              <YAxis {...gwAxis(rows.flatMap((r) => [r.actual, r.forecast, r.p90]))} stroke="var(--axis)" fontSize={12} width={52} />
              <Tooltip content={<DATooltip />} />
              <Legend verticalAlign="top" wrapperStyle={{ paddingBottom: 8 }} />
              <Area name="P10-P90 range" dataKey="band" stroke="none" legendType="square" fill="var(--band)" isAnimationActive={false} />
              <Line name="Forecast at gate" dataKey="forecast" stroke="var(--forecast)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line name="P10 (firm wind)" dataKey="p10" stroke="var(--firm)" strokeDasharray="5 4" dot={false} isAnimationActive={false} />
              {reveal && (
                <Line name="Actual" dataKey="actual" stroke="var(--actual)" strokeWidth={2} dot={false} isAnimationActive={false} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      {s && (
        <div className="kpis">
          <Kpi label="Forecast wind energy" value={fmtGWh(s.forecastEnergyMWh)} hint={`${s.hoursCovered}h covered`} />
          <Kpi
            label="Firm wind (P10)" value={fmtGWh(s.p10EnergyMWh)}
            hint="you get at least this ~90% of the time" tone="good"
          />
          <Kpi
            label="Risk gap to cover"
            value={s.p10EnergyMWh != null ? fmtGWh(s.forecastEnergyMWh - s.p10EnergyMWh) : '–'}
            hint="extra buying if you plan on P10 instead of the raw forecast" tone="warn"
          />
          {reveal && s.actualEnergyMWh != null && (
            <>
              <Kpi
                label="Actual wind energy" value={fmtGWh(s.actualEnergyMWh)}
                hint={`forecast missed by ${fmtGWh(s.forecastEnergyMWh - s.actualEnergyMWh)}`}
              />
              <Kpi label="Hourly MAE" value={fmtMW(s.metrics?.mae)} hint={`bias ${fmtSigned(s.metrics?.bias)}`} />
              <Kpi
                label="Hours inside P10-P90"
                value={fmtPct(s.bandHitRate, 0)}
                hint="target ≈ 80%"
                tone={s.bandHitRate != null && s.bandHitRate < 0.6 ? 'bad' : undefined}
              />
            </>
          )}
        </div>
      )}

      {band && (
        <p className="footnote">
          Band from {band.samples.toLocaleString()} historical errors at the same lead times
          ({band.calibration === 'out-of-sample'
            ? 'only errors observable before the gate - no hindsight'
            : 'early January has too little history, so the whole month is used - treat as indicative'}).
          Error P10 / P50 / P90: {fmtSigned(band.errP10)} / {fmtSigned(band.errP50)} / {fmtSigned(band.errP90)}.
        </p>
      )}
    </div>
  )
}

function DATooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  const r = payload[0].payload
  return (
    <div className="tooltip">
      <strong>{fmtDateTime(new Date(r.t).toISOString())}</strong>
      <div><i className="dot forecast" /> Forecast {fmtMW(r.forecast)} ({r.horizonH}h ahead)</div>
      {r.p10 != null && <div className="muted">Range {fmtMW(r.p10)} - {fmtMW(r.p90)}</div>}
      {r.actual != null && <div><i className="dot actual" /> Actual {fmtMW(r.actual)}</div>}
    </div>
  )
}
