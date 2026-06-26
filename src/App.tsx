import { useState, useCallback, useEffect, useRef } from 'react'
import { WebIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { useOptimizer } from './hooks/useOptimizer'
import { extractMetrics } from './lib/metricsExtractor'
import type { OptimizationOptions, GLBMetrics } from './types/pipeline'
import type { ViewerHandle } from './components/ViewerPanel'
import { ViewerPanel } from './components/ViewerPanel'
import { MetricsTable } from './components/MetricsTable'
import { OptimizeControls } from './components/OptimizeControls'
import './App.css'

const DEFAULT_OPTIONS: OptimizationOptions = {
  geometry: { weld: true, dedup: true, prune: true, draco: false },
  texture: { enabled: false, format: 'etc1s', quality: 80 },
}

type View = 'empty' | 'processing' | 'result'

function fmtSize(bytes: number) {
  if (bytes <= 0) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function App() {
  const [view, setView] = useState<View>('empty')
  const [filename, setFilename] = useState<string | null>(null)
  const [originalBuffer, setOriginalBuffer] = useState<ArrayBuffer | null>(null)
  const [optimizedBuffer, setOptimizedBuffer] = useState<ArrayBuffer | null>(null)
  const [beforeMetrics, setBeforeMetrics] = useState<GLBMetrics | null>(null)
  const [afterMetrics, setAfterMetrics] = useState<GLBMetrics | null>(null)
  const [options, setOptions] = useState<OptimizationOptions>(DEFAULT_OPTIONS)
  const [dropError, setDropError] = useState<string | null>(null)
  const [fileInputKey, setFileInputKey] = useState(0)

  const beforeRef = useRef<ViewerHandle>(null)
  const afterRef = useRef<ViewerHandle>(null)
  const syncingRef = useRef(false)
  const obsARef = useRef<ReturnType<typeof attachSync> | null>(null)
  const obsBRef = useRef<ReturnType<typeof attachSync> | null>(null)

  const { state: optState, optimize, reset: resetOpt } = useOptimizer()

  // Camera sync helpers
  function attachSync(
    src: NonNullable<ViewerHandle['camera']>,
    dst: NonNullable<ViewerHandle['camera']>,
  ) {
    return src.onViewMatrixChangedObservable.add(() => {
      if (syncingRef.current) return
      syncingRef.current = true
      dst.alpha = src.alpha
      dst.beta = src.beta
      dst.radius = src.radius
      dst.target.copyFrom(src.target)
      syncingRef.current = false
    })
  }

  // ── File loading ──────────────────────────────────────────────────
  const loadFile = useCallback(async (buffer: ArrayBuffer, name: string) => {
    setDropError(null)
    resetOpt()
    setOptimizedBuffer(null)
    setAfterMetrics(null)
    setFilename(name)
    setOriginalBuffer(buffer)
    setView('result')

    // Metriche originale sul thread principale
    try {
      const io = new WebIO().registerExtensions(ALL_EXTENSIONS)
      const doc = await io.readBinary(new Uint8Array(buffer.slice(0)))
      setBeforeMetrics(extractMetrics(doc, buffer.byteLength))
    } catch {
      setBeforeMetrics(null)
    }
  }, [resetOpt])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.glb')) {
      setDropError('Solo file .glb sono supportati.')
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      const buf = ev.target?.result as ArrayBuffer
      if (!buf || buf.byteLength < 12) { setDropError('File non valido.'); return }
      const magic = new DataView(buf).getUint32(0, true)
      if (magic !== 0x46546c67) { setDropError('Non è un GLB valido (header errato).'); return }
      loadFile(buf, file.name)
    }
    reader.readAsArrayBuffer(file)
  }, [loadFile])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.glb')) {
      setDropError('Solo file .glb sono supportati.'); return
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      const buf = ev.target?.result as ArrayBuffer
      if (!buf || buf.byteLength < 12) { setDropError('File non valido.'); return }
      loadFile(buf, file.name)
      setFileInputKey(k => k + 1)
    }
    reader.readAsArrayBuffer(file)
  }, [loadFile])

  // ── Optimization ─────────────────────────────────────────────────
  const handleOptimize = useCallback(() => {
    if (!originalBuffer) return
    setView('processing')
    optimize(originalBuffer.slice(0), options)
  }, [originalBuffer, options, optimize])

  useEffect(() => {
    if (optState.phase === 'done') {
      setOptimizedBuffer(optState.optimizedBuffer)
      setAfterMetrics(optState.metrics)
      setView('result')
    }
    if (optState.phase === 'error') {
      setView('result')
    }
  }, [optState])

  // ── Load optimized model into viewer ─────────────────────────────
  useEffect(() => {
    if (originalBuffer && beforeRef.current) {
      beforeRef.current.loadGlb(originalBuffer.slice(0))
    }
  }, [originalBuffer])

  useEffect(() => {
    if (!optimizedBuffer || !afterRef.current) return
    afterRef.current.loadGlb(optimizedBuffer.slice(0)).then(() => {
      const cb = beforeRef.current?.camera
      const ca = afterRef.current?.camera
      if (!cb || !ca) return
      // Cleanup previous observers
      if (obsARef.current) cb.onViewMatrixChangedObservable.remove(obsARef.current)
      if (obsBRef.current) ca.onViewMatrixChangedObservable.remove(obsBRef.current)
      obsARef.current = attachSync(cb, ca)
      obsBRef.current = attachSync(ca, cb)
    })
  }, [optimizedBuffer])

  // ── Download ─────────────────────────────────────────────────────
  const handleDownload = useCallback(() => {
    if (!optimizedBuffer || !filename) return
    const blob = new Blob([optimizedBuffer], { type: 'model/gltf-binary' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename.replace(/\.glb$/i, '_optimized.glb')
    a.click()
    URL.revokeObjectURL(url)
  }, [optimizedBuffer, filename])

  // ── Reset ─────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    resetOpt()
    setOriginalBuffer(null)
    setOptimizedBuffer(null)
    setBeforeMetrics(null)
    setAfterMetrics(null)
    setFilename(null)
    setView('empty')
    setFileInputKey(k => k + 1)
  }, [resetOpt])

  // ── Derived values ────────────────────────────────────────────────
  const progress = optState.phase === 'running' ? optState.percent : 0
  const step = optState.phase === 'running' ? optState.message : ''
  const warnings = optState.phase === 'done' ? optState.warnings : []
  const hasOptimized = !!optimizedBuffer && !!afterMetrics

  const beforeSize = fmtSize(beforeMetrics?.fileSize ?? 0)
  const afterSize = fmtSize(afterMetrics?.fileSize ?? 0)

  const savings = beforeMetrics && afterMetrics && afterMetrics.fileSize > 0
    ? Math.round((1 - afterMetrics.fileSize / beforeMetrics.fileSize) * 100)
    : null

  return (
    <div className="ll-app">

      {/* ── HEADER ── */}
      <header className="ll-header">
        <div className="ll-header-left">
          <div className="ll-logo">
            <div className="ll-logo-icon">
              <div className="ll-logo-icon-bg" />
              <div className="ll-logo-icon-inner" />
            </div>
            <span className="ll-logo-name">Lightload</span>
            <span className="ll-beta">BETA</span>
          </div>

          {/* File chip — visible when a file is loaded */}
          {filename && view !== 'empty' && (
            <div className="ll-file-chip">
              <span className="ll-file-chip-dot" />
              <span className="ll-file-chip-name">{filename}</span>
              <span className="ll-file-chip-size">{beforeSize}</span>
              <span className="ll-file-chip-close" onClick={handleReset}>✕</span>
            </div>
          )}
        </div>

        <a
          href="https://github.com/ImDxni/LightLoad"
          target="_blank"
          rel="noopener noreferrer"
          className="ll-github"
        >
          <span className="ll-github-stars">★ 0</span>
          <span>GitHub</span>
          <span className="ll-github-arrow">↗</span>
        </a>
      </header>

      {/* ── MAIN ── */}
      <main className="ll-main">

        {/* EMPTY state */}
        {view === 'empty' && (
          <section className="ll-section">
            <input
              key={fileInputKey}
              type="file"
              accept=".glb"
              id="glb-input"
              style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
              onChange={handleInputChange}
            />
            <div
              className="ll-drop-outer"
              onClick={() => document.getElementById('glb-input')?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              <div className="ll-drop-icon">
                <div className="ll-drop-icon-shadow" />
                <div className="ll-drop-icon-main">↓</div>
              </div>
              <div className="ll-drop-title">
                <h2>Trascina qui un file .glb</h2>
                <p>oppure <span>clicca per selezionare</span> · max 100 MB</p>
              </div>
              <div className="ll-drop-privacy">
                <span className="ll-drop-privacy-dot" />
                Tutto avviene nel tuo browser · nessun upload
              </div>
              {dropError && <p className="ll-drop-error">{dropError}</p>}
            </div>
          </section>
        )}

        {/* PROCESSING state */}
        {view === 'processing' && (
          <section className="ll-section">
            <div className="ll-proc-card">
              <div className="ll-proc-top">
                <div className="ll-spinner" />
                <div className="ll-proc-info">
                  <div className="ll-proc-info-title">Ottimizzazione in corso</div>
                  <div className="ll-proc-info-file">{filename}</div>
                </div>
                <div className="ll-proc-pct">{Math.round(progress)}%</div>
              </div>
              <div className="ll-proc-bar-track">
                <div className="ll-proc-bar-fill" style={{ width: `${progress}%` }} />
              </div>
              <div className="ll-proc-step">
                <span className="ll-proc-step-dot" />
                {step}
              </div>
            </div>
          </section>
        )}

        {/* RESULT state */}
        {view === 'result' && (
          <section className="ll-section ll-section--result">
            <div className="ll-result-inner">

              {/* Left: viewers + metrics */}
              <div className="ll-result-main">
                <div className="ll-viewers-row">
                  <div className="ll-viewer-card">
                    <div className="ll-viewer-header">
                      <div className="ll-viewer-header-left">
                        <span className="ll-viewer-dot" style={{ background: '#6b6b73' }} />
                        <span className="ll-viewer-label">Originale</span>
                      </div>
                      <span className="ll-viewer-desc">high-poly · raw</span>
                    </div>
                    <div className="ll-viewer-canvas-wrap">
                      {!originalBuffer && <div className="ll-viewer-empty">Nessun modello</div>}
                      <ViewerPanel ref={beforeRef} />
                    </div>
                    <div className="ll-viewer-footer">
                      <span className="ll-viewer-size">{beforeSize}</span>
                      <span className="ll-viewer-badge ll-viewer-badge--neutral">non ottimizzato</span>
                    </div>
                  </div>

                  <div className="ll-viewer-card">
                    <div className="ll-viewer-header">
                      <div className="ll-viewer-header-left">
                        <span className="ll-viewer-dot" style={{ background: '#7c5cff' }} />
                        <span className="ll-viewer-label">Ottimizzato</span>
                      </div>
                      <span className="ll-viewer-desc">
                        {options.geometry.draco ? 'draco' : 'mesh'} · {options.texture.format}
                      </span>
                    </div>
                    <div className="ll-viewer-canvas-wrap">
                      {!optimizedBuffer && <div className="ll-viewer-empty">Da ottimizzare</div>}
                      <ViewerPanel ref={afterRef} />
                    </div>
                    <div className="ll-viewer-footer">
                      <span className="ll-viewer-size">{hasOptimized ? afterSize : '—'}</span>
                      {savings !== null && savings > 0
                        ? <span className="ll-viewer-badge ll-viewer-badge--good">↓ {savings}%</span>
                        : <span className="ll-viewer-badge ll-viewer-badge--neutral">—</span>
                      }
                    </div>
                  </div>
                </div>

                <div className="ll-sync-hint">
                  <span className="ll-sync-hint-icon">↔</span>
                  Camere sincronizzate — trascina su un viewer per orbitare entrambi
                </div>

                <MetricsTable before={beforeMetrics} after={afterMetrics} />
              </div>

              {/* Right: sidebar */}
              <aside className="ll-sidebar">
                <div className="ll-sidebar-head">
                  <div className="ll-sidebar-head-title">Ottimizzazione</div>
                  <div className="ll-sidebar-head-sub">Compressione geometria &amp; texture</div>
                </div>

                <div className="ll-sidebar-body">
                  <OptimizeControls
                    options={options}
                    onChange={setOptions}
                    disabled={view === 'processing'}
                  />

                  {/* Error */}
                  {optState.phase === 'error' && (
                    <div className="ll-error">❌ {optState.message}</div>
                  )}

                  {/* Warnings */}
                  {warnings.length > 0 && (
                    <div className="ll-warnings">
                      {warnings.map((w, i) => (
                        <div key={i} className="ll-warning-item">⚠ {w}</div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="ll-sidebar-foot">
                  <button
                    className="ll-btn ll-btn--secondary"
                    onClick={handleOptimize}
                    disabled={!originalBuffer || view === 'processing'}
                  >
                    <span className="ll-btn-icon">⟲</span> Ottimizza
                  </button>
                  <button
                    className="ll-btn ll-btn--primary"
                    onClick={handleDownload}
                    disabled={!optimizedBuffer}
                  >
                    <span>↓</span> Scarica GLB ottimizzato
                  </button>
                </div>
              </aside>

            </div>
          </section>
        )}

      </main>
    </div>
  )
}
