/**
 * .aitpkg 格式：zip（store-only，无压缩）+ CRC32。
 * 刻意不引入第三方 zip 依赖：插件分发生态零 npm 依赖是方案底线。
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let crc = index
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xEDB88320 ^ (crc >>> 1) : crc >>> 1
    }
    table[index] = crc >>> 0
  }
  return table
})()

export function crc32(buffer: Buffer): number {
  let crc = 0xFFFFFFFF
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8)
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

export interface ZipEntryInput {
  name: string
  data: Buffer
}

interface CentralEntry {
  name: Buffer
  crc: number
  size: number
  offset: number
}

function dosDateTime(date: Date): { date: number, time: number } {
  return {
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
  }
}

export function buildZip(entries: ZipEntryInput[]): Buffer {
  const chunks: Buffer[] = []
  const central: CentralEntry[] = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const crc = crc32(entry.data)
    const { date, time } = dosDateTime(new Date())
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034B50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6) // UTF-8 文件名
    local.writeUInt16LE(0, 8) // store-only
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(entry.data.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    chunks.push(local, name, entry.data)
    central.push({ name, crc, size: entry.data.length, offset })
    offset += local.length + name.length + entry.data.length
  }
  const centralStart = offset
  for (const entry of central) {
    const { date, time } = dosDateTime(new Date())
    const header = Buffer.alloc(46)
    header.writeUInt32LE(0x02014B50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(20, 6)
    header.writeUInt16LE(0x0800, 8)
    header.writeUInt16LE(0, 10)
    header.writeUInt16LE(time, 12)
    header.writeUInt16LE(date, 14)
    header.writeUInt32LE(entry.crc, 16)
    header.writeUInt32LE(entry.size, 20)
    header.writeUInt32LE(entry.size, 24)
    header.writeUInt16LE(entry.name.length, 28)
    header.writeUInt32LE(0, 30) // extra + comment
    header.writeUInt16LE(0, 34)
    header.writeUInt16LE(0, 36)
    header.writeUInt32LE(0, 38)
    header.writeUInt32LE(entry.offset, 42)
    chunks.push(header, entry.name)
    offset += header.length + entry.name.length
  }
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054B50, 0)
  end.writeUInt16LE(central.length, 8)
  end.writeUInt16LE(central.length, 10)
  end.writeUInt32LE(offset - centralStart, 12)
  end.writeUInt32LE(centralStart, 16)
  chunks.push(end)
  return Buffer.concat(chunks)
}
