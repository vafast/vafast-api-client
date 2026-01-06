// 基础类型定义
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'

// 简化的 vafast 类型定义
// 支持两种风格：
// 1. 运行时路由配置 (VafastRoute)
// 2. API 类型契约 (ApiContractRoute)

/** 运行时路由配置 */
export interface VafastRoute {
  method: string
  path: string
  handler: RouteHandler
}

/** API 契约路由（用于类型推断） */
export interface ApiContractRoute {
  [method: string]: {
    query?: Record<string, unknown>
    params?: Record<string, unknown>
    body?: unknown
    response?: unknown
  }
}

/** Server 类型 - 支持两种路由风格 */
export interface Server {
  routes: Record<string, VafastRoute | ApiContractRoute>
}

/** 旧版 Route 类型（向后兼容） */
export interface Route extends VafastRoute {}

export interface RouteHandler {
  (req: unknown, res: unknown): unknown
}

/**
 * 请求配置
 */
export interface RequestConfig {
  headers?: Record<string, string>
  timeout?: number
  retries?: number
  retryDelay?: number
  body?: RequestBody
}

// 响应类型
export interface ApiResponse<T = unknown> {
  data: T | null
  error: Error | null
  status: number
  headers: Headers
  response: Response
}

// 查询参数类型
export type QueryParams = Record<string, string | number | boolean | undefined | null>

// 路径参数类型
export type PathParams = Record<string, string | number>

// 请求体类型
export type RequestBody = unknown

// API 客户端配置
export interface ApiClientConfig extends RequestConfig {
  baseURL?: string
  defaultHeaders?: Record<string, string>
  timeout?: number
  retries?: number
  retryDelay?: number
  validateStatus?: (status: number) => boolean
}

// 类型推断类型
export type InferRouteHandler<T> = T extends RouteHandler ? T : never
export type InferServer<T> = T extends Server ? T : never
export type RoutePath<T> = T extends Route ? T['path'] : never
export type RouteMethod<T> = T extends Route ? T['method'] : never
export type RouteHandlerType<T> = T extends Route ? T['handler'] : never

// WebSocket 事件类型
export interface WebSocketEvent<T = unknown> {
  type: string
  data: T
  timestamp: number
}

// WebSocket 客户端类型
export interface WebSocketClient {
  connect(): Promise<void>
  disconnect(): void
  send(data: unknown): void
  on(event: string, callback: (data: unknown) => void): void
  off(event: string, callback: (data: unknown) => void): void
  isConnected(): boolean
}

// 文件上传类型
export interface FileUpload {
  file: File | Blob
  filename?: string
  contentType?: string
}

// 表单数据类型（重命名避免与全局 FormData 冲突）
export interface ApiFormData {
  [key: string]: string | number | boolean | File | Blob | FileUpload | ApiFormData | (string | number | boolean | File | Blob | FileUpload | ApiFormData)[] | unknown
}

// 中间件类型
export interface ApiMiddleware {
  name: string
  onRequest?: (request: Request, config: RequestConfig) => Request | Promise<Request>
  onResponse?: (response: Response, config: RequestConfig) => Response | Promise<Response>
  onError?: (error: Error, config: RequestConfig) => Error | Promise<Error>
}

// 缓存配置类型
export interface CacheConfig {
  enabled: boolean
  ttl: number
  maxSize: number
  strategy: 'memory' | 'localStorage' | 'sessionStorage'
}

// 重试配置类型
export interface RetryConfig {
  enabled: boolean
  maxRetries: number
  retryDelay: number
  backoffMultiplier: number
  retryableStatuses: number[]
}

// 拦截器类型
export interface Interceptor {
  request?: (config: RequestConfig) => RequestConfig | Promise<RequestConfig>
  response?: (response: Response) => Response | Promise<Response>
  error?: (error: Error) => Error | Promise<Error>
}

// 日志配置类型
export interface LogConfig {
  enabled: boolean
  level: 'debug' | 'info' | 'warn' | 'error'
  format: 'json' | 'text'
  includeHeaders: boolean
  includeBody: boolean
}
