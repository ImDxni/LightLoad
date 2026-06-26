import type { OptimizationOptions } from '../types/pipeline'
import styles from './OptimizeControls.module.css'

interface Props {
  options: OptimizationOptions
  onChange: (opts: OptimizationOptions) => void
  disabled?: boolean
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
  hint,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  hint?: string
}) {
  return (
    <label className={`${styles.toggle} ${disabled ? styles.disabled : ''}`} title={hint}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={styles.toggleSlider} />
      {label}
    </label>
  )
}

export function OptimizeControls({ options, onChange, disabled }: Props) {
  function setGeo<K extends keyof OptimizationOptions['geometry']>(
    key: K,
    val: OptimizationOptions['geometry'][K],
  ) {
    onChange({ ...options, geometry: { ...options.geometry, [key]: val } })
  }

  function setTex<K extends keyof OptimizationOptions['texture']>(
    key: K,
    val: OptimizationOptions['texture'][K],
  ) {
    onChange({ ...options, texture: { ...options.texture, [key]: val } })
  }

  return (
    <div className={styles.panel}>
      <section>
        <h4 className={styles.sectionTitle}>Geometria</h4>
        <Toggle
          label="Weld"
          checked={options.geometry.weld}
          onChange={(v) => setGeo('weld', v)}
          disabled={disabled}
          hint="Fonde vertici coincidenti"
        />
        <Toggle
          label="Dedup"
          checked={options.geometry.dedup}
          onChange={(v) => setGeo('dedup', v)}
          disabled={disabled}
          hint="Rimuove accessor/texture duplicati"
        />
        <Toggle
          label="Prune"
          checked={options.geometry.prune}
          onChange={(v) => setGeo('prune', v)}
          disabled={disabled}
          hint="Elimina nodi e materiali inutilizzati"
        />
        <Toggle
          label="Draco"
          checked={options.geometry.draco}
          onChange={(v) => setGeo('draco', v)}
          disabled={disabled}
          hint="Compressione geometria Draco (richiede viewer compatibile)"
        />
      </section>

      <section>
        <h4 className={styles.sectionTitle}>Texture KTX2</h4>
        <Toggle
          label="Abilita KTX2"
          checked={options.texture.enabled}
          onChange={(v) => setTex('enabled', v)}
          disabled={disabled}
          hint="Richiede basis_encoder.wasm (vedi README)"
        />
        {options.texture.enabled && (
          <>
            <div className={styles.radioGroup}>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="format"
                  value="etc1s"
                  checked={options.texture.format === 'etc1s'}
                  disabled={disabled}
                  onChange={() => setTex('format', 'etc1s')}
                />
                ETC1S <span className={styles.hint}>(massima compressione)</span>
              </label>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="format"
                  value="uastc"
                  checked={options.texture.format === 'uastc'}
                  disabled={disabled}
                  onChange={() => setTex('format', 'uastc')}
                />
                UASTC <span className={styles.hint}>(massima qualità)</span>
              </label>
            </div>

            <div className={styles.sliderGroup}>
              <label className={styles.sliderLabel}>
                Qualità: <strong>{options.texture.quality}</strong>
              </label>
              <input
                type="range"
                min={1}
                max={255}
                value={options.texture.quality}
                disabled={disabled}
                onChange={(e) => setTex('quality', Number(e.target.value))}
                className={styles.slider}
              />
              <div className={styles.sliderTicks}>
                <span>Bassa</span>
                <span>Alta</span>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
