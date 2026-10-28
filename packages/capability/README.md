# @airongrong/capability

`capability.yaml` 是 AiToEarn 的**能力单一事实源**：一个文件派生出五个表面，避免 GUI / MCP / SDK / OpenAPI / 校验规则各自走各自的实现。

```bash
pnpm add @airongrong/capability
```

## 用法

```ts
import { loadCapabilityManifest, generateAllSurfaces } from '@airongrong/capability'

const manifest = await loadCapabilityManifest('./capability.yaml')
const surfaces = generateAllSurfaces(manifest)
// surfaces: { mcp, ui, openapi, sdk, validation }
```

CLI 侧一行生成五份产物：

```bash
npx @airongrong/plugin-cli cap --from ./capability.yaml --out ./generated
```

## 生成的五个表面

| 表面 | 函数 | 用途 |
| --- | --- | --- |
| MCP tools | `generateMcpTools()` | Agent（`tools/list`）暴露的工具定义 |
| GUI forms | `generateUiForms()` | Web/桌面端表单（小白用户轨道） |
| OpenAPI | `generateOpenApi()` | REST 文档与服务端 stub |
| SDK types | `generateSdkTypes()` | TS/Python 客户端类型 |
| Validation | `generateValidationRules()` | 前后端共用校验（写操作护栏复用） |

## capability.yaml 结构

```yaml
version: 1                       # 必填，整数
actions:
  publish_post:
    summary: 发布图文
    sideEffect: write            # read | draft | write
    confirm: required            # none | required —— write 必须为 required
    backend: [publishChannelTask]  # 契约由哪些宿主工具实现；未实现的占位条目不写
    inputs:
      channelId: { type: channelId, label: 渠道 }
      text: { type: string, maxLength: 1000, label: 正文, ui: textarea }
      dryRun: { type: boolean, default: true, hidden: true }
    returns:
      postId: string
    errors: [AIT-AG-002]
```

约定：

- **必填 = 没有 `default` 且没有 `hidden: true`**（`generateValidationRules()` 据此产出 `required`），
  没有单独的 `required` 字段。
- `type` 可取 `string | number | boolean | url | channelId | array`；`ui` 可取
  `text | textarea | uploader | multi-select | select | switch`。
- **写操作**（`sideEffect: write`）必须写 `confirm: required`，派生出的 MCP 工具会自动带上
  `dryRun` 默认值，与宿主 `WriteConfirmService` 护栏对齐（错误码 `AIT-AG-002` / `AIT-AG-003`）。
