import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PluginErrorCode } from '@airongrong/plugin-api'
import { afterEach, describe, expect, it } from 'vitest'
import { verifyPluginPackage } from './package-files'

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

async function makeHookPackage(entrySource: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ait-cli-'))
  dirs.push(dir)
  await mkdir(join(dir, 'dist'), { recursive: true })
  await writeFile(join(dir, 'dist', 'index.mjs'), entrySource)
  const sha256 = createHash('sha256').update(entrySource).digest('hex')
  await writeFile(join(dir, 'plugin.json'), JSON.stringify({
    id: 'hook.cli-test',
    version: '1.0.0',
    apiVersion: '^1.0.0',
    type: 'hook',
    description: 'CLI 测试',
    entry: { module: './dist/index.mjs', sha256 },
    contributes: { hooks: ['beforePublish'] },
    permissions: { network: [] },
    engines: { aitoearn: '>=1.0.0' },
    license: 'MIT',
  }))
  return dir
}

describe('verifyPluginPackage', () => {
  it('自包含 ESM 通过校验', async () => {
    const dir = await makeHookPackage('export async function activate() { return { hooks: {} } }\n')
    const manifest = await verifyPluginPackage(dir)
    expect(manifest.id).toBe('hook.cli-test')
  })

  it('外部依赖被拒绝（单文件 ESM 约束）', async () => {
    const dir = await makeHookPackage('import axios from \'axios\'\nexport async function activate() { return { hooks: {} } }\n')
    await expect(verifyPluginPackage(dir)).rejects.toMatchObject({ code: PluginErrorCode.InvalidManifest })
  })

  it('node: 内置模块 import 同样被拒绝', async () => {
    const dir = await makeHookPackage('import { createHash } from \'node:crypto\'\nexport async function activate() { return { hooks: {} } }\n')
    await expect(verifyPluginPackage(dir)).rejects.toMatchObject({ code: PluginErrorCode.InvalidManifest })
  })

  it('@airongrong/plugin-api 导入允许存在（宿主注入，不打入产物）', async () => {
    const dir = await makeHookPackage('import { validateDraft } from \'@airongrong/plugin-api\'\nexport async function activate() { return { hooks: {} } }\n')
    const manifest = await verifyPluginPackage(dir)
    expect(manifest.id).toBe('hook.cli-test')
  })
})
