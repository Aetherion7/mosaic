// Geteilte Web-Notification-Hilfsfunktionen — ursprünglich nur in
// TimerWidget.tsx, jetzt auch vom ReminderScheduler (Kalender-Erinnerungen)
// genutzt. fireNotification selbst hat bewusst KEIN "nur wenn Tab
// unsichtbar"-Gate wie TimerWidget es früher inline hatte — das war eine
// TimerWidget-spezifische UX-Entscheidung ("nur stören, wenn man weggeschaut
// hat"), für eine zeitlich geplante Erinnerung aber falsch: die soll
// unabhängig vom Fokuszustand feuern. Wer dieses Verhalten will, prüft
// document.hidden selbst vor dem Aufruf (siehe TimerWidget.tsx).
export function requestNotifyPermission() {
  try {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  } catch { /* Notification nicht verfügbar */ }
}

export function fireNotification(title: string, body: string): Notification | null {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const n = new Notification(title, { body, icon: '/mosaiclogo.png' })
      n.onclick = () => { window.focus(); n.close() }
      return n
    }
  } catch { /* Notification nicht verfügbar */ }
  return null
}
