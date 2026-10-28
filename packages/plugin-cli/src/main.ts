#!/usr/bin/env node
import { writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { PluginType } from '@aitoearn/plugin-api'
import { Command } from 'commander'
import { printErrorLine, printLine } from './cli-output'
import { collectPackageFiles, verifyPluginPackage } from './package-files'
import { scaffoldPlugin } from './scaffold'
import { generateDevKeys, signPluginPackage } from './sign'
import { buildZip } from './zip'

const program = new Command()
program.name('aitoearn-plugin').description('AiToEarn 插件开发 CLI')

program
  .command('new')
  .argument('<id>', '插件 id，如 channel.acme / hook.media-spec / skill.xhs-copywriting')
  .requiredOption('--type <type>', 'skill | hook | adapter')
  .option('--dir <dir>', '父目录', process.cwd())
  .action(async (id: string, options: { type: string, dir: string }) => {
    const type = options.type as PluginType
    if (!Object.values(PluginType).includes(type)) {
      throw new Error(`--type 必须是 ${Object.values(PluginType).join(' | ')}`)
    }
    const dir = await scaffoldPlugin(resolve(options.dir), id, type)
    printLine(`已创建插件脚手架: ${dir}`)
    printLine('下一步: 实现 dist/index.mjs，回填 plugin.json entry.sha256，然后运行 verify')
  })

program
  .command('verify')
  .argument('[dir]', '插件目录', process.cwd())
  .action(async (dir: string) => {
    const manifest = await verifyPluginPackage(resolve(dir))
    printLine(`✓ ${manifest.id}@${manifest.version} 校验通过`)
  })

program
  .command('pack')
  .argument('[dir]', '插件目录', process.cwd())
  .action(async (dir: string) => {
    const pkgDir = resolve(dir)
    const manifest = await verifyPluginPackage(pkgDir)
    const files = await collectPackageFiles(pkgDir)
    const outPath = join(pkgDir, '..', `${manifest.id}-${manifest.version}.aitpkg`)
    await writeFile(outPath, buildZip(files))
    printLine(`✓ 已打包 ${files.length} 个文件: ${outPath}`)
  })

program
  .command('sign')
  .argument('[dir]', '插件目录', process.cwd())
  .requiredOption('--key <path>', 'ed25519 私钥 PEM 路径')
  .action(async (dir: string, options: { key: string }) => {
    const { signature, modulePath } = await signPluginPackage(resolve(dir), resolve(options.key))
    printLine(`✓ 已签名: ${modulePath}.sig`)
    printLine(`  signature: ${signature}`)
  })

program
  .command('keygen')
  .requiredOption('--out <dir>', '输出目录', join(process.env['HOME'] ?? '~', '.aitoearn'))
  .action(async (options: { out: string }) => {
    const keys = await generateDevKeys(resolve(options.out))
    printLine(`✓ 开发密钥已生成: ${keys.privateKeyPath}`)
    printLine(`  公钥（加入宿主 trustedKeys）: ${keys.publicKeyPath}`)
  })

program
  .command('cap')
  .description('从 capability.yaml 派生五种产物（mcp / ui / openapi / sdk / validation）')
  .requiredOption('--from <file>', 'capability.yaml 路径')
  .option('--out <dir>', '输出目录', join(process.cwd(), 'generated'))
  .option('--surface <surfaces>', '逗号分隔: mcp,ui,openapi,sdk,validation,all', 'all')
  .action(async (options: { from: string, out: string, surface: string }) => {
    const { loadCapabilityManifest } = await import('@aitoearn/capability')
    const { generateAllSurfaces } = await import('@aitoearn/capability')
    const { mkdir, writeFile } = await import('node:fs/promises')
    const manifest = await loadCapabilityManifest(resolve(options.from))
    const surfaces = generateAllSurfaces(manifest)
    const wanted = options.surface.split(',').map(item => item.trim())
    const all = wanted.includes('all')

    await mkdir(resolve(options.out), { recursive: true })
    const written: string[] = []
    const dump = async (name: string, data: unknown, ext = 'json') => {
      const file = join(resolve(options.out), `${name}.${ext}`)
      await writeFile(file, typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`)
      written.push(file)
    }
    if (all || wanted.includes('mcp')) {
      await dump('mcp-tools', surfaces.mcp)
    }
    if (all || wanted.includes('ui')) {
      await dump('ui-forms', surfaces.ui)
    }
    if (all || wanted.includes('openapi')) {
      await dump('openapi', surfaces.openapi)
    }
    if (all || wanted.includes('sdk')) {
      await dump('capability-client', surfaces.sdk, 'ts')
    }
    if (all || wanted.includes('validation')) {
      await dump('validation-rules', surfaces.validation)
    }
    printLine(`✓ 已从 capability.yaml v${manifest.version} 生成 ${written.length} 个产物 (${Object.keys(manifest.actions).length} 个能力)`)
    for (const file of written) {
      printLine(`  ${file}`)
    }
  })

program
  .command('dev')
  .description('本地热重载 + 宿主连接（M1 提供）')
  .action(() => {
    printLine('plugin dev 将在 M1（渠道插件化阶段）提供')
  })

program
  .command('test')
  .description('回放式测试（M1 提供）')
  .action(() => {
    printLine('plugin test 将在 M1（渠道插件化阶段）提供')
  })

program.parseAsync(process.argv).catch((error: Error) => {
  printErrorLine(`✗ ${error.message}`)
  process.exitCode = 1
})
