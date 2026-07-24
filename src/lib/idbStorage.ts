const DB_NAME = 'planboard-store'
const STORE  = 'kv'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

export const idbStorage = {
  async getItem(name: string): Promise<string | null> {
    const db = await openDB()
    const idbVal: string | null = await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(name)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror   = () => reject(req.error)
    })
    if (idbVal !== null) return idbVal

    // One-time migration from localStorage
    try {
      const lsVal = localStorage.getItem(name)
      if (lsVal) {
        await idbStorage.setItem(name, lsVal)
        localStorage.removeItem(name)
        return lsVal
      }
    } catch { /* localStorage may be unavailable */ }
    return null
  },
  async setItem(name: string, value: string): Promise<void> {
    try {
      const db = await openDB()
      await new Promise<void>((resolve, reject) => {
        const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, name)
        req.onsuccess = () => resolve()
        req.onerror   = () => reject(req.error)
      })
    } catch (err) {
      // Ohne diesen Hinweis würde ein fehlgeschlagener Schreibvorgang (z.B.
      // Storage-Quota voll, privater Modus mancher Browser) komplett lautlos
      // bleiben — die Änderung wirkt im UI übernommen, ist aber nicht
      // persistiert und geht beim nächsten Laden verloren. idbStorage kennt
      // keine Stores/Toasts (Zirkelimport) — daher ein DOM-Event, auf das
      // StorageErrorBanner (app/layout.tsx) global lauscht.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mosaic:storage-error', { detail: { name, err } }))
      }
      throw err
    }
  },
  async removeItem(name: string): Promise<void> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(name)
      req.onsuccess = () => resolve()
      req.onerror   = () => reject(req.error)
    })
  },
}
