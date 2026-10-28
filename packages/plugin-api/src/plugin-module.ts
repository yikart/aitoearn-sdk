import type { ChannelAdapter } from './channel-adapter'
import type { HostServices } from './host-services'
import type { PostDraft, PublishResult } from './post-draft'

export interface HookHandlers {
  /** 编辑期每次保存；返回 issue 阻断保存（可选，默认警告） */
  validateDraft?: (draft: PostDraft) => ValidationIssueResult[] | Promise<ValidationIssueResult[]>
  /** fail-closed：抛错即中止发布，并透传原因 */
  beforePublish?: (draft: PostDraft) => Promise<void>
  /** fail-open：只记日志 */
  afterPublish?: (result: PublishResult) => Promise<void>
  onAuthExpired?: (ctx: { accountId: string, channelId: string }) => Promise<void>
}

export interface ValidationIssueResult {
  severity: 'error' | 'warning'
  message: string
  path?: string
}

export interface AdapterPluginModule {
  adapter: ChannelAdapter
}

export interface HookPluginModule {
  hooks: HookHandlers
}

export type PluginModule = AdapterPluginModule | HookPluginModule

/**
 * 插件入口契约：默认导出或 activate 函数，宿主在 worker 内调用。
 * 模块内只允许 import '@airongrong/plugin-api'（类型与工具，不打入产物）。
 */
export type PluginActivate = (host: HostServices) => PluginModule | Promise<PluginModule>
