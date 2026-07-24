import { describe, it, expect, vi, afterEach } from 'vitest'
import { idbStorage } from '@/lib/idbStorage'

// Ohne dieses Event blieb ein fehlgeschlagener Schreibvorgang (Quota voll,
// privater Browser-Modus …) komplett lautlos — die Änderung wirkt im UI
// übernommen, ist aber nicht persistiert (siehe StorageErrorBanner.tsx).
describe('idbStorage — Fehler beim Schreiben werden sichtbar gemacht', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    // @ts-expect-error -- Test-Cleanup: von uns gesetztes globalThis.window entfernen
    delete globalThis.window
  })

  it('feuert mosaic:storage-error und wirft weiter, wenn indexedDB.open fehlschlägt', async () => {
    const dispatchEvent = vi.fn()
    // @ts-expect-error -- minimaler window-Stub reicht für diesen Test
    globalThis.window = { dispatchEvent }

    // Einfachster zuverlässiger Fehlerpfad: das Öffnen der DB selbst schlägt
    // fehl — landet in setItem() im selben catch-Zweig wie ein fehlgeschlagener
    // put() (Quota etc.), ohne fake-indexeddbs Transaktions-Internas anfassen
    // zu müssen.
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      const req = { onerror: null, onsuccess: null, onupgradeneeded: null } as unknown as IDBOpenDBRequest
      queueMicrotask(() => {
        Object.assign(req, { error: new DOMException('boom', 'UnknownError') })
        req.onerror?.(new Event('error') as never)
      })
      return req
    })

    await expect(idbStorage.setItem('planboard-settings', '{"x":1}')).rejects.toBeTruthy()
    expect(dispatchEvent).toHaveBeenCalledTimes(1)
    const evt = dispatchEvent.mock.calls[0][0] as CustomEvent
    expect(evt.type).toBe('mosaic:storage-error')
    expect(evt.detail.name).toBe('planboard-settings')
  })

  it('feuert nichts und funktioniert normal, wenn kein window existiert (SSR/Node)', async () => {
    await idbStorage.setItem('planboard-settings', '{"ok":true}')
    const v = await idbStorage.getItem('planboard-settings')
    expect(v).toBe('{"ok":true}')
  })
})
