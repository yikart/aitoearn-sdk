// 由 capability.yaml 自动生成，请勿手工修改

export type CapabilityActionName =
  | 'list_channels'
  | 'get_post_metrics'
  | 'create_draft'
  | 'upload_asset'
  | 'publish_post'
  | 'delete_post'

export interface ListChannelsInput {
  dryRun?: boolean
  confirmToken?: string
}
export interface ListChannelsResult extends Record<string, unknown> {}

export interface GetPostMetricsInput {
  externalId: string
  metrics?: string[]
  dryRun?: boolean
  confirmToken?: string
}
export interface GetPostMetricsResult extends Record<string, unknown> {}

export interface CreateDraftInput {
  channelId: string
  text: string
  topics?: string[]
  dryRun?: boolean
  confirmToken?: string
}
export interface CreateDraftResult extends Record<string, unknown> {}

export interface UploadAssetInput {
  url: string
  alt: string
  dryRun?: boolean
  confirmToken?: string
}
export interface UploadAssetResult extends Record<string, unknown> {}

export interface PublishPostInput {
  channelId: string
  text: string
  assetIds: string[]
  visibility?: string
  dryRun?: boolean
  confirmToken?: string
}
export interface PublishPostResult extends Record<string, unknown> {}

export interface DeletePostInput {
  externalId: string
  dryRun?: boolean
  confirmToken?: string
}
export interface DeletePostResult extends Record<string, unknown> {}

export interface CapabilityClient {
  list_channels(input: ListChannelsInput): Promise<ListChannelsResult>
  get_post_metrics(input: GetPostMetricsInput): Promise<GetPostMetricsResult>
  create_draft(input: CreateDraftInput): Promise<CreateDraftResult>
  upload_asset(input: UploadAssetInput): Promise<UploadAssetResult>
  publish_post(input: PublishPostInput): Promise<PublishPostResult>
  delete_post(input: DeletePostInput): Promise<DeletePostResult>
}
