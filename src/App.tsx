import { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { WebIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import type { ArcRotateCamera } from '@babylonjs/core'
import { useOptimizer } from './hooks/useOptimizer'
import { extractMetrics } from './lib/metricsExtractor'
import type { OptimizationOptions, GLBMetrics } from './types/pipeline'
import { ViewerPanel } from './components/ViewerPanel'
import { MetricsTable } from './components/MetricsTable'
import { VramBadge } from './components/VramBadge'
import { OptimizeControls } from './components/OptimizeControls'
import { ProfileSelector } from './components/ProfileSelector'
import { LanguageSwitcher } from './components/LanguageSwitcher'
import { FaqPage } from './components/FaqPage'
import { PROFILE_PRESETS, type Profile } from './lib/profiles'
import { fmtSize } from './lib/format'
import { Analytics } from '@vercel/analytics/react'
import './App.css'

const DEFAULT_PROFILE: Profile = 'ecommerce'
const DEFAULT_OPTIONS: OptimizationOptions = PROFILE_PRESETS.ecommerce

type View = 'empty' | 'processing' | 'result'

function WireframeToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      className={`ll-wire-btn ll-wire-btn--${active ? 'on' : 'off'}`}
      onClick={onToggle}
      title={active ? t('viewer.wireframeOff') : t('viewer.wireframeOn')}
      aria-pressed={active}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M3 3h18v18H3z" />
        <path d="M3 9h18 M3 15h18 M9 3v18 M15 3v18" />
      </svg>
    </button>
  )
}

// Focus mode: ingrandisce i canvas e nasconde la sidebar
function ExpandToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      className={`ll-expand-btn ll-expand-btn--${active ? 'on' : 'off'}`}
      onClick={onToggle}
      aria-pressed={active}
      title={active ? t('viewer.reduceTitle') : t('viewer.expandTitle')}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {active
          ? <path d="M9 4v5H4 M20 9h-5V4 M15 20v-5h5 M4 15h5v5" />
          : <path d="M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5" />}
      </svg>
      {active ? t('viewer.reduce') : t('viewer.expand')}
    </button>
  )
}

