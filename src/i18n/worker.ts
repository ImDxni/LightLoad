import i18n from 'i18next'
import { resources, DEFAULT_LANG, type Lang } from './resources'

// Standalone i18next instance for the Web Worker: no React, no localStorage.
// The active language arrives with the optimization request (see setWorkerLang).
const instance = i18n.createInstance()
instance.init({
  resources,
  lng: DEFAULT_LANG,
  fallbackLng: DEFAULT_LANG,
  interpolation: { escapeValue: false },
})

export function setWorkerLang(lng: string) {
  if (lng && lng !== instance.language) instance.changeLanguage(lng as Lang)
}

export const t = instance.t.bind(instance)
