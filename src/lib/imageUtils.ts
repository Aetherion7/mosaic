export async function compressImage(
  file: File,
  maxWidth  = 1920,
  maxHeight = 1920,
  quality   = 0.82,
): Promise<Blob | string> {
  // Ein <canvas>-Redraw rendert immer nur den ersten Frame — bei GIFs ginge damit
  // die Animation verloren, bei SVGs die Vektor-Skalierbarkeit. Beide unverändert
  // durchreichen statt "komprimieren".
  if (file.type === 'image/gif' || file.type.includes('svg')) return file

  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale  = Math.min(1, maxWidth / img.width, maxHeight / img.height)
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.width  * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      // JPEG für Fotos; PNG für transparente Bilder
      const isLossy = !file.type.includes('png')
      resolve(canvas.toDataURL(isLossy ? 'image/jpeg' : 'image/png', isLossy ? quality : undefined))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild konnte nicht geladen werden')) }
    img.src = url
  })
}

export async function compressAvatar(file: File): Promise<Blob | string> {
  return compressImage(file, 128, 128, 0.88)
}
