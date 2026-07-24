'use client'
import { useT } from '@/hooks/useT'
import { SectionTitle, KbdRow } from './shared'

export default function TastenkürzelPanel() {
  const t = useT()
  return (
    <div>
      <SectionTitle>{t('Navigation')}</SectionTitle>
      <KbdRow keys={['E']} action={t('Toggle edit/view mode')} />
      <KbdRow keys={['A']} action={t('Add widget (edit mode only)')} />
      <KbdRow keys={['T']} action={t('Open / close themes panel')} />
      <KbdRow keys={['I']} action={t('Open / close AI assistant')} />
      <KbdRow keys={['S']} action={t('Open / close settings')} />
      <KbdRow keys={['Esc']} action={t('Close panel / selection')} />

      <SectionTitle>{t('Board')}</SectionTitle>
      <KbdRow keys={['Ctrl', 'Z']} action={t('Undo (calendar, drawboard)')} />
      <KbdRow keys={['Ctrl', 'Y']} action={t('Redo (calendar, drawboard)')} />

      <SectionTitle>{t('Table widget')}</SectionTitle>
      <KbdRow keys={['Enter']} action={t('Edit cell / confirm')} />
      <KbdRow keys={['Tab']} action={t('Next cell')} />
      <KbdRow keys={['Esc']} action={t('Cancel editing')} />
      <KbdRow keys={['↑', '↓', '←', '→']} action={t('Navigate cells')} />
      <KbdRow keys={['Ctrl', 'C']} action={t('Copy cell')} />
      <KbdRow keys={['Ctrl', 'V']} action={t('Paste')} />
      <KbdRow keys={['Delete']} action={t('Clear cell')} />

      <SectionTitle>{t('Drawboard widget')}</SectionTitle>
      <KbdRow keys={['Ctrl', '0']} action={t('Reset zoom')} />
      <KbdRow keys={['Delete']} action={t('Delete selected element')} />
      <KbdRow keys={['Alt', t('Drag')]} action={t('Pan canvas')} />
      <KbdRow keys={['Ctrl', t('Scroll')]} action={t('Zoom')} />
    </div>
  )
}
