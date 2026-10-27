export interface Metrics {
  n: number
  mae: number | null
  rmse: number | null
  bias: number | null
  nmae: number | null
  r2: number | null
  p50AbsError: number | null
  p90AbsError: number | null
  p99AbsError: number | null
  maxAbsError: number | null
  errP10: number | null
  errP90: number | null
  overForecastShare: number | null
  meanActual: number | null
}

export interface Meta {
  source: 'snapshot' | 'live'
  loadedAt: string
  maxHorizonH: number
  gateHourUK: number
  targetFrom: string
  targetTo: string
  publishFrom: string
  publishTo: string
  forecastRuns: number
  actualPoints: number
}

export interface SeriesPoint {
  time: string
  actual: number
  forecast: number | null
  publishTime: string | null
  horizonH: number | null
  error: number | null
}

export interface SeriesResponse {
  horizonH: number
  points: SeriesPoint[]
  actualsHalfHourly: { time: string; actual: number }[]
  metrics: Metrics
  missingForecasts: number
}

export type HorizonRow = Metrics & { horizonH: number }
export type HourRow = Metrics & { hour: number }
export type LevelRow = Metrics & { from: number; to: number }

export interface Distribution {
  horizonH: number
  binWidth: number
  bins: { from: number; to: number; count: number }[]
}

export interface DayAheadPoint {
  time: string
  actual: number | null
  forecast: number | null
  publishTime: string | null
  horizonH: number | null
  p10?: number
  p90?: number
}

export interface DayAheadResponse {
  deliveryDay: string
  gateClosure: string
  forecastRunsUsed: string[]
  band: {
    errP10: number
    errP50: number
    errP90: number
    samples: number
    calibration: 'out-of-sample' | 'in-sample'
    horizonRange: [number, number]
  } | null
  points: DayAheadPoint[]
  summary: {
    forecastEnergyMWh: number
    p10EnergyMWh: number | null
    p90EnergyMWh: number | null
    hoursCovered: number
    actualEnergyMWh?: number
    metrics?: Metrics
    bandHitRate?: number
  }
}

const BASE = import.meta.env.VITE_API_URL ?? ''

async function get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))
  const res = await fetch(`${BASE}${path}${qs.size ? `?${qs}` : ''}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ? JSON.stringify(body.detail) : `${res.status} ${res.statusText}`)
  }
  return res.json()
}

export const api = {
  meta: () => get<Meta>('/api/meta'),
  series: (start: string, end: string, horizon: number) => get<SeriesResponse>('/api/series', { start, end, horizon }),
  byHorizon: (start: string, end: string) => get<HorizonRow[]>('/api/accuracy/horizon', { start, end }),
  byHour: (start: string, end: string, horizon: number) => get<HourRow[]>('/api/accuracy/hour', { start, end, horizon }),
  byLevel: (start: string, end: string, horizon: number) => get<LevelRow[]>('/api/accuracy/level', { start, end, horizon }),
  distribution: (start: string, end: string, horizon: number) =>
    get<Distribution>('/api/accuracy/distribution', { start, end, horizon }),
  dayAhead: (day: string, gateHour: number) => get<DayAheadResponse>('/api/day-ahead', { day, gate_hour: gateHour }),
}
