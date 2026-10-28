import { describe, expect, it } from 'vitest'
import { PluginErrorCode } from './plugin-error-code'
import { pluginManifestJsonSchema, pluginManifestSchema, verifyManifest } from './plugin-manifest'
import { isApiCompatible, satisfiesVersion } from './version'

const validHookManifest = {
  id: 'hook.media-spec',
  version: '1.0.0',
  apiVersion: '^1.0.0',
  type: 'hook',
  description: '图片/视频规格校验',
  entry: {
    module: './dist/index.mjs',
    sha256: '3f9a1c2e4b8a7d6f0e1c2a3b4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f7a',
  },
  contributes: {
    hooks: ['beforePublish'],
  },
  permissions: {
    network: ['open.example.com'],
  },
  engines: {
    aitoearn: '>=1.8.0 <3',
  },
  license: 'MIT',
}

describe('pluginManifestSchema 反例测试', () => {
  const invalidCases: Array<[string, Record<string, unknown>]> = [
    ['id 缺少类型前缀', { ...validHookManifest, id: 'media-spec' }],
    ['id 使用 adapter 未匹配前缀规则以外的大写', { ...validHookManifest, id: 'Hook.Media-Spec' }],
    ['id 段长不足', { ...validHookManifest, id: 'hook.a' }],
    ['id 超长', { ...validHookManifest, id: `hook.${'a'.repeat(33)}` }],
    ['id 含下划线', { ...validHookManifest, id: 'hook.media_spec' }],
    ['version 非 semver', { ...validHookManifest, version: 'v1.0' }],
    ['version 缺 patch', { ...validHookManifest, version: '1.0' }],
    ['apiVersion 非法区间', { ...validHookManifest, apiVersion: 'latest' }],
    ['apiVersion 空串', { ...validHookManifest, apiVersion: '' }],
    ['type 非法', { ...validHookManifest, type: 'channel' }],
    ['entry.module 不在 dist', { ...validHookManifest, entry: { ...validHookManifest.entry, module: './src/index.mjs' } }],
    ['entry.module 非 mjs', { ...validHookManifest, entry: { ...validHookManifest.entry, module: './dist/index.js' } }],
    ['entry.module 路径穿越', { ...validHookManifest, entry: { ...validHookManifest.entry, module: 'dist/../../evil.mjs' } }],
    ['entry.sha256 非 64 位', { ...validHookManifest, entry: { ...validHookManifest.entry, sha256: 'abcd' } }],
    ['entry.sha256 含大写', { ...validHookManifest, entry: { ...validHookManifest.entry, sha256: `A${validHookManifest.entry.sha256.slice(1)}` } }],
    ['network 使用通配符', { ...validHookManifest, permissions: { network: ['*.example.com'] } }],
    ['network 使用 IP 字面量', { ...validHookManifest, permissions: { network: ['127.0.0.1'] } }],
    ['network 域名非法', { ...validHookManifest, permissions: { network: ['-bad-.com'] } }],
    ['network 超过 5 个域名', { ...validHookManifest, permissions: { network: ['a.com', 'b.com', 'c.com', 'd.com', 'e.com', 'f.com'] } }],
    ['network 字段缺失', { ...validHookManifest, permissions: {} }],
    ['contributes 缺失', { ...validHookManifest, contributes: undefined }],
    ['contributes.channels.capabilities 为空', { ...validHookManifest, contributes: { channels: [{ id: 'x', label: 'X', capabilities: [] }] } }],
    ['contributes.hooks 名称非法', { ...validHookManifest, contributes: { hooks: ['onPublish'] } }],
    ['engines.aitoearn 非法', { ...validHookManifest, engines: { aitoearn: 'stable' } }],
    ['engines 缺失', { ...validHookManifest, engines: undefined }],
    ['license 缺失', { ...validHookManifest, license: undefined }],
    ['description 为空', { ...validHookManifest, description: '' }],
  ]

  it.each(invalidCases)('拒绝: %s', (_title, input) => {
    const result = pluginManifestSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('拒绝: 技能插件携带 entry', () => {
    const result = pluginManifestSchema.safeParse({
      ...validHookManifest,
      id: 'skill.xhs-copywriting',
      type: 'skill',
      contributes: { skills: ['xhs-copywriting'] },
    })
    expect(result.success).toBe(false)
  })

  it('拒绝: hook 插件缺少 entry', () => {
    const { entry: _entry, ...rest } = validHookManifest
    const result = pluginManifestSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('接受合法 hook 清单', () => {
    expect(verifyManifest(validHookManifest).id).toBe('hook.media-spec')
  })

  it('接受合法 skill 清单（无 entry）', () => {
    const { entry: _entry, ...rest } = validHookManifest
    const manifest = verifyManifest({
      ...rest,
      id: 'skill.xhs-copywriting',
      type: 'skill',
      contributes: { skills: ['xhs-copywriting'] },
    })
    expect(manifest.entry).toBeUndefined()
  })

  it('接受合法 adapter 清单', () => {
    const manifest = verifyManifest({
      ...validHookManifest,
      id: 'channel.xiaohongshu',
      type: 'adapter',
      contributes: {
        channels: [{
          id: 'xiaohongshu',
          label: '小红书',
          capabilities: ['publish.note', 'publish.video', 'metrics.basic'],
        }],
      },
      permissions: { network: ['open.xiaohongshu.com', 'edith.xiaohongshu.com'], secrets: ['oauth.access_token'], storage: { kv: true, bytes: 1048576 } },
    })
    expect(manifest.type).toBe('adapter')
  })

  it('接受 v2.0 示例形态：module 无 ./ 前缀、含 $schema 与 publisher.id', () => {
    const manifest = verifyManifest({
      $schema: 'https://cdn.aitoearn.ai/schema/plugin-v1.json',
      id: 'channel.xiaohongshu',
      name: '小红书',
      version: '1.2.0',
      apiVersion: '^1.0.0',
      type: 'adapter',
      description: '小红书图文与视频发布，支持基础数据回读',
      publisher: { id: 'aitoearn', keyId: 'aitoearn-2026' },
      entry: {
        module: 'dist/index.mjs',
        sha256: '3f9a1c0d7b2e4f6a8c1d3e5f7a9b0c2d4e6f8a0b1c3d5e7f9a0b2c4d6e8f0a1b',
      },
      contributes: {
        channels: [{ id: 'xiaohongshu', label: '小红书', capabilities: ['publish.note', 'publish.video', 'metrics.basic'] }],
        hooks: ['beforePublish'],
        skills: [],
      },
      permissions: {
        network: ['open.xiaohongshu.com', 'edith.xiaohongshu.com'],
        secrets: ['oauth.access_token'],
        storage: { kv: true, bytes: 1048576 },
      },
      engines: { aitoearn: '>=1.8.0 <3' },
      license: 'MIT',
    })
    expect(manifest.entry?.module).toBe('dist/index.mjs')
    expect(manifest.publisher?.id).toBe('aitoearn')
  })

  it('拒绝: publisher 既无 id 也无 name', () => {
    const result = pluginManifestSchema.safeParse({
      ...validHookManifest,
      publisher: { keyId: 'k' },
    })
    expect(result.success).toBe(false)
  })

  it('verifyManifest 抛错并附带 AIT-PL-001', () => {
    try {
      verifyManifest({ ...validHookManifest, id: 'bad id' })
      expect.unreachable()
    }
    catch (error) {
      expect((error as { code: string }).code).toBe(PluginErrorCode.InvalidManifest)
    }
  })

  it('导出可供三端宿主解析的 JSON Schema', () => {
    expect(pluginManifestJsonSchema.type).toBe('object')
    expect((pluginManifestJsonSchema as Record<string, unknown>)['properties']).toBeTypeOf('object')
  })
})

describe('satisfiesVersion', () => {
  it.each([
    ['1.8.0', '>=1.8.0 <3', true],
    ['2.9.9', '>=1.8.0 <3', true],
    ['3.0.0', '>=1.8.0 <3', false],
    ['1.7.9', '>=1.8.0 <3', false],
    ['1.2.3', '^1.2.0', true],
    ['2.0.0', '^1.2.0', false],
    ['1.2.9', '~1.2.0', true],
    ['1.3.0', '~1.2.0', false],
    ['1.2.3', '1.2.3', true],
    ['1.2.4', '1.2.3', false],
    ['bad', '^1.0.0', false],
    ['1.0.0', 'garbage', false],
  ])('%s satisfies %s => %s', (version, range, expected) => {
    expect(satisfiesVersion(version, range)).toBe(expected)
  })
})

describe('isApiCompatible', () => {
  it('同主版本且区间命中才兼容', () => {
    expect(isApiCompatible('^1.0.0', '1.0.0')).toBe(true)
    expect(isApiCompatible('^1.0.0', '1.4.2')).toBe(true)
    expect(isApiCompatible('^1.0.0', '2.0.0')).toBe(false)
    expect(isApiCompatible('^2.0.0', '1.0.0')).toBe(false)
  })

  it('支持复合区间（如 >=1.8.0 <3）', () => {
    expect(isApiCompatible('>=1.8.0 <3', '1.8.0')).toBe(true)
    expect(isApiCompatible('>=1.8.0 <3', '2.9.9')).toBe(true)
    expect(isApiCompatible('>=1.8.0 <3', '1.7.9')).toBe(false)
    expect(isApiCompatible('>=1.8.0 <3', '3.0.0')).toBe(false)
  })

  it('边界语义与非法区间', () => {
    // <3.0.0 排除主版本 3，<3.0.1 仍允许 3.0.0
    expect(isApiCompatible('<3.0.0', '3.0.0')).toBe(false)
    expect(isApiCompatible('<3.0.1', '3.0.0')).toBe(true)
    // 开放上界按区间字面含义放行
    expect(isApiCompatible('>=0.5.0', '1.4.2')).toBe(true)
    expect(isApiCompatible('~1.2.0', '1.3.0')).toBe(false)
    expect(isApiCompatible('garbage', '1.0.0')).toBe(false)
  })
})
