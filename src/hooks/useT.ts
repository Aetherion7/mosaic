'use client'
import { useSettings } from '@/store/settingsStore'
import { translate } from '@/lib/i18n'

// t('English source text') → übersetzter Text in der aktuell eingestellten Sprache
export function useT() {
  const lang = useSettings(s => s.language)
  return (text: string) => translate(lang, text)
}
