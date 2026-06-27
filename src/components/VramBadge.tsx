import { useTranslation } from 'react-i18next'
import type { VramBreakdown } from '../types/pipeline'
import { fmtSize } from '../lib/format'

interface Props {
  vram: VramBreakdown | null | undefined
}

/**
 * Peso stimato in VRAM mostrato tra parentesi accanto alla dimensione su disco.
 * L'icona "i" rivela in hover/focus il dettaglio (geometria/texture) e la nota
 * sulla dipendenza dal device.
 */
export function VramBadge({ vram }: Props) {
  const { t } = useTranslation()
  if (!vram || vram.total <= 0) return null

  return (
    <span className="ll-vram">
      ({fmtSize(vram.total)} {t('vram.label')}
      <span className="ll-vram-info" tabIndex={0} aria-label={t('vram.ariaDetail')}>
        <span className="ll-vram-info-icon" aria-hidden="true">i</span>
        <span className="ll-vram-tip" role="tooltip">
          <span className="ll-vram-tip-row">
            <span>{t('vram.geometry')}</span><span>{fmtSize(vram.geometry)}</span>
          </span>
          <span className="ll-vram-tip-row">
            <span>{t('vram.textures')}</span><span>{fmtSize(vram.textures)}</span>
          </span>
          <span className="ll-vram-tip-row ll-vram-tip-row--total">
            <span>{t('vram.total')}</span><span>{fmtSize(vram.total)}</span>
          </span>
        </span>
      </span>
      )
    </span>
  )
}
