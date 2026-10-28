export const HOST_API_VERSION = '1.0.0'

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/

type SemverTuple = [number, number, number]

function parseVersion(version: string): SemverTuple | undefined {
  if (!VERSION_PATTERN.test(version)) {
    return undefined
  }
  return version.split('.').map(part => Number(part)) as SemverTuple
}

function compareVersions(a: SemverTuple, b: SemverTuple): number {
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) {
      return a[index] - b[index]
    }
  }
  return 0
}

function comparePartial(version: SemverTuple, expected: SemverTuple, precision: number): number {
  for (let index = 0; index < precision; index += 1) {
    if (version[index] !== expected[index]) {
      return version[index] - expected[index]
    }
  }
  return 0
}

/**
 * Minimal semver range matcher supporting the doc grammar:
 * `>=1.8.0 <3`, `^1.2.0`, `~1.2.0`, `1.2.3` and combinations.
 */
export function satisfiesVersion(version: string, range: string): boolean {
  const parsedVersion = parseVersion(version)
  if (!parsedVersion) {
    return false
  }
  return range.trim().split(/\s+/).every((clause) => {
    const match = /^(>=|<=|[><=^~])?(\d+(?:\.\d+){0,2})$/.exec(clause)
    if (!match) {
      return false
    }
    const operator = match[1] ?? '='
    const parts = match[2].split('.').map(part => Number(part))
    const expected: SemverTuple = [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
    const precision = parts.length
    switch (operator) {
      case '>=':
        return compareVersions(parsedVersion, expected) >= 0
      case '<=':
        return compareVersions(parsedVersion, expected) <= 0
      case '>':
        return compareVersions(parsedVersion, expected) > 0
      case '<':
        return compareVersions(parsedVersion, expected) < 0
      case '~':
        return comparePartial(parsedVersion, expected, Math.min(precision, 2)) === 0
      case '^':
        return comparePartial(parsedVersion, expected, 1) === 0 && compareVersions(parsedVersion, expected) >= 0
      default:
        if (precision === 3) {
          return compareVersions(parsedVersion, expected) === 0
        }
        return comparePartial(parsedVersion, expected, precision) === 0
    }
  })
}

const MAJOR_CEILING = Number.POSITIVE_INFINITY

/**
 * 计算区间允许的主版本闭区间 [lo, hi]（hi 为 Infinity 表示无上界）。
 * 区间非法或主版本范围为空时返回 undefined。边界刻意宽松（如 `>2` 记 lo=2），
 * 精确命中仍由 satisfiesVersion 把关，这里只做跨主版本的粗粒度闸门。
 */
function rangeMajors(range: string): [number, number] | undefined {
  let lo = 0
  let hi = MAJOR_CEILING
  for (const clause of range.trim().split(/\s+/)) {
    const match = /^(>=|<=|[><=^~])?(\d+(?:\.\d+){0,2})$/.exec(clause)
    if (!match) {
      return undefined
    }
    const operator = match[1] ?? '='
    const parts = match[2].split('.').map(part => Number(part))
    const major = parts[0] ?? 0
    const hasUpperTail = parts.slice(1).some(part => part > 0)
    switch (operator) {
      case '>=':
      case '>':
        // >X.Y.Z 仍允许主版本 X（如 >1.8.0 含 1.9.0）
        lo = Math.max(lo, major)
        break
      case '<=':
        hi = Math.min(hi, major)
        break
      case '<':
        // <3.0.0 排除主版本 3，<3.0.1 仍允许 3.0.0
        hi = Math.min(hi, hasUpperTail ? major : major - 1)
        break
      case '^':
      case '~':
      default:
        lo = Math.max(lo, major)
        hi = Math.min(hi, major)
    }
  }
  return lo > hi ? undefined : [lo, hi]
}

/**
 * Host/plugin apiVersion compatibility: the host version must satisfy the
 * declared range and its major must lie within the majors the range allows
 * （compound ranges like `>=1.8.0 <3` are supported, see plan §9）.
 */
export function isApiCompatible(pluginApiVersion: string, hostApiVersion: string = HOST_API_VERSION): boolean {
  const host = parseVersion(hostApiVersion)
  if (!host) {
    return false
  }
  const majors = rangeMajors(pluginApiVersion)
  if (!majors || host[0] < majors[0] || host[0] > majors[1]) {
    return false
  }
  return satisfiesVersion(hostApiVersion, pluginApiVersion)
}
