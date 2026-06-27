import it from './locales/it.json'
import en from './locales/en.json'

export const SUPPORTED_LANGUAGES = ['it', 'en'] as const
export type Lang = (typeof SUPPORTED_LANGUAGES)[number]

export const DEFAULT_LANG: Lang = 'en'

export const resources = {
  it: { translation: it },
  en: { translation: en },
} as const
