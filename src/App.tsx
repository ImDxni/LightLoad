import { useState, useCallback, useEffect } from 'react'
import { WebIO } from '@gltf-transform/core'
import { KHRDracoMeshCompression, KHRTextureBasisu } from '@gltf-transform/extensions'
import { DropZone } from './components/DropZone'
import { DualViewer } from './components/DualViewer'
import { MetricsTable } from './components/MetricsTable'
import { OptimizeControls } from './components/OptimizeControls'
import { useOptimizer } from './hooks/useOptimizer'
import { extractMetrics } from './lib/metricsExtractor'
import type { OptimizationOptions, GLBMetrics } from './types/pipeline'
import './App.css'

const DEFAULT_OPTIONS: OptimizationOptions = {
  geometry: { weld: true, dedup: true, prune: true, draco: false },
  texture: { enabled: false, format: 'etc1s', quality: 128 },
}

export default function App() {
  const [filename, setFilename] = useState<string | null>(null)
  const [originalBuffer, setOriginalBuffer] = useState<ArrayBuffer | null>(null)
  const [optimizedBuffer, setOptimizedBuffer] = useState<ArrayBuffer | null>(null)
  const [beforeMetrics, setBeforeMetrics] = useState<GLBMetrics | null>(null)
  const [options, setOptions] = useState<OptimizationOptions>(DEFAULT_OPTIONS)

  const { state, optimize, reset } = useOptimizer()

  // Gestisce il file caricato dall'utente
  const handleFile = useCallback(async (buffer: ArrayBuffer, name: string) => {
    reset()
    setOptimizedBuffer(null)
    setFilename(name)
    setOriginalBuffer(buffer)

    // Estrae metriche del file originale sul thread principale (rapido)
    try {
      const io = new WebIO().registerExtensions([KHRDracoMeshCompression, KHRTextureBasisu])
      // Copia del buffer perché readBinary consuma i dati
      const clone = buffer.slice(0)
      const doc = await io.readBinary(new Uint8Array(clone))
      setBeforeMetrics(extractMetrics(doc, buffer.byteLength))
    } catch {
      setBeforeMetrics(null)
    }
  }, [reset])

  // Avvia l'ottimizzazione nel worker
  const handleOptimize = useCallback(() => {
    if (!originalBuffer) return
    // Clona il buffer perché il worker lo "trasferisce" (transferable)
    optimize(originalBuffer.slice(0), options)
  }, [originalBuffer, options, optimize])

  // Download del file ottimizzato
  const handleDownload = useCallback(() => {
    const buf = state.phase === 'done' ? state.optimizedBuffer : null
    if (!buf || !filename) return
    const blob = new Blob([buf], { type: 'model/gltf-binary' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename.replace(/\.glb$/i, '_optimized.glb')
    a.click()
    URL.revokeObjectURL(url)
  }, [state, filename])

  const afterMetrics = state.phase === 'done' ? state.metrics : null
  const warnings = state.phase === 'done' ? state.warnings : []

  // Aggiorna il buffer ottimizzato nel viewer quando arriva dal worker
  useEffect(() => {
    if (state.phase === 'done') {
      setOptimizedBuffer(state.optimizedBuffer)
    }
  }, [state])

  const isRunning = state.phase === 'running'

  return (
    <div className="app">
      <header className="header">
        <h1>LightLoad <span className="header-sub">GLB Optimizer</span></h1>
        {filename && <span className="filename">{filename}</span>}
      </header>

      <main className="main">
        {/* Colonna sinistra: controlli */}
        <aside className="sidebar">
          {!originalBuffer ? (
            <DropZone onFile={handleFile} />
          ) : (
            <>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setOriginalBuffer(null)
                  setOptimizedBuffer(null)
                  setBeforeMetrics(null)
                  setFilename(null)
                  reset()
                }}
              >
                ↩ Cambia file
              </button>

              <OptimizeControls
                options={options}
                onChange={setOptions}
                disabled={isRunning}
              />

              <button
                className="btn btn-primary"
                onClick={handleOptimize}
                disabled={isRunning}
              >
                {isRunning ? '⏳ Ottimizzazione…' : '⚡ Ottimizza'}
              </button>

              {isRunning && (
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${state.percent}%` }}
                  />
                  <span className="progress-label">{state.message}</span>
                </div>
              )}

              {state.phase === 'error' && (
                <div className="alert alert-error">❌ {state.message}</div>
              )}

              {warnings.length > 0 && (
                <div className="alert alert-warn">
                  {warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
                </div>
              )}

              {state.phase === 'done' && (
                <button className="btn btn-download" onClick={handleDownload}>
                  ⬇ Scarica GLB ottimizzato
                </button>
              )}

              <MetricsTable before={beforeMetrics} after={afterMetrics} />
            </>
          )}
        </aside>

        {/* Colonna destra: viewer 3D */}
        <section className="viewer-section">
          <DualViewer
            beforeBuffer={originalBuffer}
            afterBuffer={optimizedBuffer}
          />
        </section>
      </main>
    </div>
  )
}
