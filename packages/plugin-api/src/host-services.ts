export interface HostHttpRequest {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string
}

export interface HostHttpResponse {
  status: number
  headers: Record<string, string>
  body: string
}

export interface HostLogMeta {
  [key: string]: unknown
}

export interface HostSecrets {
  /**
   * 密钥以回调参数形式临时可用，调用结束即失效。
   * key 必须在 plugin.json permissions.secrets 中声明。
   */
  use: <T>(key: string, fn: (value: string) => Promise<T> | T) => Promise<T>
}

export interface HostStorage {
  get: (key: string) => Promise<unknown>
  set: (key: string, value: unknown) => Promise<void>
  delete: (key: string) => Promise<void>
}

export interface HostServices {
  http: {
    request: (request: HostHttpRequest) => Promise<HostHttpResponse>
  }
  secrets: HostSecrets
  /** 按 pluginId + 账号 id 分区，配额见 plugin.json permissions.storage */
  storage: HostStorage
  log: {
    info: (message: string, meta?: HostLogMeta) => void
    warn: (message: string, meta?: HostLogMeta) => void
    error: (message: string, meta?: HostLogMeta) => void
  }
}
