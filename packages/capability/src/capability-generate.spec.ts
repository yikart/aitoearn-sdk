import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { generateAllSurfaces, generateMcpTools, generateUiForms, generateValidationRules } from './capability-generate'
import { loadCapabilityManifest } from './capability-load'
import { CapabilitySideEffect } from './capability-schema'

const SAMPLE = {
  version: 1,
  actions: {
    publish_post: {
      summary: '发布图文',
      sideEffect: 'write',
      confirm: 'required',
      inputs: {
        text: { type: 'string', maxLength: 1000, ui: 'textarea', label: '正文' },
        images: { type: 'array', items: 'url', maxItems: 9, ui: 'uploader', label: '配图' },
        dryRun: { type: 'boolean', default: true, hidden: true },
      },
      returns: { postId: 'string' },
      errors: ['AIT-AG-002'],
    },
  },
}

describe('capability generators', () => {
  it('mCP 工具：写操作带 dryRun 默认值与错误码', () => {
    const [tool] = generateMcpTools(SAMPLE as never)
    expect(tool.name).toBe('publish_post')
    expect(tool.sideEffect).toBe(CapabilitySideEffect.Write)
    expect(tool.inputSchema['properties']).toHaveProperty('text')
    expect(tool.errors).toEqual(['AIT-AG-002'])
  })

  it('gUI 表单：隐藏字段不进入表单，写操作标记需确认', () => {
    const [form] = generateUiForms(SAMPLE as never)
    expect(form.confirmRequired).toBe(true)
    expect(form.fields.map(field => field.name)).toEqual(['text', 'images'])
    expect(form.fields[0].widget).toBe('textarea')
  })

  it('校验规则：长度/数量/格式一刀切', () => {
    const [rule] = generateValidationRules(SAMPLE as never)
    expect(rule.required).toEqual(['text', 'images'])
    expect(rule.maxLength).toEqual({ text: 1000 })
    expect(rule.maxItems).toEqual({ images: 9 })
    expect(rule.formats).toEqual({ images: 'uri' })
  })

  it('一次性派生五种产物', () => {
    const surfaces = generateAllSurfaces(SAMPLE as never)
    expect(Object.keys(surfaces)).toEqual(['mcp', 'ui', 'openapi', 'sdk', 'validation'])
    expect(surfaces.openapi['paths']).toHaveProperty('/actions/publish_post')
    expect(surfaces.sdk).toContain('export interface PublishPostInput')
  })

  it('缺省 inputs/errors/confirm 的原始清单也能派生（schema 自动补默认值）', () => {
    const surfaces = generateAllSurfaces({
      version: 1,
      actions: { ping: { summary: '探活', sideEffect: 'read' } },
    } as never)
    expect(surfaces.mcp[0]?.inputSchema).toEqual({ type: 'object', properties: {}, required: [] })
    expect(surfaces.mcp[0]?.confirm).toBe('none')
  })

  it('非法清单抛 PluginError 而不是 TypeError', () => {
    expect(() => generateAllSurfaces({ version: 0, actions: {} } as never)).toThrowError(/AIT-PL-001|capability\.yaml 非法/)
  })

  it('SDK 类型：必填字段（无 default 且非 hidden）不带 ?', () => {
    const { sdk } = generateAllSurfaces(SAMPLE as never)
    // text / images 无 default 且非 hidden → 必填
    expect(sdk).toContain('  text: string')
    expect(sdk).toContain('  images: string[]')
    // dryRun 有 default 且 hidden → 可选
    expect(sdk).toContain('  dryRun?: boolean')
  })

  it('SDK 类型：yaml 已声明 dryRun 时不再重复追加', () => {
    const { sdk } = generateAllSurfaces(SAMPLE as never)
    const dryRunLines = sdk.split('\n').filter(line => line.trim() === 'dryRun?: boolean')
    expect(dryRunLines).toHaveLength(1)
  })

  it('SDK 类型：action 名转 PascalCase（publish_post → PublishPost）', () => {
    const { sdk } = generateAllSurfaces(SAMPLE as never)
    expect(sdk).toContain('PublishPostInput')
    expect(sdk).toContain('PublishPostResult')
    expect(sdk).toContain('  publish_post(input: PublishPostInput): Promise<PublishPostResult>')
    expect(sdk).not.toContain('Publish_post')
  })
})

// 宿主（AiToEarn 服务端）自己的 capability.yaml 契约名冻结由宿主仓库守卫；
// SDK 只保证：任意符合 schema 的 yaml 都能被解析并派生表面。
describe('loadCapabilityManifest', () => {
  let workDir: string | undefined

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true })
      workDir = undefined
    }
  })

  it('解析 capability.yaml 并校验 schema', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'capability-'))
    const yamlPath = join(workDir, 'capability.yaml')
    await writeFile(yamlPath, `version: 1
actions:
  publish_post:
    summary: 发布图文
    sideEffect: write
    confirm: required
    inputs:
      text: { type: string, required: true }
    returns:
      postId: string
`, 'utf8')

    const manifest = await loadCapabilityManifest(yamlPath)
    expect(Object.keys(manifest.actions)).toEqual(['publish_post'])
    expect(manifest.actions['publish_post']?.sideEffect).toBe(CapabilitySideEffect.Write)
  })

  it('违反 schema 的清单直接抛错', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'capability-'))
    const yamlPath = join(workDir, 'capability.yaml')
    await writeFile(yamlPath, 'version: not-a-number\nactions: {}\n', 'utf8')

    await expect(loadCapabilityManifest(yamlPath)).rejects.toThrow()
  })
})
