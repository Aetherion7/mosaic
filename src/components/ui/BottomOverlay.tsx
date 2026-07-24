'use client'
import MultiSelectBar from '@/components/board/MultiSelectBar'
import ToastStack from './ToastStack'

// Gemeinsamer Fixpunkt für alle unten zentrierten Overlays (Mehrfachauswahl-
// Leiste + Rückgängig-/Status-Meldungen). Vorher hatte jedes seinen eigenen
// position:fixed-Anker an derselben Stelle — waren zwei gleichzeitig
// sichtbar, überlagerten sie sich exakt. Ein gemeinsamer column-reverse-
// Stapel sorgt stattdessen dafür, dass Neues unten erscheint und Älteres
// sanft nach oben rutscht. Die Auswahlleiste bleibt dabei stets zuunterst,
// da sie die gerade aktive Aktion repräsentiert.
export default function BottomOverlay() {
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: 0, right: 0, zIndex: 3000,
      display: 'flex', flexDirection: 'column-reverse', alignItems: 'center', gap: 10,
      pointerEvents: 'none',
    }}>
      <MultiSelectBar />
      <ToastStack />
    </div>
  )
}
