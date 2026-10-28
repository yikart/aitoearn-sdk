#!/usr/bin/env node
// 发布前最后一道闸：防止把「本地 workspace 协议」或「未构建产物」发到 npm
// changesets 正常流程会先把 workspace:* 替换成版本号；若有人绕过流程直接 npm publish，这里必须拦下。
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// npm/pnpm 运行 package script 时 cwd 就是包目录
const pkgRoot = process.cwd()
const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'))
const problems = []

function scanWorkspaceProtocol(deps, field) {
  for (const [name, range] of Object.entries(deps ?? {})) {
    if (typeof range === 'string' && range.startsWith('workspace:')) {
      problems.push(`${field}.${name} 仍是 workspace 协议（${range}）——请先跑 changeset version`)
    }
  }
}

scanWorkspaceProtocol(pkg.dependencies, 'dependencies')
scanWorkspaceProtocol(pkg.devDependencies, 'devDependencies')
scanWorkspaceProtocol(pkg.peerDependencies, 'peerDependencies')

if (!pkg.version.match(/^\d+\.\d+\.\d+/)) {
  problems.push(`version 不是 semver: ${pkg.version}`)
}
if (!pkg.license) {
  problems.push('缺少 license 字段')
}
if (!existsSync(join(pkgRoot, 'LICENSE'))) {
  problems.push('缺少 LICENSE 文件（npm 不会自动带仓库根的 LICENSE）')
}
if (!existsSync(join(pkgRoot, 'README.md'))) {
  problems.push('缺少 README.md')
}

const dist = join(pkgRoot, 'dist')
if (!existsSync(dist) || readdirSync(dist).filter(f => f.endsWith('.js')).length === 0) {
  problems.push('dist 为空或不存在——请先 build')
}
const entryName = pkg.bin ? Object.values(pkg.bin)[0].replace('./dist/', '') : 'index.js'
if (!existsSync(join(dist, entryName))) {
  problems.push(`入口产物缺失: dist/${entryName}`)
}

if (problems.length > 0) {
  console.error(`✗ ${pkg.name} 发布前检查未通过：`)
  for (const problem of problems) {
    console.error(`  - ${problem}`)
  }
  process.exit(1)
}
console.log(`✓ ${pkg.name}@${pkg.version} 发布前检查通过`)
