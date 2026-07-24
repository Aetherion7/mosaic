import { describe, it, expect } from 'vitest'
import { TILES } from '@/components/board/TilePicker'
import { BUILT_IN_WIDGETS } from '@/components/ui/settings/widgetCatalog'

// Regressionstest für den Audit-Fund "Reader-Widget fehlte in BUILT_IN_WIDGETS":
// beide Listen pflegen unabhängig voneinander dieselbe Menge an Widget-Typen
// (TilePicker fürs Hinzufügen-Panel, widgetCatalog für die Settings-Sidebar).
// Läuft das auseinander, fehlt einem Widget lautlos seine Settings-Seite.
describe('Widget-Kataloge bleiben synchron', () => {
  it('TILES und BUILT_IN_WIDGETS listen exakt dieselben Widget-Typen', () => {
    const tileTypes = new Set(TILES.map(t => t.type))
    const catalogTypes = new Set(BUILT_IN_WIDGETS.map(w => w.type))

    const missingInCatalog = [...tileTypes].filter(t => !catalogTypes.has(t))
    const missingInTiles   = [...catalogTypes].filter(t => !tileTypes.has(t))

    expect(missingInCatalog, 'in TILES, aber nicht in BUILT_IN_WIDGETS').toEqual([])
    expect(missingInTiles, 'in BUILT_IN_WIDGETS, aber nicht in TILES').toEqual([])
  })
})
