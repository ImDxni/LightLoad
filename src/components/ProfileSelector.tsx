import { useTranslation } from 'react-i18next'
import type { Profile } from '../lib/profiles'

const PROFILE_IDS: Profile[] = ['ecommerce', 'ar', 'custom']

interface Props {
  profile: Profile
  onSelect: (p: Profile) => void
  disabled?: boolean
}

export function ProfileSelector({ profile, onSelect, disabled }: Props) {
  const { t } = useTranslation()
  return (
    <div>
      <div className="ll-section-label">{t('profiles.label')}</div>
      <div className="ll-profiles">
        {PROFILE_IDS.map(id => (
          <button
            key={id}
            type="button"
            className={`ll-profile ll-profile--${profile === id ? 'active' : 'inactive'}`}
            onClick={disabled ? undefined : () => onSelect(id)}
            disabled={disabled}
          >
            <span className="ll-profile-name">{t(`profiles.${id}.name`)}</span>
            <span className="ll-profile-desc">{t(`profiles.${id}.desc`)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
