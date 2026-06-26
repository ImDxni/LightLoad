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
  function setGeo<K extends keyof typeof options.geometry>(key: K, val: typeof options.geometry[K]) {
    onChange({ ...options, geometry: { ...options.geometry, [key]: val } })
  }
  function setTex<K extends keyof typeof options.texture>(key: K, val: typeof options.texture[K]) {
    onChange({ ...options, texture: { ...options.texture, [key]: val } })
  }

  const { weld, dedup, prune, draco } = options.geometry
  const { enabled, format, quality } = options.texture

  return (
    <>
      {/* Geometria */}
      <div>
        <div className="ll-section-label">Geometria</div>
        <Toggle name="Weld"  desc="Salda i vertici coincidenti"    on={weld}  onToggle={() => setGeo('weld', !weld)}   disabled={disabled} />
        <Toggle name="Dedup" desc="Rimuove accessor duplicati"      on={dedup} onToggle={() => setGeo('dedup', !dedup)} disabled={disabled} />
        <Toggle name="Prune" desc="Elimina nodi inutilizzati"       on={prune} onToggle={() => setGeo('prune', !prune)} disabled={disabled} />
        <Toggle name="Draco" desc="Compressione mesh Draco"         on={draco} onToggle={() => setGeo('draco', !draco)} disabled={disabled} />
      </div>

      <div className="ll-divider" />

      {/* Texture */}
      <div>
        <div className="ll-section-label">Texture</div>
        <Toggle
          name="KTX2 / Basis Universal"
          desc="Richiede libktx.wasm in /wasm/"
          on={enabled}
          onToggle={() => setTex('enabled', !enabled)}
          disabled={disabled}
        />

        {enabled && (
          <>
            <div style={{ fontSize: 12, color: '#8a8a95', margin: '9px 0 0' }}>Codec di compressione</div>
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
              <span className="ll-quality-label">Qualità</span>
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
              <div className="ll-warn-text">
                Le texture con dimensioni non multiple di 4 px verranno segnalate nella console.
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
