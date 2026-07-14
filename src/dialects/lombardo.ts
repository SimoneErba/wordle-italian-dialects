import allWords from '../../data/wiktionary/lombardo/all-words.json'
import { buildPackFromDownloadedFiles } from './buildPack'

export function createLombardoPack(wordLength = 5) {
  return buildPackFromDownloadedFiles({
  id: 'lombardo',
  name: 'Lombardo',
  area: 'Lombardia',
  locale: 'it-IT',
  wordLength,
  answersVersion: 'v3-lmo-wiktionary-import',
  entries: allWords,
  })
}

export const lombardoPack = createLombardoPack()
