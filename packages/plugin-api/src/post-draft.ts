export enum DraftBlockKind {
  Image = 'image',
  Video = 'video',
  Link = 'link',
}

export type DraftBlock
  = | { kind: DraftBlockKind.Image, url: string, width: number, height: number }
    | { kind: DraftBlockKind.Video, url: string, durationSec: number, coverUrl?: string }
    | { kind: DraftBlockKind.Link, url: string }

export enum DraftVisibility {
  Public = 'public',
  Private = 'private',
  Unlisted = 'unlisted',
}

export interface PostDraft {
  /** 幂等键：同一 draftId 重复提交必须返回同一结果 */
  draftId: string
  text: string
  blocks: DraftBlock[]
  topics: string[]
  mentions: string[]
  visibility: DraftVisibility
  /** ISO8601，由宿主统一调度 */
  scheduledAt?: string
  locale: string
}

export enum ValidationIssueSeverity {
  Error = 'error',
  Warning = 'warning',
}

export interface ValidationIssue {
  severity: ValidationIssueSeverity
  message: string
  /** 关联的草稿字段，如 blocks.0.url */
  path?: string
}

export interface PublishResult {
  externalId: string
  url: string
  publishedAt: string
  warnings?: string[]
}

export interface PublishContext {
  accountId: string
  locale: string
}

export interface Metrics {
  views?: number
  likes?: number
  comments?: number
  shares?: number
  collectedAt: string
}

export interface AuthContext {
  accountId: string
}

export interface AuthResult {
  externalAccountId: string
  displayName?: string
  expiresAt?: string
}

export interface CapabilitySet {
  capabilities: string[]
}
