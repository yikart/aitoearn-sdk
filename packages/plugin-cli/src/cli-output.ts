/** CLI 输出：仓库 lint 禁止 console，这里统一走 process 标准流 */

export function printLine(text: string): void {
  process.stdout.write(`${text}\n`)
}

export function printErrorLine(text: string): void {
  process.stderr.write(`${text}\n`)
}
