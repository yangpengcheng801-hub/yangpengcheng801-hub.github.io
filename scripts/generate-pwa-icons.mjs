/**
 * 生成 PWA 图标（纯 Node，无额外依赖）
 */
import fs from 'fs'
import path from 'path'
import zlib from 'zlib'

const outDir = path.resolve('public/icons')

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function createSolidPng(size, r, g, b) {
  const row = Buffer.alloc(1 + size * 3)
  row[0] = 0
  for (let x = 0; x < size; x++) {
    const i = 1 + x * 3
    row[i] = r
    row[i + 1] = g
    row[i + 2] = b
  }
  const raw = Buffer.concat(Array(size).fill(row))
  const compressed = zlib.deflateSync(raw)

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

fs.mkdirSync(outDir, { recursive: true })
for (const size of [192, 512]) {
  const file = path.join(outDir, `icon-${size}.png`)
  fs.writeFileSync(file, createSolidPng(size, 99, 102, 241))
  console.log('wrote', file)
}
