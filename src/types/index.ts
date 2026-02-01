/**
 * @vafast/api-client 类型定义
 */

// ==================== 基础类型 ====================

/** HTTP 方法 */
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'

/**
 * API 错误 - Go 风格结构化错误
 */
export interface ApiError {
  /** 错误码（HTTP 状态码或业务错误码） */
  code: number
  /** 错误消息 */
  message: string
}

/**
 * API 响应 - Go 风格
 * 
 * @example
 * ```typescript
 * const { data, error } = await api.users.get()
 * if (error) {
 *   console.error(`错误码: ${error.code}, 消息: ${error.message}`)
 *   return
 * }
 * console.log(data)
 * ```
 */
export interface ApiResponse<T = unknown> {
  /** 响应数据，成功时有值，失败时为 null */
  data: T | null
  /** 错误信息，成功时为 null，失败时有值 */
  error: ApiError | null
}

// ==================== 请求配置 ====================

/**
 * 请求配置（每次请求可传）
 */
export interface RequestConfig {
  /** 额外请求头（合并到全局） */
  headers?: Record<string, string>
  /** 超时时间（毫秒），覆盖全局 */
  timeout?: number
  /** 取消信号 */
  signal?: AbortSignal
  /** 元数据（传递给中间件） */
  meta?: Record<string, unknown>
  /** 查询参数（POST/PUT/PATCH 请求也可携带 query） */
  query?: Record<string, unknown>
}

// ==================== 上下文类型 ====================

/**
 * 请求上下文 - 贯穿整个请求生命周期
 */
export interface RequestContext {
  /** HTTP 方法 */
  method: string
  /** 请求路径（不含 baseURL） */
  path: string
  /** 完整 URL */
  url: URL
  /** 请求头（可修改） */
  headers: Headers
  /** 请求体 */
  body?: unknown
  /** 请求配置 */
  config?: RequestConfig
  /** 元数据存储（中间件间共享状态） */
  meta: Map<string, unknown>
  /** 当前重试次数 */
  retryCount: number
}

/**
 * 响应上下文
 */
export interface ResponseContext<T = unknown> {
  /** 关联的请求上下文 */
  request: RequestContext
  /** 原始 Response 对象 */
  raw: Response | null
  /** 解析后的数据 */
  data: T | null
  /** 错误信息 */
  error: ApiError | null
  /** HTTP 状态码 */
  status: number
}

// ==================== 中间件类型 ====================

/**
 * 中间件函数
 * 
 * @example
 * ```typescript
 * const logMiddleware: Middleware = async (ctx, next) => {
 *   console.log(`[${ctx.method}] ${ctx.path}`)
 *   const response = await next()
 *   console.log(`[${response.status}] ${ctx.path}`)
 *   return response
 * }
 * ```
 */
export type Middleware = (
  ctx: RequestContext,
  next: () => Promise<ResponseContext>
) => Promise<ResponseContext>

/**
 * 带名称的中间件（用于跳过/调试）
 */
export interface NamedMiddleware extends Middleware {
  /** 中间件名称 */
  middlewareName?: string
}

/**
 * 中间件选项
 */
export interface MiddlewareOptions {
  /** 中间件名称 */
  name?: string
}

// ==================== 客户端类型 ====================

/**
 * HTTP 客户端接口
 */
export interface Client {
  /** 基础 URL */
  readonly baseURL: string
  
  /** 添加中间件 */
  use(middleware: Middleware): Client
  use(name: string, middleware: Middleware): Client
  
  /** 设置默认请求头 */
  headers(h: Record<string, string>): Client
  
  /** 设置默认超时 */
  timeout(ms: number): Client
  
  /** 发起请求 */
  request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    config?: RequestConfig
  ): Promise<ApiResponse<T>>
}
