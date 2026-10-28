import type { PluginManifest } from '@aitoearn/plugin-api'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { assertPluginEntrySource, PluginError, PluginErrorCode, verifyManifest } from '@aitoearn/plugin-api'

export interface PluginPackageFiles {
  dir: string
  manifest: PluginManifest
  entrySource?: string
  entryBytes?: Buffer
}

export async function readPluginPackage(dir: string): Promise<PluginPackageFiles> {
  const manifestPath = join(dir, 'plugin.json')
  if (!existsSync(manifestPath)) {
    throw new PluginError(PluginErrorCode.InvalidManifest, `plugin.json 不存在: ${manifestPath}`)
  }
  const manifest = verifyManifest(JSON.parse(await readFile(manifestPath, 'utf8')) as unknown)
  const pkg: PluginPackageFiles = { dir, manifest }
  if (manifest.entry) {
    const entryPath = join(dir, manifest.entry.module.replace(/^\.\//, ''))
    pkg.entryBytes = await readFile(entryPath)
    pkg.entrySource = pkg.entryBytes.toString('utf8')
  }
  return pkg
}

export async function verifyPluginPackage(dir: string): Promise<PluginManifest> {
  const pkg = await readPluginPackage(dir)
  const { manifest } = pkg
  if (pkg.entryBytes && pkg.entrySource !== undefined) {
    const actual = createHash('sha256').update(pkg.entryBytes).digest('hex')
    if (actual !== manifest.entry!.sha256) {
      throw new PluginError(
        PluginErrorCode.HashMismatch,
        `产物哈希不匹配（AIT-PL-002）: 期望 ${manifest.entry!.sha256}，实际 ${actual}，请重新打包`,
      )
    }
    assertPluginEntrySource(pkg.entrySource, manifest.entry!.module)
  }
  if (existsSync(join(dir, 'node_modules'))) {
    throw new PluginError(PluginErrorCode.InvalidManifest, '插件禁止携带 node_modules（AIT-PL-001）')
  }
  return manifest
}

/** 收集打包文件：plugin.json + dist + skills + README/CHANGELOG */
export async function collectPackageFiles(dir: string): Promise<Array<{ name: string, data: Buffer }>> {
  const files: Array<{ name: string, data: Buffer }> = []
  const includeDirs = ['dist', 'skills']
  for (const sub of includeDirs) {
    const subDir = join(dir, sub)
    if (!existsSync(subDir)) {
      continue
    }
    const stack = [subDir]
    while (stack.length > 0) {
      const current = stack.pop()!
      const entries = await readdir(current, { withFileTypes: true })
      for (const entry of entries) {
        const full = join(current, entry.name)
        if (entry.isDirectory()) {
          stack.push(full)
        }
        else {
          files.push({ name: relative(dir, full), data: await readFile(full) })
        }
      }
    }
  }
  for (const doc of ['README.md', 'CHANGELOG.md']) {
    const docPath = join(dir, doc)
    if (existsSync(docPath)) {
      files.push({ name: doc, data: await readFile(docPath) })
    }
  }
  files.push({ name: 'plugin.json', data: await readFile(join(dir, 'plugin.json')) })
  return files
}
