# aitoearn-sdk

[![CI](https://github.com/yikart/aitoearn-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/yikart/aitoearn-sdk/actions/workflows/ci.yml)
[![Release](https://github.com/yikart/aitoearn-sdk/actions/workflows/release.yml/badge.svg)](https://github.com/yikart/aitoearn-sdk/actions/workflows/release.yml)

AiToEarn 对外发布的 npm 包集合。与私有后端仓库（`yikart/AiToEarn`）解耦：这里只有**插件作者 / Agent / 集成方**需要的代码，
不含任何宿主内部实现、NestJS 依赖或私有包（`@yikart/*`）。

## 包一览

| 仓库目录 | npm 包 | 说明 |
| --- | --- | --- |
| `packages/plugin-api` | [@airongrong/plugin-api](https://www.npmjs.com/package/@airongrong/plugin-api) | 插件 SDK：`plugin.json` 清单 schema（zod）、渠道适配器契约、宿主服务类型、错误码、API 兼容性判定。插件作者**唯一**需要依赖的包 |
| `packages/capability` | [@airongrong/capability](https://www.npmjs.com/package/@airongrong/capability) | `capability.yaml` 单一事实源：一个文件派生 MCP tools / GUI 表单 / OpenAPI / SDK 类型 / 校验规则五个表面 |
| `packages/plugin-cli` | [@airongrong/plugin-cli](https://www.npmjs.com/package/@airongrong/plugin-cli) | 插件开发 CLI（`aitoearn-plugin`）：`new` / `verify` / `pack` / `sign` / `keygen` / `cap` |

三个包版本**固定联动**（changesets `fixed` 分组），始终一起升版。

## 包使用指南

### @airongrong/plugin-api —— 插件作者与宿主共用

插件作者**唯一**需要依赖的包：纯类型 + 校验逻辑，零 NestJS / 零宿主内部依赖。

```bash
pnpm add @airongrong/plugin-api
```

| 模块 | 内容 |
| --- | --- |
| `plugin-manifest` | `pluginManifestSchema`（zod）、`verifyManifest()`、`pluginManifestJsonSchema`、`PluginType` / `Capability` / `PluginHookName` 枚举 |
| `channel-adapter` | `ChannelAdapter` 渠道适配器契约 |
| `plugin-module` | `AdapterPluginModule` / `HookPluginModule` / `PluginActivate` 入口契约 |
| `host-services` | `HostServices`：宿主授予的 http / secrets / storage / log 能力 |
| `post-draft` | `PostDraft`、`DraftBlock`、`PublishResult`、`ValidationIssue` 统一内容模型 |
| `plugin-error-code` | `PluginError`（AIT-PL-xxx）、`AgentError`（AIT-AG-xxx） |
| `version` | `HOST_API_VERSION`、`isApiCompatible()`、`satisfiesVersion()` |

**用法一：写渠道适配器**（唯一有网络与密钥权限的插件类型）

```ts
import {
  Capability,
  ValidationIssueSeverity,
  type ChannelAdapter,
  type HostServices,
} from '@airongrong/plugin-api'

export default function activate(host: HostServices): { adapter: ChannelAdapter } {
  return {
    adapter: {
      meta: {
        id: 'acme',
        label: 'Acme',
        capabilities: [Capability.PublishText, Capability.PublishImage],
      },
      async authorize(ctx) {
        // 网络只能走 host.http（域名受 plugin.json permissions.network 约束）
        const res = await host.http.request({
          url: 'https://api.acme.com/oauth/token',
          method: 'POST',
          body: JSON.stringify({ accountId: ctx.accountId }),
        })
        return { externalAccountId: JSON.parse(res.body).id }
      },
      // 不允许静默降级：不支持的 capability 必须返回明确 issue
      validate(draft) {
        return draft.text.length > 5000
          ? [{ severity: ValidationIssueSeverity.Error, message: '正文超长', path: 'text' }]
          : []
      },
      // draftId 是幂等键：同一 draftId 重复提交必须返回同一结果
      async publish(draft, ctx) {
        // 密钥以回调参数临时可用，调用结束即失效
        return host.secrets.use('oauth.access_token', async (token) => {
          const res = await host.http.request({
            url: 'https://api.acme.com/posts',
            method: 'POST',
            headers: { authorization: `Bearer ${token}` },
            body: JSON.stringify({ text: draft.text, visibility: draft.visibility }),
          })
          return { externalId: JSON.parse(res.body).id, url: 'https://acme.example/p/1', publishedAt: new Date().toISOString() }
        })
      },
      // 可选：数据回读（metrics.basic / metrics.engagement）
      // async metrics(externalId, ctx) { return { views: 100, likes: 10, collectedAt: new Date().toISOString() } },
    },
  }
}
```

**用法二：写钩子（hook）** —— 校验、审计类扩展，无渠道权限

```ts
import type { HookPluginModule } from '@airongrong/plugin-api'

export default function activate(): HookPluginModule {
  return {
    hooks: {
      // fail-closed：抛错即中止发布并透传原因
      async beforePublish(draft) {
        if (!draft.text.trim()) throw new Error('正文不能为空')
      },
    },
  }
}
```

**用法三：宿主侧校验与门禁**（后端按精确版本号依赖，见 `.npmrc` 的 `link-workspace-packages`）

```bash
pnpm add @airongrong/plugin-api
```

```ts
import { isApiCompatible, verifyManifest } from '@airongrong/plugin-api'

const manifest = verifyManifest(JSON.parse(raw))
// 非法清单抛 PluginError（code: AIT-PL-001）
if (!isApiCompatible(manifest.apiVersion)) {
  // 默认对比 HOST_API_VERSION；宿主版本必须命中插件声明的 apiVersion 区间
  // （支持 ^1.0.0、>=1.8.0 <3 等写法），且主版本不得越界 → AIT-PL-004
  throw new Error('API 版本不兼容')
}
```

**entry 硬约束**：插件产物必须是单文件 ESM（`dist/*.mjs`，带 sha256 指纹），且只允许 `import '@airongrong/plugin-api'`（`ALLOWED_ENTRY_IMPORT`）；动态 `import()` 的参数同样必须是该字面量——计算型写法（如 `import('node:' + 'fs')`）一律拒绝。CLI 的 verify/pack 与宿主加载共用 `assertPluginEntrySource()` 把关，其余依赖一律拒绝；`entry.module` 同时禁止 `..` 路径穿越，读取产物前校验解析路径必须落在插件目录内。

entry 源码校验示例（`aitoearn-plugin verify` 实际行为）：

```text
✓ 通过
  import { z } from '@airongrong/plugin-api'          // 静态导入允许包
  await import('@airongrong/plugin-api')              // 字面量动态导入允许包

✗ 拒绝（报 AIT-PL-001，verify/pack 均拦截）
  import axios from 'axios'                         // 非允许依赖
  import { createHash } from 'node:crypto'          // node: 内置模块
  const m = await import('node:' + 'fs')            // 计算型动态 import
  const m = await import(someVar)                   // 非字面量动态 import
```

`entry.module` 路径穿越示例：

```jsonc
"entry": { "module": "./dist/index.mjs", "sha256": "…" }      // ✓
"entry": { "module": "dist/../../evil.mjs", "sha256": "…" }   // ✗ 清单校验直接报错：
// "plugin.json 非法: entry.module entry.module 禁止包含路径穿越（..）"
```

`keygen` 私钥权限示例：

```bash
$ aitoearn-plugin keygen --out ~/.aitoearn
$ ls -l ~/.aitoearn/dev.pem
-rw------- 1 me staff 263 … dev.pem    # 0600，仅当前用户可读写
```

深入字段说明见 [packages/plugin-api/README.md](packages/plugin-api/README.md)。

### @airongrong/capability —— 平台 / Agent / 集成方

`capability.yaml` 是**能力单一事实源**：一个文件派生五个表面，避免 GUI / MCP / SDK / OpenAPI / 校验规则各自实现。

```bash
pnpm add @airongrong/capability
```

第一步，声明能力（节选）：

```yaml
version: 1                       # 清单格式版本，与 npm 包版本无关
actions:
  publish_post:
    summary: 发布图文
    sideEffect: write            # read | draft | write
    confirm: required            # write 必须为 required
    backend: [publishChannelTask]  # 契约由哪些宿主工具实现；未实现的占位条目不写
    inputs:
      channelId: { type: channelId, label: 渠道 }
      text: { type: string, maxLength: 1000, label: 正文, ui: textarea }
      dryRun: { type: boolean, default: true, hidden: true }
    errors: [AIT-AG-002]
```

第二步，代码里加载并派生：

```ts
import { loadCapabilityManifest, generateAllSurfaces } from '@airongrong/capability'

const manifest = await loadCapabilityManifest('./capability.yaml') // 读取 + zod 校验，非法抛 PluginError
const surfaces = generateAllSurfaces(manifest)

surfaces.mcp         // MCP tools/list 工具定义（写操作自动带 dryRun 语义）
surfaces.ui          // GUI 表单（widget / label / required / advanced）
surfaces.openapi     // OpenAPI 3.1 paths（operationId = action 名）
surfaces.sdk         // TS 客户端类型（CapabilityClient 接口 + Input/Result）
surfaces.validation  // 前后端共用校验（required / maxLength / maxItems / formats）
```

也可以只取单个表面：`generateMcpTools()` / `generateUiForms()` / `generateOpenApi()` / `generateSdkTypes()` / `generateValidationRules()`。

关键约定：**必填 = 没有 `default` 且没有 `hidden: true`**，没有单独的 `required` 字段；`type` 可取 `string | number | boolean | url | channelId | array`。

能力文件格式详见 [packages/capability/README.md](packages/capability/README.md)。

### @airongrong/plugin-cli —— 插件作者

脚手架、校验、打包、签名一条龙。插件产物 `.aitpkg` 刻意不经过 npm（零依赖、可离线安装、签名校验）。

```bash
npm i -g @airongrong/plugin-cli      # 全局安装后命令名为 aitoearn-plugin
# 或免安装：npx @airongrong/plugin-cli <command>
```

| 命令 | 说明 |
| --- | --- |
| `new <id> --type skill\|hook\|adapter` `[--dir <父目录>]` | 生成插件脚手架；id 必须匹配 `^(skill\|hook\|channel)\.[a-z0-9-]{2,32}$` |
| `verify [dir]` | 清单 schema + 产物哈希（AIT-PL-002，恒时比较）+ 自包含 ESM 约束（含计算型动态 import）+ 路径穿越检查 + 禁带 node_modules |
| `pack [dir]` | 产出 `<id>-<version>.aitpkg`（store-only zip，无第三方依赖） |
| `sign [dir] --key <pem>` | ed25519 签名 entry 产物，写入 `<module>.sig` |
| `keygen --out <dir>` | 生成开发用 ed25519 密钥对（dev.pem / dev.pub，私钥权限 0600） |
| `cap --from <yaml>` `[--out <dir>]` `[--surface mcp,ui,openapi,sdk,validation,all]` | 从 capability.yaml 派生五类产物 |
| `dev` / `test` | 本地热重载 / 回放测试（M1 提供） |

典型流程（hook 为例，adapter 在 pack 前需先 keygen + sign）：

```bash
aitoearn-plugin new hook.media-spec --type hook
# 实现 dist/index.mjs → 回填 plugin.json 的 entry.sha256
aitoearn-plugin verify ./hook.media-spec
aitoearn-plugin pack ./hook.media-spec
# → hook.media-spec-0.1.0.aitpkg
```

命令细节见 [packages/plugin-cli/README.md](packages/plugin-cli/README.md)。

## 为什么单独一个仓库

- **发布节奏不同**：SDK 发版跟着插件作者与 Agent 集成方，后端发版跟着服务部署，两者不应互相阻塞。
- **依赖纯净**：这三个包零 `@yikart/*`、零 NestJS 依赖，放在后端 Nx workspace 里反而容易被内部依赖污染。
- **公开可见**：插件作者要能读源码、提 issue、看 CHANGELOG；私有后端仓库做不到。

## 开发

要求 Node >= 20、pnpm >= 10（仓库锁定 `pnpm@10.13.1`）。

```bash
pnpm install
pnpm build       # tsc → 每个包 dist/（plugin-cli 构建后自动补 shebang + 可执行位）
pnpm test        # vitest
pnpm typecheck   # tsc --noEmit
pnpm clean       # 清理所有 dist
```

约定：

- 所有包均为 **CommonJS**（后端宿主同为 CJS，避免双模块系统问题）。
- `packages/*/src` 不发布；`files` 白名单只含 `dist` + `README.md` + `LICENSE`。
- 提交前跑 `pnpm typecheck && pnpm test`，CI 会再做一遍。

## 发版

走 [changesets](https://github.com/changesets/changesets)，三个包版本**固定联动**（见 `.changeset/config.json` 的 `fixed`）：

```bash
pnpm changeset          # 写变更说明（patch / minor / major）
git commit && push      # CI 开 Version PR
# 合并 Version PR → 自动 npm publish（需仓库 secret NPM_TOKEN）
```

细节保障：

- 包内依赖用**精确版本号**（不是 `workspace:*`）——changesets 发版时会连同依赖声明一起 bump，
  且 `npm publish` / `pnpm publish` 都能直接发，不依赖 pnpm 的协议转换。
- 每个包的 `prepublishOnly` 跑 [scripts/prepublish-guard.mjs](scripts/prepublish-guard.mjs)，
  拦下「未构建」「带 workspace 协议」「缺 LICENSE / README」「bin 入口缺失」等坏包。
- 本仓本地开发不需要先发版：`.npmrc` 开了 `link-workspace-packages=true`，
  版本匹配的 `@airongrong/*` 会直接链接到 workspace 包。

## 错误码体系

| 前缀 | 归属 | 示例 |
| --- | --- | --- |
| `AIT-PL-001~008` | 插件生命周期（清单非法、哈希不匹配、签名不可信、版本不兼容、权限违规、激活超时、钩子拒绝、幂等冲突） | `AIT-PL-002` = 产物哈希不匹配 |
| `AIT-AG-001~005` | Agent 操作（未授权、写未确认、限流、内容风控、撤销超时） | `AIT-AG-002` = 写操作未经确认 |

错误码在 `@airongrong/plugin-api` 中定义为 `PluginErrorCode` / `AgentErrorCode` 枚举，五个表面（MCP/GUI/OpenAPI/SDK/校验）共用同一份。

## 兼容性

- Node >= 20，全部 CommonJS。
- `HOST_API_VERSION` 与 SDK 主版本绑定（当前 `1.0.0`）；SDK 的 breaking change 必须升主版本并同步 `HOST_API_VERSION`。
- `capability.yaml` 的 `version` 字段是独立的清单格式版本，与 npm 包版本无关。

## License

[MIT](LICENSE)
