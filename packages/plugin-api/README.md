# @airongrong/plugin-api

AiToEarn 插件 SDK：插件作者唯一需要依赖的 npm 包。纯类型 + 少量校验逻辑，零 NestJS / 零宿主内部依赖。

```bash
pnpm add @airongrong/plugin-api
```

## 你能拿到什么

| 模块 | 内容 |
| --- | --- |
| `plugin-manifest` | `pluginManifestSchema`（zod）、`verifyManifest()`、`PluginType`、`Capability`、`PluginHookName`、`pluginManifestJsonSchema` |
| `plugin-module` | `AdapterPluginModule` / `HookPluginModule` / `PluginActivate` 契约 |
| `channel-adapter` | `ChannelAdapter`、`ChannelMeta` —— 渠道适配器接口 |
| `host-services` | `HostServices`：宿主授予的 http / log / secrets / storage / kv 能力 |
| `post-draft` | `PostDraft`、`DraftBlock`、`PublishResult`、`ValidationIssue` —— 内容草稿与发布结果的统一模型 |
| `plugin-error-code` | `PluginErrorCode`（AIT-PL-001~008）、`AgentErrorCode`（AIT-AG-001~005）、`PluginError`、`AgentError` |
| `version` | `HOST_API_VERSION`、`isApiCompatible()`、`satisfiesVersion()` —— 宿主/插件 API 兼容性判定 |

## 最小渠道适配器

```ts
import { Capability, ValidationIssueSeverity, type ChannelAdapter, type HostServices } from '@airongrong/plugin-api'

export default function activate(host: HostServices): { adapter: ChannelAdapter } {
  return {
    adapter: {
      meta: { id: 'channel.acme', label: 'Acme', capabilities: [Capability.PublishText, Capability.PublishImage] },
      async authorize(ctx) {
        return { externalAccountId: 'acme-1' }
      },
      validate(draft) {
        return draft.text.length > 5000
          ? [{ severity: ValidationIssueSeverity.Error, message: '正文超长', path: 'text' }]
          : []
      },
      async publish(draft, ctx) {
        host.log.info('publishing', { draftId: draft.draftId, accountId: ctx.accountId })
        return { externalId: 'acme-1', url: 'https://acme.example/p/1', publishedAt: new Date().toISOString() }
      },
    },
  }
}
```

完整字段见 `ChannelAdapter` / `PostDraft`（`draftId` 为幂等键，重复提交必须返回同一结果）。
草稿示例：`visibility: DraftVisibility.Public`、`blocks`、`topics` 等。

产物约束：插件 entry 只允许 `import '@airongrong/plugin-api'`（见 `ALLOWED_ENTRY_IMPORT`），
动态 `import()` 的参数同样必须是该字面量——计算型写法（如 `import('node:' + 'fs')`）在校验时被拒绝，
其他依赖一律拒绝，保证 `.aitpkg` 可离线、零依赖安装。`entry.module` 禁止包含 `..` 路径穿越。

## 版本策略

宿主与插件用 `apiVersion` 字段对齐，`isApiCompatible()` 要求宿主版本命中插件声明区间
（支持 `^1.0.0`、`>=1.8.0 <3` 等复合区间）且主版本不越界；
SDK 自身发版遵循 semver，breaking change 必须升主版本并同步 `HOST_API_VERSION`。
