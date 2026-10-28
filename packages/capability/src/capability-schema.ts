import { PluginError, PluginErrorCode } from '@airongrong/plugin-api'
import { z } from 'zod'

export enum CapabilitySideEffect {
  Read = 'read',
  Draft = 'draft',
  Write = 'write',
}

export enum CapabilityConfirm {
  Required = 'required',
  None = 'none',
}

export enum CapabilityUi {
  Text = 'text',
  Textarea = 'textarea',
  Uploader = 'uploader',
  MultiSelect = 'multi-select',
  Select = 'select',
  Switch = 'switch',
}

export const capabilityInputSchema = z.object({
  type: z.enum(['string', 'number', 'boolean', 'url', 'channelId', 'array']),
  items: z.enum(['url', 'channelId', 'string']).optional(),
  maxLength: z.number().int().positive().optional(),
  maxItems: z.number().int().positive().optional(),
  default: z.unknown().optional(),
  ui: z.enum(Object.values(CapabilityUi)).optional(),
  label: z.string().min(1).optional(),
  hidden: z.boolean().optional(),
})

export const capabilityActionSchema = z.object({
  summary: z.string().min(1),
  sideEffect: z.enum(Object.values(CapabilitySideEffect)),
  confirm: z.enum(Object.values(CapabilityConfirm)).default(CapabilityConfirm.None),
  /** 契约工具当前由哪些后端工具实现；未实现的契约条目无此字段 */
  backend: z.union([z.string().min(1), z.array(z.string().min(1))]).optional(),
  inputs: z.record(z.string(), capabilityInputSchema).default({}),
  returns: z.record(z.string(), z.string()).optional(),
  errors: z.array(z.string().min(1)).default([]),
})

export const capabilityManifestSchema = z.object({
  version: z.number().int().min(1),
  actions: z.record(z.string(), capabilityActionSchema),
})

export type CapabilityInput = z.infer<typeof capabilityInputSchema>
export type CapabilityAction = z.infer<typeof capabilityActionSchema>
export type CapabilityManifest = z.infer<typeof capabilityManifestSchema>

export function verifyCapabilityManifest(input: unknown): CapabilityManifest {
  const result = capabilityManifestSchema.safeParse(input)
  if (!result.success) {
    const issue = result.error.issues[0]
    throw new PluginError(
      PluginErrorCode.InvalidManifest,
      `capability.yaml 非法: ${issue.path.join('.')} ${issue.message}`,
      { issues: result.error.issues },
    )
  }
  return result.data
}
