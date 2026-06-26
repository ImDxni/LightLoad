import type { GLBMetrics } from '../types/pipeline'
import styles from './MetricsTable.module.css'

interface Props {
  before: GLBMetrics | null
  after: GLBMetrics | null
}

function fmt(n: number): string {
  return n.toLocaleString('it-IT')
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function Delta({ before, after }: { before: number; after: number }) {
  if (!before || before === after) return null
  const pct = ((after - before) / before) * 100
  const cls = pct < 0 ? styles.better : styles.worse
  return <span className={cls}>{pct > 0 ? '+' : ''}{pct.toFixed(1)}%</span>
}

export function MetricsTable({ before, after }: Props) {
  if (!before) return null

  return (
    <div className={styles.wrapper}>
      <h3 className={styles.title}>Metriche</h3>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Metrica</th>
            <th>Originale</th>
            <th>Ottimizzato</th>
            <th>Δ</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Dimensione file</td>
            <td>{fmtSize(before.fileSize)}</td>
            <td>{after ? fmtSize(after.fileSize) : '—'}</td>
            <td>{after && <Delta before={before.fileSize} after={after.fileSize} />}</td>
          </tr>
          <tr>
            <td>Vertici</td>
            <td>{fmt(before.vertexCount)}</td>
            <td>{after ? fmt(after.vertexCount) : '—'}</td>
            <td>{after && <Delta before={before.vertexCount} after={after.vertexCount} />}</td>
          </tr>
          <tr>
            <td>Triangoli</td>
            <td>{fmt(before.triangleCount)}</td>
            <td>{after ? fmt(after.triangleCount) : '—'}</td>
            <td>{after && <Delta before={before.triangleCount} after={after.triangleCount} />}</td>
          </tr>
          <tr>
            <td>Texture</td>
            <td>{before.textureCount}</td>
            <td>{after ? after.textureCount : '—'}</td>
            <td />
          </tr>
        </tbody>
      </table>

      {before.textures.length > 0 && (
        <details className={styles.details}>
          <summary>Texture ({before.textures.length})</summary>
          <ul className={styles.texList}>
            {before.textures.map((t, i) => (
              <li key={i}>
                <strong>{t.name}</strong> — {t.width > 0 ? `${t.width}×${t.height}` : 'dim. sconosciute'}
                {' '}<span className={styles.mime}>{t.mimeType}</span>
                {t.width > 0 && (t.width % 4 !== 0 || t.height % 4 !== 0) && (
                  <span className={styles.warn}> ⚠ non multiplo di 4</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
