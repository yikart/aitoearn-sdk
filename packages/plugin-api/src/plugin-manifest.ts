import { z } from 'zod'
import { PluginError, PluginErrorCode } from './plugin-error-code'

export enum PluginType {
  Skill = 'skill',
  Hook = 'hook',
  Adapter = 'adapter',
}

export enum PluginHookName {
  ValidateDraft = 'validateDraft',
  BeforePublish = 'beforePublish',
  AfterPublish = 'afterPublish',
  OnAuthExpired = 'onAuthExpired',
}

export enum Capability {
  PublishText = 'publish.text',
  PublishNote = 'publish.note',
  PublishImage = 'publish.image',
  PublishVideo = 'publish.video',
  PublishThread = 'publish.thread',
  PublishScheduled = 'publish.scheduled',
  MetricsBasic = 'metrics.basic',
  MetricsEngagement = 'metrics.engagement',
}

export const PLUGIN_ID_PATTERN = /^(skill|hook|channel)\.[a-z0-9-]{2,32}$/

const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/
const SEMVER_RANGE_PATTERN = /^([\^~]|>=|<=|[><=])?\d+(\.\d+){0,2}(\s+([\^~]|>=|<=|[><=])?\d+(\.\d+){0,2})*$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const DOMAIN_PATTERN = /^(?!\d+\.\d+\.\d+\.\d+$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i
const MODULE_PATTERN = /^(?:\.\/)?dist\/[\w./-]+\.mjs$/

export const pluginDomainSchema = z.string().regex(
  DOMAIN_PATTERN,
  'network 域名必须是合法主机名，禁止通配符与 IP 字面量',
)

export const pluginManifestSchema = z.object({
  $schema: z.string().min(1).optional(),
  id: z.string().regex(PLUGIN_ID_PATTERN, 'id 必须匹配 ^(skill|hook|channel)\\.[a-z0-9-]{2,32}$'),
  version: z.string().regex(SEMVER_PATTERN, 'version 必须是 semver'),
  apiVersion: z.string().regex(SEMVER_RANGE_PATTERN, 'apiVersion 必须是 semver 区间，如 ^1.0.0'),
  type: z.enum(Object.values(PluginType)),
  name: z.string().min(1).optional(),
  description: z.string().min(1),
  entry: z.object({
    module: z.string().regex(MODULE_PATTERN, 'entry.module 必须是打包后的单文件 ESM（dist/*.mjs）'),
    sha256: z.string().regex(SHA256_PATTERN, 'entry.sha256 必须是 64 位小写十六进制'),
  }).optional(),
  contributes: z.object({
    channels: z.array(z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      capabilities: z.array(z.enum(Object.values(Capability))).min(1),
    })).optional(),
    hooks: z.array(z.enum(Object.values(PluginHookName))).optional(),
    skills: z.array(z.string().min(1)).optional(),
  }),
  permissions: z.object({
    network: z.array(pluginDomainSchema).max(5, 'permissions.network 单插件上限 5 个域名'),
    secrets: z.array(z.string().min(1)).optional(),
    storage: z.object({
      kv: z.boolean().optional(),
      bytes: z.number().int().positive().optional(),
    }).optional(),
  }),
  engines: z.object({
    aitoearn: z.string().regex(SEMVER_RANGE_PATTERN, 'engines.aitoearn 必须是 semver 区间'),
  }),
  license: z.string().min(1),
  publisher: z.object({
    id: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    keyId: z.string().min(1).optional(),
  }).optional(),
  signature: z.string().min(1).optional(),
}).superRefine((manifest, context) => {
  if (manifest.type === PluginType.Skill && manifest.entry) {
    context.addIssue({
      code: 'custom',
      path: ['entry'],
      message: '技能插件禁止 entry 字段（技能不执行代码）',
    })
  }
  if (manifest.type !== PluginType.Skill && !manifest.entry) {
    context.addIssue({
      code: 'custom',
      path: ['entry'],
      message: `${manifest.type} 插件必须声明 entry（单文件 ESM 产物与 sha256）`,
    })
  }
  if (manifest.publisher && !manifest.publisher.id && !manifest.publisher.name) {
    context.addIssue({
      code: 'custom',
      path: ['publisher'],
      message: 'publisher 至少需要 id 或 name',
    })
  }
})

export type PluginManifest = z.infer<typeof pluginManifestSchema>

/** 插件产物只允许 import 这一个包，其余一律拒绝（§3.3-1 自包含单文件 ESM） */
export const ALLOWED_ENTRY_IMPORT = '@aitoearn/plugin-api'

const ENTRY_IMPORT_PATTERN = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]/g

/**
 * 运行时复用同一套入口源码约束（CLI 的 verify/pack 与宿主加载共用）。
 * 阻止 entry 通过 import 'node:fs' / 'node:child_process' 绕过权限代理。
 */
export function assertPluginEntrySource(source: string, modulePath = 'entry'): void {
  const violations: string[] = []
  for (const match of source.matchAll(ENTRY_IMPORT_PATTERN)) {
    const specifier = match[1] ?? match[2]
    if (specifier && specifier !== ALLOWED_ENTRY_IMPORT) {
      violations.push(specifier)
    }
  }
  if (violations.length > 0) {
    throw new PluginError(
      PluginErrorCode.InvalidManifest,
      `${modulePath} 必须是自包含单文件 ESM，只允许 import '${ALLOWED_ENTRY_IMPORT}'，违规: ${violations.join(', ')}`,
    )
  }
}

export const pluginManifestJsonSchema = z.toJSONSchema(pluginManifestSchema)

export function verifyManifest(input: unknown): PluginManifest {
  const result = pluginManifestSchema.safeParse(input)
  if (!result.success) {
    const issue = result.error.issues[0]
    throw new PluginError(
      PluginErrorCode.InvalidManifest,
      `plugin.json 非法: ${issue.path.join('.')} ${issue.message}`,
      { issues: result.error.issues },
    )
  }
  return result.data
}
