import { DialectPack } from '../types'
import { corsoPack, createCorsoPack } from './corso'
import { createLombardoPack, lombardoPack } from './lombardo'
import { createNapoletanoPack, napoletanoPack } from './napoletano'
import { createSardoPack, sardoPack } from './sardo'
import { createSicilianoPack, sicilianoPack } from './siciliano'
import { createVenetoPack, venetoPack } from './veneto'

export const dialectPacks: DialectPack[] = [
  napoletanoPack,
  sicilianoPack,
  venetoPack,
  lombardoPack,
  corsoPack,
  sardoPack,
]

const packFactories: Record<string, (wordLength?: number) => DialectPack> = {
  corso: createCorsoPack,
  lombardo: createLombardoPack,
  napoletano: createNapoletanoPack,
  sardo: createSardoPack,
  siciliano: createSicilianoPack,
  veneto: createVenetoPack,
}

export function getDialectById(id: string, wordLength?: number): DialectPack {
  const pack = dialectPacks.find((item) => item.id === id) ?? dialectPacks[0]
  if (!wordLength) {
    return pack
  }

  return packFactories[pack.id]?.(wordLength) ?? pack
}
