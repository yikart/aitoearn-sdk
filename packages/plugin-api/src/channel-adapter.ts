import type { Capability } from './plugin-manifest'
import type { AuthContext, AuthResult, CapabilitySet, Metrics, PostDraft, PublishContext, PublishResult, ValidationIssue } from './post-draft'

export interface ChannelMeta {
  id: string
  label: string
  capabilities: Capability[]
}

/**
 * 渠道适配器：唯一有网络与密钥权限、必须沙箱执行 + 人工审核的插件类型。
 */
export interface ChannelAdapter {
  meta: ChannelMeta
  authorize: (ctx: AuthContext) => Promise<AuthResult>
  refresh?: (ctx: AuthContext) => Promise<AuthResult>
  revoke?: (ctx: AuthContext) => Promise<void>
  /** 不允许静默降级：不支持的 capability 必须返回明确 issue */
  validate: (draft: PostDraft, caps: CapabilitySet) => ValidationIssue[] | Promise<ValidationIssue[]>
  publish: (draft: PostDraft, ctx: PublishContext) => Promise<PublishResult>
  metrics?: (externalId: string, ctx: AuthContext) => Promise<Metrics>
}
