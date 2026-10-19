import { describe, it, expect } from 'vitest'
import { collectBlobRefs } from '@/lib/blobStore'

describe('collectBlobRefs', () => {
  it('findet direkte Referenzen und solche mitten im Notiz-Markdown', () => {
    const refs = collectBlobRefs({
      image: { src: 'idb-blob://b_1_1' },
      note: { content: '# Titel\n\n<img src="idb-blob://b_2_7" alt="" width="200">\n\nText <img src="idb-blob://b_3_9" alt="">' },
      other: 'kein blob hier',
    })
    expect([...refs].sort()).toEqual(['idb-blob://b_1_1', 'idb-blob://b_2_7', 'idb-blob://b_3_9'])
  })
})
