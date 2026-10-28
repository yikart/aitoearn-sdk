import { describe, expect, it } from 'vitest'
import { buildZip, crc32 } from './zip'

describe('buildZip', () => {
  it('生成符合 zip 结构的包（EOCD + 本地头）', () => {
    const zip = buildZip([
      { name: 'plugin.json', data: Buffer.from('{"a":1}') },
      { name: 'dist/index.mjs', data: Buffer.from('export {}') },
    ])
    // End of Central Directory 签名存在于尾部
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054B50)
    // 两个本地文件头签名
    const text = zip.toString('latin1')
    expect(text.split('PK\x03\x04').length - 1).toBe(2)
    // 中央目录计数 = 2
    expect(zip.readUInt16LE(zip.length - 22 + 10)).toBe(2)
  })

  it('crc32 与标准值一致', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xCBF43926)
  })
})
