import { useEffect, useState } from 'react'
import { api } from './api'
import { fmtDateTime } from './format'
import { useApi } from './hooks'
import AccuracyView from './views/AccuracyView'
import DayAheadView from './views/DayAheadView'
import MonitorView from './views/MonitorView'

const TABS = [
  { id: 'dayahead', label: 'Day-ahead decision', el: <DayAheadView /> },
  { id: 'monitor', label: 'Forecast monitor', el: <MonitorView /> },
  { id: 'accuracy', label: 'Accuracy analysis', el: <AccuracyView /> },
] as const

type TabId = (typeof TABS)[number]['id']

const initialTab = (): TabId => {
  const h = window.location.hash.slice(1)
  return (TABS.find((t) => t.id === h)?.id ?? 'dayahead') as TabId
}

export default function App() {
  const [tab, setTab] = useState<TabId>(initialTab)
  const meta = useApi(api.meta, [])

  useEffect(() => {
    const onHash = () => setTab(initialTab())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const pick = (id: TabId) => {
    setTab(id)
    window.history.replaceState(null, '', `#${id}`)
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
            <circle cx="12" cy="9" r="1.6" fill="currentColor" />
            <path d="M12 9 L12 2.5 M12 9 L6.4 12.2 M12 9 L17.6 12.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M12 10.5 L11 22 H13 Z" fill="currentColor" />
          </svg>
          <div>
            <h1>WindDesk</h1>
            <span>GB wind forecast monitor · day-ahead procurement</span>
          </div>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={t.id === tab ? 'tab on' : 'tab'} onClick={() => pick(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main>{TABS.find((t) => t.id === tab)!.el}</main>

      <footer className="foot">
        Data: Elexon BMRS - FUELHH (wind outturn) &amp; WINDFOR (wind forecast), national level.
        {meta.data && (
          <>
            {' '}
            {meta.data.forecastRuns} forecast runs published {fmtDateTime(meta.data.publishFrom)} -{' '}
            {fmtDateTime(meta.data.publishTo)} · source: {meta.data.source} (fetched {fmtDateTime(meta.data.loadedAt)})
          </>
        )}
      </footer>
    </div>
  )
}
