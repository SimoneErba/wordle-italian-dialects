import allWords from '../../data/wiktionary/corso/all-words.json'
import { buildPackFromDownloadedFiles } from './buildPack'

export function createCorsoPack(wordLength = 5) {
  return buildPackFromDownloadedFiles({
  id: 'corso',
  name: 'Corso',
  area: 'Corsica',
  locale: 'it-IT',
  wordLength,
  answersVersion: 'v1-co-wiktionary-import',
  entries: allWords,
  })
}

export const corsoPack = createCorsoPack()
