import { describe, it, expect } from 'vitest'
import { evalSafeExpr, buildFormulaFns, FormulaError } from '@/lib/safeFormula'

const fns = buildFormulaFns('en-US')
const ev = (src: string) => evalSafeExpr(src, fns)

// ── Sicherheit: der eigentliche Grund für diesen Parser ──────────────────────
// Vorher: new Function(`return ${e}`) — jeder dieser Strings hätte echten JS-
// Code ausgeführt (u.a. Zugriff auf window/document/fetch/localStorage aus
// importierten Board-/Backup-Dateien). Jetzt müssen sie alle als unbekannter
// Bezeichner/unerwartetes Zeichen scheitern — nie als Code laufen.
describe('evalSafeExpr — kein Codeausführungs-Escape', () => {
  const attempts = [
    'window',
    'window.alert(1)',
    'globalThis',
    'this',
    'document.cookie',
    "fetch('https://evil.example')",
    "(function(){return 1})()",
    "(()=>1)()",
    'constructor',
    'constructor()',
    'toString',
    'toString()',
    'hasOwnProperty',
    'hasOwnProperty()',
    'valueOf()',
    '__proto__',
    "SUM.constructor('return 1')()",
    "''.constructor",
    'eval("1")',
    'Function("return 1")()',
    'process',
    'require("fs")',
  ]
  for (const src of attempts) {
    it(`"${src}" wirft statt auszuführen`, () => {
      expect(() => ev(src)).toThrow()
    })
  }

  it('whitelisted Funktionsname ohne Klammern bleibt ein unbekannter Bezeichner', () => {
    expect(() => ev('SUM')).toThrow(FormulaError)
  })

  it('Aufruf einer nicht-whitelisted Funktion scheitert', () => {
    expect(() => ev('ALERT(1)')).toThrow(FormulaError)
  })
})

// ── Funktionale Kompatibilität zur vorherigen new-Function-Implementierung ───
describe('evalSafeExpr — Arithmetik & Operatoren', () => {
  it('Grundrechenarten mit Klammern/Präzedenz', () => {
    expect(ev('1+2*3')).toBe(7)
    expect(ev('(1+2)*3')).toBe(9)
    expect(ev('10/4')).toBe(2.5)
    expect(ev('10%3')).toBe(1)
    expect(ev('-5+2')).toBe(-3)
  })
  it('Potenz über ^ und **', () => {
    expect(ev('2^10')).toBe(1024)
    expect(ev('2**10')).toBe(1024)
  })
  it('Vergleiche', () => {
    expect(ev('5>3')).toBe(true)
    expect(ev('5<3')).toBe(false)
    expect(ev('5==5')).toBe(true)
    expect(ev('5!=4')).toBe(true)
  })
  it('Ternary und Boolean-Literale', () => {
    expect(ev('TRUE?1:2')).toBe(1)
    expect(ev('FALSE?1:2')).toBe(2)
  })
  it('PI-Konstante', () => {
    expect(ev('PI')).toBeCloseTo(Math.PI)
  })
  it('String-Verkettung über +', () => {
    expect(ev('"a"+"b"')).toBe('ab')
  })
})

describe('evalSafeExpr — Tabellenfunktionen', () => {
  it('SUM/AVERAGE/MAX/MIN über Array-Literale (simulierte Ranges)', () => {
    expect(ev('SUM([1,2,3])')).toBe(6)
    expect(ev('AVERAGE([2,4,6])')).toBe(4)
    expect(ev('MAX([1,9,3])')).toBe(9)
    expect(ev('MIN([1,9,3])')).toBe(1)
  })
  it('IF/AND/OR/NOT', () => {
    expect(ev('IF(5>3,"yes","no")')).toBe('yes')
    expect(ev('AND(TRUE,TRUE)')).toBe(true)
    expect(ev('OR(FALSE,TRUE)')).toBe(true)
    expect(ev('NOT(FALSE)')).toBe(true)
  })
  it('COUNTIF mit Vergleichs-Kriterium', () => {
    expect(ev('COUNTIF([1,2,3,4,5],">3")')).toBe(2)
  })
  it('Text-Funktionen', () => {
    expect(ev('UPPER("abc")')).toBe('ABC')
    expect(ev('LEFT("hello",3)')).toBe('hel')
    expect(ev('CONCATENATE("a","b","c")')).toBe('abc')
    expect(ev('ROUND(3.14159,2)')).toBe(3.14)
  })
  it('unbekannte Referenz/Syntaxfehler ergibt Error, kein Absturz', () => {
    expect(() => ev('1 + + +')).toThrow()
  })
  it('MAX/MIN über eine leere Auswahl liefert 0, nicht Infinity/-Infinity', () => {
    expect(ev('MAX([])')).toBe(0)
    expect(ev('MIN([])')).toBe(0)
  })
  it('SUBSTITUTE ohne instance_num ersetzt alle Vorkommen', () => {
    expect(ev('SUBSTITUTE("a-a-a","a","b")')).toBe('b-b-b')
  })
  it('SUBSTITUTE mit instance_num ersetzt nur das n-te Vorkommen', () => {
    expect(ev('SUBSTITUTE("a-a-a","a","b",2)')).toBe('a-b-a')
    expect(ev('SUBSTITUTE("a-a-a","a","b",1)')).toBe('b-a-a')
    expect(ev('SUBSTITUTE("a-a-a","a","b",99)')).toBe('a-a-a')
  })
})
