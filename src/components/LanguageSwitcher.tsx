import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES } from '../i18n/resources'

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation()
  const current = i18n.resolvedLanguage ?? i18n.language

  return (
    <div className="ll-lang" role="group" aria-label={t('language.select')}>
      {SUPPORTED_LANGUAGES.map(lng => (
        <button
          key={lng}
          type="button"
          className={`ll-lang-opt ll-lang-opt--${current === lng ? 'active' : 'inactive'}`}
          onClick={() => i18n.changeLanguage(lng)}
          aria-pressed={current === lng}
        >
          {lng.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
