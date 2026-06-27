import { useTranslation } from 'react-i18next'
import type { OptimizationOptions } from '../types/pipeline'

interface Props {
  options: OptimizationOptions
  onChange: (opts: OptimizationOptions) => void
  disabled?: boolean
}

function Toggle({
  name, desc, on, onToggle, disabled,
}: {
  name: string; desc: string; on: boolean; onToggle: () => void; disabled?: boolean
}) {
  return (
    <div
      className="ll-toggle-row"
      onClick={disabled ? undefined : onToggle}
      style={{ opacity: disabled ? 0.45 : 1 }}
    >
      <div className="ll-toggle-row-info">
        <div className="ll-toggle-name">{name}</div>
        <div className="ll-toggle-desc">{desc}</div>
      </div>
      <div className={`ll-toggle-track ll-toggle-track--${on ? 'on' : 'off'}`}>
        <div className={`ll-toggle-knob ll-toggle-knob--${on ? 'on' : 'off'}`} />
      </div>
    </div>
  )
}

export function OptimizeControls({ options, onChange, disabled }: Props) {
  const { t } = useTranslation()
  function setGeo<K extends keyof typeof options.geometry>(key: K, val: typeof options.geometry[K]) {
    onChange({ ...options, geometry: { ...options.geometry, [key]: val } })
  }
  function setTex<K extends keyof typeof options.texture>(key: K, val: typeof options.texture[K]) {
    onChange({ ...options, texture: { ...options.texture, [key]: val } })
  }

  const { weld, dedup, prune, draco, meshopt, simplify, simplifyRatio, simplifyError } = options.geometry
  const { enabled, format, quality } = options.texture

  return (
    <>
      {/* Geometria */}
      <div>
        <div className="ll-section-label">{t('controls.geometry')}</div>
        <Toggle name={t('controls.weld')}  desc={t('controls.weldDesc')}    on={weld}  onToggle={() => setGeo('weld', !weld)}   disabled={disabled} />
        <Toggle name={t('controls.dedup')} desc={t('controls.dedupDesc')}    on={dedup} onToggle={() => setGeo('dedup', !dedup)} disabled={disabled} />
        <Toggle name={t('controls.prune')} desc={t('controls.pruneDesc')}    on={prune} onToggle={() => setGeo('prune', !prune)} disabled={disabled} />
        <Toggle name={t('controls.draco')} desc={t('controls.dracoDesc')}    on={draco}
          onToggle={() => onChange({ ...options, geometry: { ...options.geometry, draco: !draco, meshopt: false } })}
          disabled={disabled} />
        <Toggle name={t('controls.meshopt')} desc={t('controls.meshoptDesc')} on={meshopt}
          onToggle={() => onChange({ ...options, geometry: { ...options.geometry, meshopt: !meshopt, draco: false } })}
          disabled={disabled} />
        <Toggle name={t('controls.simplify')} desc={t('controls.simplifyDesc')} on={simplify} onToggle={() => setGeo('simplify', !simplify)} disabled={disabled} />
        {simplify && (
          <>
            <div className="ll-quality-row">
              <span className="ll-quality-label">{t('controls.ratio')}</span>
              <span className="ll-quality-val">{simplifyRatio ?? 0.5}</span>
            </div>
            <input
              type="range"
              min={0.01}
              max={1}
              step={0.01}
              value={simplifyRatio ?? 0.5}
              disabled={disabled}
              onChange={(e) => setGeo('simplifyRatio', Number(e.target.value))}
            />
            <div className="ll-quality-row">
              <span className="ll-quality-label">{t('controls.error')}</span>
              <span className="ll-quality-val">{simplifyError ?? 0.05}</span>
            </div>
            <input
              type="range"
              min={0.001}
              max={1}
              step={0.001}
              value={simplifyError ?? 0.05}
              disabled={disabled}
              onChange={(e) => setGeo('simplifyError', Number(e.target.value))}
            />
          </>
        )}
      </div>

      <div className="ll-divider" />

      {/* Texture */}
      <div>
        <div className="ll-section-label">{t('controls.texture')}</div>
        <Toggle
          name={t('controls.ktx2')}
          desc={t('controls.ktx2Desc')}
          on={enabled}
          onToggle={() => setTex('enabled', !enabled)}
          disabled={disabled}
        />

        {enabled && (
          <>
            <div style={{ fontSize: 12, color: '#8a8a95', margin: '9px 0 0' }}>{t('controls.codec')}</div>
            <div className="ll-seg">
              <div
                className={`ll-seg-opt ll-seg-opt--${format === 'etc1s' ? 'active' : 'inactive'}`}
                onClick={disabled ? undefined : () => setTex('format', 'etc1s')}
              >
                ETC1S
              </div>
              <div
                className={`ll-seg-opt ll-seg-opt--${format === 'uastc' ? 'active' : 'inactive'}`}
                onClick={disabled ? undefined : () => setTex('format', 'uastc')}
              >
                UASTC
              </div>
            </div>

            <div className="ll-quality-row">
              <span className="ll-quality-label">{t('controls.quality')}</span>
              <span className="ll-quality-val">{quality}</span>
            </div>
            <input
              type="range"
              min={1}
              max={255}
              value={quality}
              disabled={disabled}
              onChange={(e) => setTex('quality', Number(e.target.value))}
            />

            {/* Warning texture non multiple di 4 — statica per ora */}
            <div className="ll-warn">
              <span className="ll-warn-icon">⚠</span>
              <div className="ll-warn-text">{t('controls.texWarn')}</div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
