import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PLUGIN_ID_PATTERN, PluginError, PluginErrorCode, PluginType } from '@airongrong/plugin-api'

const TEMPLATES: Record<PluginType, { entry: string, manifest: (id: string) => Record<string, unknown> }> = {
  [PluginType.Hook]: {
    entry: `export async function activate() {
  return {
    hooks: {
      async beforePublish(draft) {
        if (!draft.text.trim()) {
          throw new Error('正文不能为空')
        }
      },
    },
  }
}
`,
    manifest: id => ({
      id,
      version: '0.1.0',
      apiVersion: '^1.0.0',
      type: 'hook',
      description: 'TODO: 一句话描述钩子用途',
      entry: { module: './dist/index.mjs', sha256: '0'.repeat(64) },
      contributes: { hooks: ['beforePublish'] },
      permissions: { network: [] },
      engines: { aitoearn: '>=1.8.0 <3' },
      license: 'MIT',
    }),
  },
  [PluginType.Adapter]: {
    entry: `export async function activate(host) {
  return {
    adapter: {
      meta: { id: 'acme', label: 'Acme', capabilities: ['publish.text'] },
      async authorize() { throw new Error('TODO') },
      validate(draft) { return draft.text ? [] : [{ severity: 'error', message: '正文不能为空' }] },
      async publish(draft) {
        // const res = await host.http.request({ url: 'https://api.example.com/posts', method: 'POST', body: JSON.stringify({ text: draft.text }) })
        return { externalId: draft.draftId, url: 'https://example.com/' + draft.draftId, publishedAt: new Date().toISOString() }
      },
    },
  }
}
`,
    manifest: id => ({
      id,
      version: '0.1.0',
      apiVersion: '^1.0.0',
      type: 'adapter',
      description: 'TODO: 一句话描述渠道用途',
      entry: { module: './dist/index.mjs', sha256: '0'.repeat(64) },
      contributes: { channels: [{ id: 'acme', label: 'Acme', capabilities: ['publish.text'] }] },
      permissions: { network: ['api.example.com'], secrets: ['oauth.access_token'] },
      engines: { aitoearn: '>=1.8.0 <3' },
      license: 'MIT',
    }),
  },
  [PluginType.Skill]: {
    entry: '',
    manifest: id => ({
      id,
      version: '0.1.0',
      apiVersion: '^1.0.0',
      type: 'skill',
      description: 'TODO: 一句话描述技能用途',
      contributes: { skills: [id.split('.')[1]] },
      permissions: { network: [] },
      engines: { aitoearn: '>=1.8.0 <3' },
      license: 'MIT',
    }),
  },
}

export async function scaffoldPlugin(parentDir: string, id: string, type: PluginType): Promise<string> {
  if (!PLUGIN_ID_PATTERN.test(id)) {
    throw new PluginError(
      PluginErrorCode.InvalidManifest,
      `插件 id 非法: ${id}（必须匹配 ${PLUGIN_ID_PATTERN.source}，如 hook.media-spec / channel.acme / skill.xhs-copywriting）`,
    )
  }
  const dir = join(parentDir, id)
  if (existsSync(dir)) {
    throw new PluginError(PluginErrorCode.InvalidManifest, `目录已存在: ${dir}`)
  }
  const template = TEMPLATES[type]
  await mkdir(join(dir, 'tests', 'fixtures'), { recursive: true })
  await mkdir(join(dir, 'dist'), { recursive: true })
  await writeFile(join(dir, 'plugin.json'), `${JSON.stringify(template.manifest(id), null, 2)}\n`)
  if (template.entry) {
    await writeFile(join(dir, 'dist', 'index.mjs'), template.entry)
  }
  await writeFile(join(dir, 'README.md'), `# ${id}\n\nTODO: 插件说明\n`)
  await writeFile(join(dir, 'CHANGELOG.md'), `# 0.1.0\n\n- 初始版本\n`)
  return dir
}