export default function App() {
  const { t, i18n } = useTranslation()
  const [filename, setFilename] = useState<string | null>(null)
  const [originalBuffer, setOriginalBuffer] = useState<ArrayBuffer | null>(null)
  const [beforeMetrics, setBeforeMetrics] = useState<GLBMetrics | null>(null)
  const [options, setOptions] = useState<OptimizationOptions>(DEFAULT_OPTIONS)
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [wireframe, setWireframe] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [dropError, setDropError] = useState<string | null>(null)
  const [fileInputKey, setFileInputKey] = useState(0)
  const [stars, setStars] = useState<number | null>(null)
  // Opzioni dell'ultimo risultato prodotto, per capire se i parametri sono cambiati (gerarchia CTA)
  const [optimizedOptions, setOptimizedOptions] = useState<OptimizationOptions | null>(null)
  const pendingOptionsRef = useRef<OptimizationOptions | null>(null)

  // Routing minimale via hash: #faq → pagina FAQ, tutto il resto → strumento
  const [route, setRoute] = useState<'home' | 'faq'>(() => window.location.hash === '#faq' ? 'faq' : 'home')
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash === '#faq' ? 'faq' : 'home')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    fetch('https://api.github.com/repos/ImDxni/LightLoad')
      .then(r => r.json())
      .then(d => { if (typeof d.stargazers_count === 'number') setStars(d.stargazers_count) })
      .catch(() => {})
  }, [])

  // Allinea <title>, <html lang> e meta description alla lingua attiva e alla pagina
  useEffect(() => {
    document.documentElement.lang = i18n.resolvedLanguage ?? i18n.language
    document.title = route === 'faq' ? `${t('faq.title')} — LightLoad` : t('app.title')
    document.querySelector('meta[name="description"]')?.setAttribute('content', t('app.metaDescription'))
  }, [t, i18n.resolvedLanguage, i18n.language, route])

  const { state: optState, optimize, reset: resetOpt } = useOptimizer()

  // Stato derivato dal worker — niente mirror in useState (evita render a cascata)
  const optimizedBuffer = optState.phase === 'done' ? optState.optimizedBuffer : null
  const afterMetrics    = optState.phase === 'done' ? optState.metrics : null
  const view: View =
    !originalBuffer ? 'empty'
      : optState.phase === 'running' ? 'processing'
        : 'result'

  // ── Camera sync ────────────────────────────────────────────────────
  const syncingRef = useRef(false)
  const beforeCamRef = useRef<ArcRotateCamera | null>(null)
  const afterCamRef  = useRef<ArcRotateCamera | null>(null)
  // Observer<Camera> perché onViewMatrixChangedObservable è Observable<Camera>
  const obsARef = useRef<ReturnType<ArcRotateCamera['onViewMatrixChangedObservable']['add']>>(null)
  const obsBRef = useRef<ReturnType<ArcRotateCamera['onViewMatrixChangedObservable']['add']>>(null)

  function attachSync(src: ArcRotateCamera, dst: ArcRotateCamera) {
    return src.onViewMatrixChangedObservable.add(() => {
      if (syncingRef.current) return
      syncingRef.current = true
      dst.alpha = src.alpha
      dst.beta  = src.beta
      dst.radius = src.radius
      dst.target.copyFrom(src.target)
      syncingRef.current = false
    })
  }

  // Ricollega sync quando entrambe le camere sono disponibili
  function connectCameras(a: ArcRotateCamera | null, b: ArcRotateCamera | null) {
    if (obsARef.current && beforeCamRef.current) beforeCamRef.current.onViewMatrixChangedObservable.remove(obsARef.current)
    if (obsBRef.current && afterCamRef.current)  afterCamRef.current.onViewMatrixChangedObservable.remove(obsBRef.current)
    obsARef.current = null
    obsBRef.current = null
    if (a && b) {
      obsARef.current = attachSync(a, b)
      obsBRef.current = attachSync(b, a)
    }
  }

  const handleBeforeCameraReady = useCallback((cam: ArcRotateCamera | null) => {
    beforeCamRef.current = cam
    connectCameras(cam, afterCamRef.current)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAfterCameraReady = useCallback((cam: ArcRotateCamera | null) => {
    afterCamRef.current = cam
    connectCameras(beforeCamRef.current, cam)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── File loading ────────────────────────────────────────────────────
  const loadFile = useCallback(async (buffer: ArrayBuffer, name: string) => {
    setDropError(null)
    resetOpt()
    setFilename(name)
    setOriginalBuffer(buffer)

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
    if (!file.name.toLowerCase().endsWith('.glb')) { setDropError(t('drop.errorGlbOnly')); return }
    const reader = new FileReader()
    reader.onload = (ev) => {
      const buf = ev.target?.result as ArrayBuffer
      if (!buf || buf.byteLength < 12) { setDropError(t('drop.errorInvalid')); return }
      const magic = new DataView(buf).getUint32(0, true)
      if (magic !== 0x46546c67) { setDropError(t('drop.errorNotGlb')); return }
      loadFile(buf, file.name)
    }
    reader.readAsArrayBuffer(file)
  }, [loadFile, t])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.glb')) { setDropError(t('drop.errorGlbOnly')); return }
    const reader = new FileReader()
    reader.onload = (ev) => {
      const buf = ev.target?.result as ArrayBuffer
      if (!buf || buf.byteLength < 12) { setDropError(t('drop.errorInvalid')); return }
      loadFile(buf, file.name)
      setFileInputKey(k => k + 1)
    }
    reader.readAsArrayBuffer(file)
  }, [loadFile, t])

  // ── Profili / opzioni ───────────────────────────────────────────────
  const handleSelectProfile = useCallback((p: Profile) => {
    setProfile(p)
    if (p === 'custom') {
      setAdvancedOpen(true)
    } else {
      setAdvancedOpen(false)
      setOptions(PROFILE_PRESETS[p])
    }
  }, [])

  // Ogni modifica manuale nel pannello avanzato passa a "Custom"
  const handleOptionsChange = useCallback((opts: OptimizationOptions) => {
    setOptions(opts)
    setProfile('custom')
  }, [])

  // ── Optimization ────────────────────────────────────────────────────
  const handleOptimize = useCallback(() => {
    if (!originalBuffer) return
    pendingOptionsRef.current = options
    optimize(originalBuffer.slice(0), options)
  }, [originalBuffer, options, optimize])

  useEffect(() => {
    if (optState.phase === 'done') setOptimizedOptions(pendingOptionsRef.current)
  }, [optState.phase])

  // ── Download ─────────────────────────────────────────────────────────
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

  // ── Reset ─────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    resetOpt()
    setOriginalBuffer(null)
    setBeforeMetrics(null)
    setFilename(null)
    setFileInputKey(k => k + 1)
    setOptimizedOptions(null)
    setWireframe(false)
    setExpanded(false)
    pendingOptionsRef.current = null
  }, [resetOpt])

  // ── Derived ───────────────────────────────────────────────────────────
  const progress  = optState.phase === 'running' ? optState.percent : 0
  const step      = optState.phase === 'running' ? optState.message : ''
  const warnings  = optState.phase === 'done' ? optState.warnings : []
  const beforeSize = fmtSize(beforeMetrics?.fileSize ?? 0)
  const afterSize  = fmtSize(afterMetrics?.fileSize ?? 0)
  const savings = beforeMetrics && afterMetrics && afterMetrics.fileSize > 0
    ? Math.round((1 - afterMetrics.fileSize / beforeMetrics.fileSize) * 100)
    : null

  // Dirty = nessun risultato o opzioni cambiate dall'ultimo run → decide quale CTA è primaria
  const isRunning = optState.phase === 'running'
  const isDirty = !optimizedBuffer || JSON.stringify(options) !== JSON.stringify(optimizedOptions)

  return (
    <div className="ll-app">
    <Analytics />
      {/* ── HEADER ── */}
      <header className="ll-header">
        <div className="ll-header-left">
          <div className="ll-logo">
            <img src="/favicon.svg" className="ll-logo-icon" width={22} height={22} alt="Lightload" />
            <span className="ll-logo-name">Lightload</span>
            <span className="ll-beta">{t('app.beta')}</span>
          </div>

          {filename && view !== 'empty' && (
            <div className="ll-file-chip">
              <span className="ll-file-chip-dot" />
              <span className="ll-file-chip-name">{filename}</span>
              <span className="ll-file-chip-size">{beforeSize}</span>
              <span className="ll-file-chip-close" onClick={handleReset} title={t('header.removeFile')}>✕</span>
            </div>
          )}
        </div>

        <div className="ll-header-right">
          <a href={route === 'faq' ? '#home' : '#faq'} className="ll-nav-link">{t('faq.nav')}</a>
          <LanguageSwitcher />
          <a href="https://github.com/ImDxni/lightload" target="_blank" rel="noopener noreferrer" className="ll-github">
            <span className="ll-github-stars">★ {stars ?? '—'}</span>
            <span>{t('header.github')}</span>
            <span className="ll-github-arrow">↗</span>
          </a>
        </div>
      </header>

      {/* ── MAIN ── */}
      <main className="ll-main">

        {route === 'faq' && <FaqPage />}

        {/* EMPTY */}
        {route !== 'faq' && view === 'empty' && (
          <section className="ll-section">
            <input key={fileInputKey} type="file" accept=".glb" id="glb-input"
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
                <h2>{t('drop.title')}</h2>
                <p>{t('drop.or')} <span>{t('drop.clickToSelect')}</span></p>
              </div>
              <div className="ll-drop-privacy">
                <span className="ll-drop-privacy-dot" />
                {t('drop.privacy')}
              </div>
              {dropError && <p className="ll-drop-error">{dropError}</p>}
            </div>
          </section>
        )}

        {/* PROCESSING */}
        {route !== 'faq' && view === 'processing' && (
          <section className="ll-section">
            <div className="ll-proc-card">
              <div className="ll-proc-top">
                <div className="ll-spinner" />
                <div className="ll-proc-info">
                  <div className="ll-proc-info-title">{t('processing.title')}</div>
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

        {/* RESULT */}
        {route !== 'faq' && view === 'result' && (
          <section className="ll-section ll-section--result">
            <div className={`ll-result-inner ${expanded ? 'll-result-inner--expanded' : ''}`}>

              <div className="ll-result-main">
                <div className={`ll-viewers-row ${expanded ? 'll-viewers-row--expanded' : ''}`}>

                  <div className="ll-viewer-card">
                    <div className="ll-viewer-header">
                      <div className="ll-viewer-header-left">
                        <span className="ll-viewer-dot" style={{ background: '#6b6b73' }} />
                        <span className="ll-viewer-label">{t('viewer.original')}</span>
                      </div>
                      <span className="ll-viewer-desc">{t('viewer.originalDesc')}</span>
                    </div>
                    <div className="ll-viewer-canvas-wrap">
                      {!originalBuffer && <div className="ll-viewer-empty">{t('viewer.noModel')}</div>}
                      {originalBuffer && <WireframeToggle active={wireframe} onToggle={() => setWireframe(w => !w)} />}
                      <ViewerPanel buffer={originalBuffer} wireframe={wireframe} onCameraReady={handleBeforeCameraReady} />
                    </div>
                    <div className="ll-viewer-footer">
                      <span className="ll-viewer-size-group">
                        <span className="ll-viewer-size">{beforeSize}</span>
                        <VramBadge vram={beforeMetrics?.vram} />
                      </span>
                      <span className="ll-viewer-badge ll-viewer-badge--neutral">{t('viewer.notOptimized')}</span>
                    </div>
                  </div>

                  <div className="ll-viewer-card">
                    <div className="ll-viewer-header">
                      <div className="ll-viewer-header-left">
                        <span className="ll-viewer-dot" style={{ background: '#7c5cff' }} />
                        <span className="ll-viewer-label">{t('viewer.optimized')}</span>
                      </div>
                      <span className="ll-viewer-desc">
                        {options.geometry.draco ? 'draco' : options.geometry.meshopt ? 'meshopt' : 'mesh'}
                        {options.texture.enabled ? ` · ${options.texture.format}` : ''}
                      </span>
                    </div>
                    <div className="ll-viewer-canvas-wrap">
                      {!optimizedBuffer && <div className="ll-viewer-empty">{t('viewer.toOptimize')}</div>}
                      {optimizedBuffer && <WireframeToggle active={wireframe} onToggle={() => setWireframe(w => !w)} />}
                      <ViewerPanel buffer={optimizedBuffer} wireframe={wireframe} onCameraReady={handleAfterCameraReady} />
                    </div>
                    <div className="ll-viewer-footer">
                      <span className="ll-viewer-size-group">
                        <span className="ll-viewer-size">{optimizedBuffer ? afterSize : '—'}</span>
                        {optimizedBuffer && <VramBadge vram={afterMetrics?.vram} />}
                      </span>
                      {savings !== null && savings > 0
                        ? <span className="ll-viewer-badge ll-viewer-badge--good">↓ {savings}%</span>
                        : <span className="ll-viewer-badge ll-viewer-badge--neutral">—</span>
                      }
                    </div>
                  </div>

                </div>

                <div className="ll-viewers-bar">
                  <div className="ll-sync-hint">
                    <span className="ll-sync-hint-icon">↔</span>
                    {t('viewer.syncHint')}
                  </div>
                  <ExpandToggle active={expanded} onToggle={() => setExpanded(e => !e)} />
                </div>

                {!expanded && <MetricsTable before={beforeMetrics} after={afterMetrics} />}
              </div>

              <aside className="ll-sidebar">
                <div className="ll-sidebar-head">
                  <div className="ll-sidebar-head-title">{t('sidebar.title')}</div>
                  <div className="ll-sidebar-head-sub">{t('sidebar.subtitle')}</div>
                </div>

                <div className="ll-sidebar-body">
                  <ProfileSelector profile={profile} onSelect={handleSelectProfile} disabled={isRunning} />

                  <div className="ll-advanced">
                    <button
                      type="button"
                      className="ll-advanced-head"
                      onClick={() => setAdvancedOpen(o => !o)}
                      aria-expanded={advancedOpen}
                    >
                      <span>{t('sidebar.advanced')}</span>
                      <span className={`ll-advanced-caret ll-advanced-caret--${advancedOpen ? 'open' : 'closed'}`}>▾</span>
                    </button>
                    {advancedOpen && (
                      <div className="ll-advanced-body">
                        <OptimizeControls options={options} onChange={handleOptionsChange} disabled={isRunning} />
                      </div>
                    )}
                  </div>

                  {optState.phase === 'error' && (
                    <div className="ll-error">❌ {optState.message}</div>
                  )}

                  {warnings.length > 0 && (
                    <div className="ll-warnings">
                      {warnings.map((w, i) => <div key={i} className="ll-warning-item">⚠ {w}</div>)}
                    </div>
                  )}
                </div>

                <div className="ll-sidebar-foot">
                  <button
                    className={`ll-btn ${isDirty ? 'll-btn--primary' : 'll-btn--secondary'}`}
                    onClick={handleOptimize}
                    disabled={!originalBuffer || isRunning || !isDirty}
                  >
                    <span className="ll-btn-icon">⟲</span> {t('sidebar.optimize')}
                  </button>
                  <button
                    className={`ll-btn ${!isDirty && optimizedBuffer ? 'll-btn--primary' : 'll-btn--secondary'}`}
                    onClick={handleDownload}
                    disabled={!optimizedBuffer || isDirty}
                  >
                    <span>↓</span> {t('sidebar.download')}
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
