const segmenter = new Intl.Segmenter('it', {
  granularity: 'grapheme',
})

export function normalizeWord(value: string): string {
  return value
    .replace(/[\u0027\u0060\u00B4]/g, '\u2019')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .normalize('NFC')
    .trim()
    .toLocaleLowerCase('it')
}

export function getLetters(word: string): string[] {
  return [...segmenter.segment(word.normalize('NFC'))].map((part) => part.segment)
}

export function hasOnlyLetters(word: string): boolean {
  return getLetters(word).every((letter) => /\p{L}/u.test(letter))
}

export function stripLastLetter(word: string): string {
  return getLetters(word).slice(0, -1).join('')
}
