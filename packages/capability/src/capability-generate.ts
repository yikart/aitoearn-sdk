import type { CapabilityAction, CapabilityInput, CapabilityManifest } from './capability-schema'
import {
  CapabilityConfirm,
  CapabilitySideEffect,
  verifyCapabilityManifest,
} from './capability-schema'

export interface McpToolSpec {
  name: string
  description: string
  sideEffect: CapabilitySideEffect
  confirm: CapabilityConfirm
  inputSchema: Record<string, unknown>
  errors: string[]
  /** 契约工具对应的后端实现（未实现为 undefined），供 tools/list 过滤与路由 */
  backend?: string[]
}

export interface UiFieldSpec {
  name: string
  widget: string
  label: string
  required: boolean
  advanced: boolean
  maxLength?: number
  maxItems?: number
}

export interface UiFormSpec {
  action: string
  title: string
  confirmRequired: boolean
  fields: UiFieldSpec[]
}

export interface ValidationRule {
  action: string
  required: string[]
  maxLength: Record<string, number>
  maxItems: Record<string, number>
  formats: Record<string, string>
}

function inputToJsonSchema(input: CapabilityInput): Record<string, unknown> {
  switch (input.type) {
    case 'url':
      return { type: 'string', format: 'uri' }
    case 'channelId':
      return { type: 'string' }
    case 'boolean':
      return { type: 'boolean', default: input.default as boolean | undefined }
    case 'number':
      return { type: 'number' }
    case 'array':
      return {
        type: 'array',
        items: input.items === 'url' ? { type: 'string', format: 'uri' } : { type: 'string' },
        maxItems: input.maxItems,
      }
    default:
      return { type: 'string', maxLength: input.maxLength }
  }
}

/**
 * 从能力清单生成 MCP 工具定义（§13.2 表面之二）。
 * 写操作自动附加 dry-run 确认语义（§12.2 铁律 3、§12.4）。
 */
export function generateMcpTools(manifest: CapabilityManifest): McpToolSpec[] {
  return Object.entries(manifest.actions).map(([name, action]) => ({
    name,
    description: describeAction(name, action),
    sideEffect: action.sideEffect,
    confirm: action.confirm,
    inputSchema: inputsToJsonSchema(action),
    errors: action.errors,
    backend: action.backend ? (Array.isArray(action.backend) ? action.backend : [action.backend]) : undefined,
  }))
}

export function describeAction(name: string, action: CapabilityAction): string {
  const parts = [action.summary]
  if (action.sideEffect === CapabilitySideEffect.Write) {
    parts.push('写操作：默认 dryRun 返回将发生的变更，需用户确认后才真正执行')
  }
  else if (action.sideEffect === CapabilitySideEffect.Draft) {
    parts.push('产生草稿，不改变线上状态')
  }
  if (action.errors.length > 0) {
    parts.push(`错误码: ${action.errors.join(', ')}`)
  }
  void name
  return parts.join('。')
}

function inputsToJsonSchema(action: CapabilityAction): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (const [field, input] of Object.entries(action.inputs)) {
    properties[field] = inputToJsonSchema(input)
    if (input.label) {
      properties[field] = { ...properties[field] as object, title: input.label }
    }
    if (input.default !== undefined) {
      properties[field] = { ...properties[field] as object, default: input.default }
    }
    if (input.hidden) {
      properties[field] = { ...properties[field] as object, deprecated: true }
    }
    if (input.default === undefined && !input.hidden) {
      required.push(field)
    }
  }
  return { type: 'object', properties, required }
}

/** 表面之一：GUI 表单描述（§14.2 零代码路径直接消费） */
export function generateUiForms(manifest: CapabilityManifest): UiFormSpec[] {
  return Object.entries(manifest.actions).map(([name, action]) => ({
    action: name,
    title: action.summary,
    confirmRequired: action.confirm === CapabilityConfirm.Required,
    fields: Object.entries(action.inputs)
      .filter(([, input]) => !input.hidden)
      .map(([field, input]) => ({
        name: field,
        widget: input.ui ?? widgetOf(input),
        label: input.label ?? field,
        required: input.default === undefined,
        advanced: false,
        ...(input.maxLength === undefined ? {} : { maxLength: input.maxLength }),
        ...(input.maxItems === undefined ? {} : { maxItems: input.maxItems }),
      })),
  }))
}

