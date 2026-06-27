import i18n from 'i18next'
import { resources, DEFAULT_LANG, type Lang } from './resources'

// Istanza i18next autonoma per il Web Worker: niente React, niente localStorage.
// La lingua attiva arriva con la richiesta di ottimizzazione (vedi setWorkerLang).
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
