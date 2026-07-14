import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

type Consent = 'granted' | 'denied'
const STORAGE_KEY = 'll_cookie_consent'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

function applyConsent(consent: Consent) {
  window.gtag?.('consent', 'update', { analytics_storage: consent })
}

export function CookieConsent({ onLearnMore }: { onLearnMore: () => void }) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored !== 'granted' && stored !== 'denied'
  })

  // Re-apply the stored choice to Google Consent Mode on every load (gtag default is always 'denied')
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'granted' || stored === 'denied') applyConsent(stored)
  }, [])

  const choose = (consent: Consent) => {
    localStorage.setItem(STORAGE_KEY, consent)
    applyConsent(consent)
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