function widgetOf(input: CapabilityInput): string {
  if (input.type === 'boolean') {
    return 'switch'
  }
  if (input.type === 'array') {
    return input.items === 'url' ? 'uploader' : 'multi-select'
  }
  if (input.type === 'url') {
    return 'uploader'
  }
  return input.maxLength && input.maxLength > 200 ? 'textarea' : 'text'
}

/** 表面之三：OpenAPI 3.1 paths（供 REST 客户端与网关导入） */
export function generateOpenApi(manifest: CapabilityManifest): Record<string, unknown> {
  const paths: Record<string, unknown> = {}
  for (const [name, action] of Object.entries(manifest.actions)) {
    paths[`/actions/${name}`] = {
      post: {
        'operationId': name,
        'summary': action.summary,
        'x-side-effect': action.sideEffect,
        'x-confirm': action.confirm,
        'requestBody': {
          required: Object.keys(action.inputs).length > 0,
          content: { 'application/json': { schema: inputsToJsonSchema(action) } },
        },
        'responses': {
          200: { description: 'OK' },
          ...(action.errors.length > 0
            ? { 409: { description: `业务错误: ${action.errors.join(', ')}` } }
            : {}),
        },
      },
    }
  }
  return {
    openapi: '3.1.0',
    info: { title: 'AiToEarn Capability API', version: `v${manifest.version}` },
    paths,
  }
}

/** 表面之四：TS SDK 类型与调用签名 */
export function generateSdkTypes(manifest: CapabilityManifest): string {
  const lines = [
    '// 由 capability.yaml 自动生成，请勿手工修改',
    '',
    'export type CapabilityActionName =',
    ...Object.keys(manifest.actions).map(name => `  | '${name}'`),
    '',
  ]
  for (const [name, action] of Object.entries(manifest.actions)) {
    const pascal = name.charAt(0).toUpperCase() + name.slice(1)
    lines.push(`export interface ${pascal}Input {`)
    for (const [field, input] of Object.entries(action.inputs)) {
      lines.push(`  ${field}${input.default === undefined || input.hidden ? '?' : ''}: ${tsTypeOf(input)}`)
    }
    lines.push('  dryRun?: boolean')
    lines.push('  confirmToken?: string')
    lines.push('}')
    lines.push(`export interface ${pascal}Result extends Record<string, unknown> {}`)
    lines.push('')
  }
  lines.push('export interface CapabilityClient {')
  for (const name of Object.keys(manifest.actions)) {
    const pascal = name.charAt(0).toUpperCase() + name.slice(1)
    lines.push(`  ${name}(input: ${pascal}Input): Promise<${pascal}Result>`)
  }
  lines.push('}')
  lines.push('')
  return lines.join('\n')
}

function tsTypeOf(input: CapabilityInput): string {
  switch (input.type) {
    case 'boolean':
      return 'boolean'
    case 'number':
      return 'number'
    case 'array':
      return 'string[]'
    default:
      return 'string'
  }
}

/** 表面之五：发布前校验规则（GUI、MCP、SDK 共用同一份） */
export function generateValidationRules(manifest: CapabilityManifest): ValidationRule[] {
  return Object.entries(manifest.actions).map(([name, action]) => {
    const required: string[] = []
    const maxLength: Record<string, number> = {}
    const maxItems: Record<string, number> = {}
    const formats: Record<string, string> = {}
    for (const [field, input] of Object.entries(action.inputs)) {
      if (input.default === undefined && !input.hidden) {
        required.push(field)
      }
      if (input.maxLength !== undefined) {
        maxLength[field] = input.maxLength
      }
      if (input.maxItems !== undefined) {
        maxItems[field] = input.maxItems
      }
      if (input.type === 'url' || input.items === 'url') {
        formats[field] = 'uri'
      }
    }
    return { action: name, required, maxLength, maxItems, formats }
  })
}

/**
 * 一次性派生全部五种产物，保证"文档有、界面没有、SDK 不认"不再发生。
 * 入口先过一遍 schema：缺省字段（inputs/errors/confirm）自动补默认值，
 * 非法清单抛 PluginError 而不是在生成器深处 TypeError。
 */
export function generateAllSurfaces(manifest: CapabilityManifest): {
  mcp: McpToolSpec[]
  ui: UiFormSpec[]
  openapi: Record<string, unknown>
  sdk: string
  validation: ValidationRule[]
} {
  const verified = verifyCapabilityManifest(manifest)
  return {
    mcp: generateMcpTools(verified),
    ui: generateUiForms(verified),
    openapi: generateOpenApi(verified),
    sdk: generateSdkTypes(verified),
    validation: generateValidationRules(verified),
  }
}
