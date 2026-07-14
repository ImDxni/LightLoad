declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

export type AnalyticsConsent = 'granted' | 'denied'

export function updateAnalyticsConsent(consent: AnalyticsConsent) {
  window.gtag?.('consent', 'update', { analytics_storage: consent })
}

export function trackEvent(name: string, params?: Record<string, unknown>) {
  window.gtag?.('event', name, params)
}
