import { collectBlobRefs, exportBlobs } from '@/lib/blobStore'
import type { Board } from '@/types'
import type { TrashedBoard } from '@/store/boardStore'
import type { CustomTheme, CustomTemplate, InstalledPlugin } from '@/store/settingsStore'

// Shared by the "Daten"-settings-panel and the board-overview page — both
// offer a full-backup export button and previously built this same payload
// shape independently, which had drifted into two near-identical copies.

export function downloadJson(payload: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export async function buildFullBackupPayload(
  boards: Record<string, Board>,
  trash: TrashedBoard[],
  settings: { customThemes: CustomTheme[]; customTemplates: CustomTemplate[]; installedPlugins: InstalledPlugin[] },
) {
  return {
    format:  'mosaic-backup' as const,
    version: 2,
    boards,
    settings: {
      customThemes:     settings.customThemes,
      customTemplates:  settings.customTemplates,
      installedPlugins: settings.installedPlugins,
    },
    blobs: await exportBlobs(collectBlobRefs({ boards, trash })),
  }
}

export async function buildBoardBackupPayload(board: Board) {
  return {
    format:  'mosaic-board' as const,
    version: 1,
    board,
    blobs: await exportBlobs(collectBlobRefs(board)),
  }
}

export function boardExportFilename(board: Board) {
  const name = board.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()
  return `board-${name}-${Date.now()}.json`
}

export function fullBackupFilename() {
  return `mosaic-export-${Date.now()}.json`
}
