import allWords from '../../data/wiktionary/napoletano/all-words.json'
import { buildPackFromDownloadedFiles } from './buildPack'

export function createNapoletanoPack(wordLength = 5) {
  return buildPackFromDownloadedFiles({
  id: 'napoletano',
  name: 'Napoletano',
  area: 'Campania',
  locale: 'it-IT',
  wordLength,
  answersVersion: 'v2-api-import',
  entries: allWords,
  })
}

export const napoletanoPack = createNapoletanoPack()
