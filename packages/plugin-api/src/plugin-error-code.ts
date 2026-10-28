export enum PluginErrorCode {
  InvalidManifest = 'AIT-PL-001',
  HashMismatch = 'AIT-PL-002',
  UntrustedSignature = 'AIT-PL-003',
  ApiVersionIncompatible = 'AIT-PL-004',
  PermissionViolation = 'AIT-PL-005',
  ActivateTimeout = 'AIT-PL-006',
  HookRejected = 'AIT-PL-007',
  IdempotencyConflict = 'AIT-PL-008',
}

export class PluginError extends Error {
  constructor(
    readonly code: PluginErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'PluginError'
  }
}

export enum AgentErrorCode {
  Unauthorized = 'AIT-AG-001',
  WriteNotConfirmed = 'AIT-AG-002',
  RateLimited = 'AIT-AG-003',
  ContentRiskControl = 'AIT-AG-004',
  RevokeTimeout = 'AIT-AG-005',
}

export class AgentError extends Error {
  constructor(
    readonly code: AgentErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'AgentError'
  }
}
