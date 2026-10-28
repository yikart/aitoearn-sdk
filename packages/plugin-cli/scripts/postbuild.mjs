#!/usr/bin/env node
// 为 bin 入口补 shebang 与可执行位：tsc 不会保留源码里的 shebang 语义到可执行权限
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const entry = join(pkgRoot, 'dist', 'main.js')

if (!existsSync(entry)) {
  console.error(`[plugin-cli] build output missing: ${entry}`)
  process.exit(1)
}

const shebang = '#!/usr/bin/env node\n'
const source = readFileSync(entry, 'utf8')
if (!source.startsWith('#!')) {
  writeFileSync(entry, `${shebang}${source}`)
}
chmodSync(entry, 0o755)
console.log('[plugin-cli] bin ready: dist/main.js')
