import type { GLBMetrics } from '../types/pipeline'

interface Props {
  before: GLBMetrics | null
  after: GLBMetrics | null
}

function fmtSize(bytes: number) {
  if (bytes <= 0) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fmt(n: number) {
  return n > 0 ? n.toLocaleString('it-IT') : '—'
}

function delta(before: number, after: number): { text: string; good: boolean } | null {
  if (!before || !after) return null
  const pct = ((after - before) / before) * 100
  const good = pct < 0
  return { text: `${good ? '↓' : '↑'} ${Math.abs(Math.round(pct))}%`, good }
}

export function MetricsTable({ before, after }: Props) {
  if (!before) return null

  type Row = {
    label: string
    bVal: string
    aVal: string
    delta: { text: string; good: boolean } | null
  }

  const rows: Row[] = [
    {
      label: 'Dimensione file',
      bVal: fmtSize(before.fileSize),
      aVal: after ? fmtSize(after.fileSize) : '—',
      delta: after ? delta(before.fileSize, after.fileSize) : null,
    },
    {
      label: 'Vertici',
      bVal: fmt(before.vertexCount),
      aVal: after ? fmt(after.vertexCount) : '—',
      delta: after ? delta(before.vertexCount, after.vertexCount) : null,
    },
    {
      label: 'Triangoli',
      bVal: fmt(before.triangleCount),
      aVal: after ? fmt(after.triangleCount) : '—',
      delta: after ? delta(before.triangleCount, after.triangleCount) : null,
    },
  ]

  return (
    <div className="ll-metrics">
      <div className="ll-metrics-head">
        <span>Metrica</span>
        <span>Originale</span>
        <span>Ottimizzato</span>
        <span>Variazione</span>
      </div>
      {rows.map((row, i) => (
        <div key={i} className="ll-metrics-row">
          <span className="ll-metrics-label">{row.label}</span>
          <span className="ll-metrics-before">{row.bVal}</span>
          <span className="ll-metrics-after">{row.aVal}</span>
          {row.delta
            ? (
              <span className={`ll-metrics-delta ${row.delta.good ? 'll-metrics-delta--good' : 'll-metrics-delta--neutral'}`}>
                {row.delta.text}
              </span>
            )
            : <span className="ll-metrics-delta ll-metrics-delta--neutral">—</span>
          }
        </div>
      ))}
    </div>
  )
}
