import { createHash, generateKeyPairSync, sign as signData } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { PluginError, PluginErrorCode } from '@airongrong/plugin-api'
import { readPluginPackage } from './package-files'

/** 签名对象：entry 产物的 sha256 十六进制字符串（与宿主 loader 校验口径一致） */
export async function signPluginPackage(dir: string, keyPath: string): Promise<{ signature: string, modulePath: string }> {
  const pkg = await readPluginPackage(dir)
  if (!pkg.entryBytes || !pkg.manifest.entry) {
    throw new PluginError(PluginErrorCode.InvalidManifest, '技能插件没有可签名的产物')
  }
  const privateKey = await readFile(keyPath, 'utf8')
  const digestHex = createHash('sha256').update(pkg.entryBytes).digest('hex')
  const signature = signData(null, Buffer.from(digestHex), privateKey).toString('base64')
  const modulePath = join(dir, pkg.manifest.entry.module.replace(/^\.\//, ''))
  await writeFile(`${modulePath}.sig`, signature)
  return { signature, modulePath }
}

export async function generateDevKeys(outDir: string): Promise<{ privateKeyPath: string, publicKeyPath: string }> {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const privateKeyPath = join(outDir, 'dev.pem')
  const publicKeyPath = join(outDir, 'dev.pub')
  await mkdir(dirname(privateKeyPath), { recursive: true })
  await writeFile(privateKeyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 })
  await writeFile(publicKeyPath, publicKey.export({ type: 'spki', format: 'pem' }))
  return { privateKeyPath, publicKeyPath }
}
