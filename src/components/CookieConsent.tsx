import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { updateAnalyticsConsent, type AnalyticsConsent } from '../lib/analytics'

const STORAGE_KEY = 'll_cookie_consent'

export function CookieConsent({ onLearnMore }: { onLearnMore: () => void }) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored !== 'granted' && stored !== 'denied'
  })

  // Re-apply the stored choice to Google Consent Mode on every load (gtag default is always 'denied')
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as AnalyticsConsent | null
    if (stored === 'granted' || stored === 'denied') updateAnalyticsConsent(stored)
  }, [])

  const choose = (consent: AnalyticsConsent) => {
    localStorage.setItem(STORAGE_KEY, consent)
    updateAnalyticsConsent(consent)
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="ll-cookie" role="dialog" aria-live="polite" aria-label={t('cookies.title')}>
      <div className="ll-cookie-text">
        <p className="ll-cookie-title">{t('cookies.title')}</p>
        <p className="ll-cookie-desc">
          {t('cookies.desc')}{' '}
          <a href="/faq" className="ll-cookie-link" onClick={(e) => { e.preventDefault(); onLearnMore() }}>
            {t('cookies.learnMore')}
          </a>
        </p>
      </div>
      <div className="ll-cookie-actions">
        <button type="button" className="ll-btn ll-btn--secondary" onClick={() => choose('denied')}>
          {t('cookies.decline')}
        </button>
        <button type="button" className="ll-btn ll-btn--primary" onClick={() => choose('granted')}>
          {t('cookies.accept')}
        </button>
      </div>
    </div>
  )
}
