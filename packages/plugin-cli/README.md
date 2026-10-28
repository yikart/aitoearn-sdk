# @airongrong/plugin-cli

AiToEarn 插件开发 CLI：脚手架、校验、打包、签名一条龙。面向插件作者，运行时不进宿主沙箱。

插件产物（`.aitpkg`）刻意不经过 npm：零依赖、可离线安装、签名校验。本工具只是帮你生产合格的产物。

## 使用

无需安装，npx 直接用（也可以全局安装 `npm i -g @airongrong/plugin-cli`，命令名同为 `aitoearn-plugin`）：

```bash
# 脚手架
npx @airongrong/plugin-cli new channel.acme --type adapter

# 校验（清单 schema + 产物哈希 + 单文件 ESM 约束 + 路径穿越检查）
npx @airongrong/plugin-cli verify ./channel.acme
# 被拒绝的 entry 源码示例（报 AIT-PL-001）：
#   import axios from 'axios'              —— 非允许依赖
#   const m = await import('node:' + 'fs') —— 计算型动态 import
# 被拒绝的 entry.module 示例：
#   "dist/../../evil.mjs"                  —— 路径穿越（AIT-PL-001）

# 打包 .aitpkg（store-only zip，无第三方依赖）
npx @airongrong/plugin-cli pack ./channel.acme

# 开发签名（adapter 必需）
npx @airongrong/plugin-cli keygen --out ~/.aitoearn
npx @airongrong/plugin-cli sign ./channel.acme --key ~/.aitoearn/dev.pem
```

## 命令

| 命令 | 说明 |
| --- | --- |
| `new <id> --type skill\|hook\|adapter` | 生成插件脚手架 |
| `verify [dir]` | 清单与产物校验（AIT-PL-001/002，恒时哈希比较 + 路径穿越检查） |
| `pack [dir]` | 产出 `<id>-<version>.aitpkg` |
| `sign [dir] --key <pem>` | ed25519 签名 entry 产物 |
| `keygen --out <dir>` | 生成开发用 ed25519 密钥对（私钥权限 0600） |
| `dev` / `test` | 本地热重载 / 回放测试（M1 提供） |

## 本地开发

本仓库（aitoearn-sdk）是独立 pnpm workspace，与私有后端仓库解耦：

```bash
pnpm install
pnpm build       # 全量 tsc 构建
pnpm test        # vitest
pnpm typecheck
```

## 发布（维护者）

走 changesets：改完代码执行 `pnpm changeset` 写变更说明，合入 main 后 CI 开 Version PR，
合并 Version PR 即自动 `changeset publish` 到 npm（需仓库 secret `NPM_TOKEN`）。

注意版本联动：`plugin-cli` 对 `@airongrong/plugin-api` / `@airongrong/capability` 是 workspace 依赖，
changesets 发版时会自动转成精确版本号并联动 bump。
