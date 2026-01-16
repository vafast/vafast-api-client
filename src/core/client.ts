/**
 * HTTP 客户端实现
 * 
 * 基于中间件模式的可扩展 HTTP 客户端
 */

import type {
  ApiError,
  ApiResponse,
  Client,
  Middleware,
  NamedMiddleware,
  MiddlewareOptions,
  RequestConfig,
  RequestContext,
  ResponseContext,
} from '../types'
import { compose } from './compose'

// ==================== 辅助函数 ====================

/**
 * 定义带名称的中间件
 */
export function defineMiddleware(
  fn: Middleware,
  options?: MiddlewareOptions
): NamedMiddleware {
  const named = fn as NamedMiddleware
  if (options?.name) {
    named.middlewareName = options.name
  }
  return named
}

/**
 * 创建成功响应
 */
function createSuccessResponse<T>(data: T | null, ctx: RequestContext, raw: Response): ResponseContext<T> {
  return {
    request: ctx,
    raw,
    data,
    error: null,
    status: raw.status,
  }
}

/**
 * 创建错误响应
 */
function createErrorResponse<T = unknown>(
  code: number,
  message: string,
  ctx: RequestContext,
  raw: Response | null = null
): ResponseContext<T> {
  return {
    request: ctx,
    raw,
    data: null,
    error: { code, message },
    status: raw?.status ?? 0,
  }
}

// ==================== 客户端实现 ====================

/**
 * 内部客户端实现类
 */
class ClientImpl implements Client {
  readonly baseURL: string
  private middlewares: NamedMiddleware[] = []
  private defaultHeaders: Record<string, string> = {}
  private defaultTimeout: number = 30000

  constructor(baseURL: string) {
    // 移除末尾斜杠
    this.baseURL = baseURL.replace(/\/+$/, '')
  }

  use(middlewareOrName: Middleware | string, middleware?: Middleware): Client {
    if (typeof middlewareOrName === 'string') {
      // use(name, middleware) 形式
      if (!middleware) {
        throw new Error('Middleware is required when name is provided')
      }
      const named = middleware as NamedMiddleware
      named.middlewareName = middlewareOrName
      this.middlewares.push(named)
    } else {
      // use(middleware) 形式
      this.middlewares.push(middlewareOrName as NamedMiddleware)
    }
    return this
  }

  headers(h: Record<string, string>): Client {
    this.defaultHeaders = { ...this.defaultHeaders, ...h }
    return this
  }

  timeout(ms: number): Client {
    this.defaultTimeout = ms
    return this
  }

  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    config?: RequestConfig
  ): Promise<ApiResponse<T>> {
    // 构建 URL
    const url = new URL(path.startsWith('/') ? path : `/${path}`, this.baseURL)

    // 构建请求头
    const headers = new Headers({
      'Content-Type': 'application/json',
      ...this.defaultHeaders,
      ...config?.headers,
    })

    // 构建元数据
    const meta = new Map<string, unknown>()
    if (config?.meta) {
      for (const [key, value] of Object.entries(config.meta)) {
        meta.set(key, value)
      }
    }

    // 构建请求上下文
    const ctx: RequestContext = {
      method: method.toUpperCase(),
      path,
      url,
      headers,
      body,
      config,
      meta,
      retryCount: 0,
    }

    // 最终的 fetch 处理器
    const finalHandler = async (): Promise<ResponseContext<T>> => {
      return this.executeFetch<T>(ctx)
    }

    try {
      // 执行中间件链
      const response = await compose(this.middlewares)(ctx, finalHandler)

      // 转换为 ApiResponse
      return {
        data: response.data as T | null,
        error: response.error,
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      return {
        data: null,
        error: { code: 0, message: error.message || '请求失败' },
      }
    }
  }

  /**
   * 执行实际的 fetch 请求
   */
  private async executeFetch<T>(ctx: RequestContext): Promise<ResponseContext<T>> {
    const { method, url, headers, body, config } = ctx

    // 超时控制
    const controller = new AbortController()
    const timeoutMs = config?.timeout ?? this.defaultTimeout
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    // 合并信号
    if (config?.signal) {
      config.signal.addEventListener('abort', () => controller.abort())
    }

    // 构建 fetch 选项
    const fetchOptions: RequestInit = {
      method,
      headers,
      signal: controller.signal,
    }

    // 添加请求体（GET/HEAD 不需要）
    if (body && method !== 'GET' && method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(body)
    }

    // GET 请求的查询参数
    if (method === 'GET' && body && typeof body === 'object') {
      for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value))
        }
      }
    }

    try {
      // 创建 Request 对象（便于测试和拦截）
      const request = new Request(url.toString(), fetchOptions)
      const response = await fetch(request)
      clearTimeout(timeoutId)

      // 解析响应
      const contentType = response.headers.get('content-type')
      let data: T | null = null

      if (contentType?.includes('application/json')) {
        data = await response.json()
      } else if (contentType?.includes('text/')) {
        data = await response.text() as unknown as T
      }

      // 成功响应
      if (response.ok) {
        return createSuccessResponse(data, ctx, response)
      }

      // 错误响应
      const errorData = data as { code?: number; message?: string } | null
      return createErrorResponse<T>(
        errorData?.code ?? response.status,
        errorData?.message ?? `HTTP ${response.status}`,
        ctx,
        response
      )
    } catch (err) {
      clearTimeout(timeoutId)

      const error = err instanceof Error ? err : new Error(String(err))

      // 超时错误
      if (error.name === 'AbortError') {
        return createErrorResponse<T>(408, '请求超时', ctx)
      }

      // 网络错误
      return createErrorResponse<T>(0, error.message || '网络错误', ctx)
    }
  }
}

// ==================== 导出 ====================

/** 客户端配置 */
export interface ClientConfig {
  baseURL: string
  timeout?: number
  headers?: Record<string, string>
}

/**
 * 创建 HTTP 客户端
 * 
 * @param config 基础 URL 或配置对象
 * @returns 客户端实例
 * 
 * @example
 * ```typescript
 * // 方式1：只传 baseURL
 * const client = createClient('/api')
 *   .use(authMiddleware)
 *   .timeout(30000)
 * 
 * // 方式2：传配置对象（推荐）
 * const client = createClient({
 *   baseURL: '/api',
 *   timeout: 30000,
 *   headers: { 'X-Custom': 'value' }
 * }).use(authMiddleware)
 * ```
 */
export function createClient(config: string | ClientConfig): Client {
  if (typeof config === 'string') {
    return new ClientImpl(config)
  }
  
  const client = new ClientImpl(config.baseURL)
  if (config.timeout !== undefined) {
    client.timeout(config.timeout)
  }
  if (config.headers) {
    client.headers(config.headers)
  }
  return client
}
