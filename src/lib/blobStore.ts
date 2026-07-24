'use client'
import { useEffect, useState } from 'react'

// ─── Blob-Speicher für Binärdaten (Bilder, PDFs) ──────────────────────────────
// Widgets speichern nur noch eine Referenz `idb-blob://<id>` im Board-JSON;
// die eigentlichen Bytes liegen als Blob in einer eigenen IndexedDB. Dadurch
// bleibt das persistierte Board-JSON klein (jede Änderung schreibt sonst alle
// Base64-Daten mit) und Backups betten die Daten nur beim Export ein.
// Alte Boards mit Base64-DataURLs funktionieren unverändert weiter —
// `useBlobUrl` reicht Nicht-Referenzen einfach durch.

const DB_NAME = 'planboard-blobs'
const STORE   = 'blobs'

export const BLOB_PREFIX = 'idb-blob://'

export function isBlobRef(src?: string | null): src is string {
  return typeof src === 'string' && src.startsWith(BLOB_PREFIX)
}

let _counter = 1
function newRef(): string {
  return `${BLOB_PREFIX}b_${Date.now()}_${_counter++}`
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload  = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

// Blob (oder DataURL) speichern → Referenz zurückgeben.
// `ref` kann vorgegeben werden (Backup-Import stellt unter gleicher ID wieder her).
export async function saveBlob(data: Blob | string, ref?: string): Promise<string> {
  const blob = typeof data === 'string' ? await dataUrlToBlob(data) : data
  const id   = ref ?? newRef()
  const db   = await openDB()
  await new Promise<void>((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(blob, id)
    req.onsuccess = () => resolve()
    req.onerror   = () => reject(req.error)
  })
  return id
}

export async function getBlob(ref: string): Promise<Blob | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(ref)
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null)
    req.onerror   = () => reject(req.error)
  })
}

export async function deleteBlob(ref: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(ref)
    req.onsuccess = () => resolve()
    req.onerror   = () => reject(req.error)
  })
}

async function listBlobRefs(): Promise<string[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys()
    req.onsuccess = () => resolve((req.result as string[]) ?? [])
    req.onerror   = () => reject(req.error)
  })
}

// ─── React-Hook: Referenz → anzeigbare URL ────────────────────────────────────
// DataURLs und normale URLs werden unverändert durchgereicht; idb-blob://-
// Referenzen werden geladen und als Objekt-URL bereitgestellt (inkl. Aufräumen).
// Rückgabe: null = lädt noch, '' = Blob fehlt/Fehler, sonst anzeigbare URL.
export function useBlobUrl(src?: string | null): string | null {
  // Nur Blob-Referenzen brauchen State — alles andere wird direkt durchgereicht
  const [resolved, setResolved] = useState<{ src: string; url: string | null } | null>(null)
  useEffect(() => {
    if (!isBlobRef(src)) return
    let alive = true
    let objUrl: string | null = null
    getBlob(src)
      .then(blob => {
        if (!alive) return
        if (blob) { objUrl = URL.createObjectURL(blob); setResolved({ src, url: objUrl }) }
        else setResolved({ src, url: '' })
      })
      .catch(() => { if (alive) setResolved({ src, url: '' }) })
    return () => {
      alive = false
      if (objUrl) URL.revokeObjectURL(objUrl)
    }
  }, [src])
  if (!isBlobRef(src)) return src ?? null
  return resolved?.src === src ? resolved.url : null
}

// ─── Export / Import / Aufräumen ──────────────────────────────────────────────

// Alle idb-blob://-Referenzen in einem JSON-serialisierbaren Objekt einsammeln
export function collectBlobRefs(obj: unknown, out: Set<string> = new Set()): Set<string> {
  if (typeof obj === 'string') {
    if (obj.startsWith(BLOB_PREFIX)) out.add(obj)
  } else if (Array.isArray(obj)) {
    for (const v of obj) collectBlobRefs(v, out)
  } else if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj)) collectBlobRefs(v, out)
  }
  return out
}

// Für Backups: Referenzen → DataURLs (eingebettet in die Export-Datei)
export async function exportBlobs(refs: Iterable<string>): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const ref of refs) {
    const blob = await getBlob(ref)
    if (blob) out[ref] = await blobToDataUrl(blob)
  }
  return out
}

// Beim Backup-Import: eingebettete DataURLs unter ihrer Referenz wiederherstellen
export async function importBlobs(blobs: Record<string, string> | undefined): Promise<void> {
  if (!blobs) return
  for (const [ref, dataUrl] of Object.entries(blobs)) {
    if (!ref.startsWith(BLOB_PREFIX) || typeof dataUrl !== 'string') continue
    try { await saveBlob(dataUrl, ref) } catch { /* einzelner Blob-Fehler bricht den Import nicht ab */ }
  }
}

// Nicht mehr referenzierte Blobs löschen (Aufruf einmal pro Sitzung nach der Hydration)
export async function pruneBlobs(referenced: Set<string>): Promise<void> {
  try {
    const all = await listBlobRefs()
    for (const ref of all) {
      if (!referenced.has(ref)) await deleteBlob(ref)
    }
  } catch { /* Aufräumen ist optional — nie die App stören */ }
}
