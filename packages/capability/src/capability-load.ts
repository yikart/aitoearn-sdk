import type { CapabilityManifest } from './capability-schema'
import { readFile } from 'node:fs/promises'
import { parse } from 'yaml'
import { verifyCapabilityManifest } from './capability-schema'

/** 读取并校验 capability.yaml（§13.1 唯一事实源） */
export async function loadCapabilityManifest(path: string): Promise<CapabilityManifest> {
  const raw = await readFile(path, 'utf8')
  return verifyCapabilityManifest(parse(raw))
}
