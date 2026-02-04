/**
 * HTTP 客户端实现
 * 
 * 基于中间件模式的可扩展 HTTP 客户端
 */

import qs from 'qs'
import type {
  ApiError,
  ApiResponse,
  Client,
  ErrorType,
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
  raw: Response | null = null,
  type: ErrorType = 'unknown'
): ResponseContext<T> {
  return {
    request: ctx,
    raw,
    data: null,
    error: { code, message, type },
    status: raw?.status ?? 0,
  }
}

/**
 * 判断是否为绝对 URL
 */
function isAbsoluteURL(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://')
}

/**
 * 构建请求 URL（简化版）
 * - 绝对 URL：直接使用
 * - 相对路径：直接拼接（保持代理工作）
 */
function buildRequestURL(baseURL: string, path: string, queryString: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const fullPath = `${baseURL}${normalizedPath}`
  return queryString ? `${fullPath}?${queryString}` : fullPath
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

  /**
   * 构建请求上下文（公共逻辑）
   */
  private buildContext(
    method: string,
    path: string,
    body?: unknown,
    config?: RequestConfig
  ): RequestContext {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    const dummyURL = new URL('http://placeholder')
    dummyURL.pathname = normalizedPath

    // 构建请求头（有 body 时才设置 Content-Type）
    const hasBody = body !== undefined && method !== 'GET' && method !== 'HEAD'
    const headers = new Headers({
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
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
    meta.set('baseURL', this.baseURL)

    return {
      method: method.toUpperCase(),
      path,
      url: dummyURL,
      headers,
      body,
      config,
      meta,
      retryCount: 0,
    }
  }

  /**
   * 构建查询字符串
   * 
   * 统一从 config.query 获取，语义清晰：
   * - body 就是 body（请求体）
   * - query 就是 query（URL 查询参数）
   */
  private buildQueryString(ctx: RequestContext): string {
    const { config } = ctx
    
    if (config?.query && typeof config.query === 'object') {
      return qs.stringify(config.query, { skipNulls: true, arrayFormat: 'indices' })
    }
    
    return ''
  }

  /**
   * 执行原始 fetch 请求（核心方法，不解析响应）
   */
  private async doFetch(ctx: RequestContext, signal?: AbortSignal): Promise<Response> {
    const { method, path, headers, body, meta } = ctx
    const baseURL = (meta.get('baseURL') as string) || this.baseURL
    const queryString = this.buildQueryString(ctx)
    const url = buildRequestURL(baseURL, path, queryString)

    const fetchOptions: RequestInit = {
      method,
      headers,
      signal,
    }

    // 添加请求体（GET/HEAD/OPTIONS 不需要）
    if (body !== undefined && method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      fetchOptions.body = JSON.stringify(body)
    }

    // 创建 Request 对象（便于测试和中间件）
    const request = new Request(url, fetchOptions)
    return fetch(request)
  }

  /**
   * 发起原始请求（返回 Response 对象，不解析 JSON）
   * 
   * 用于 SSE/流式请求等需要直接处理响应流的场景
   * 请求会完整走中间件链，但响应不会被解析
   */
  async requestRaw(
    method: string,
    path: string,
    body?: unknown,
    config?: RequestConfig
  ): Promise<Response> {
    const ctx = this.buildContext(method, path, body, config)

    const finalHandler = async (): Promise<ResponseContext<Response>> => {
      const response = await this.doFetch(ctx, config?.signal)
      return {
        request: ctx,
        raw: response,
        data: response,
        error: null,
        status: response.status,
      }
    }

    const response = await compose(this.middlewares)(ctx, finalHandler)
    
    if (!response.raw) {
      throw new Error('No response received')
    }
    
    return response.raw
  }

  /**
   * 发起请求（解析 JSON 响应）
   */
  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    config?: RequestConfig
  ): Promise<ApiResponse<T>> {
    const ctx = this.buildContext(method, path, body, config)

    const finalHandler = async (): Promise<ResponseContext<T>> => {
      // 超时控制
      const controller = new AbortController()
      const timeoutMs = config?.timeout ?? this.defaultTimeout
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

      // 合并用户传入的 signal
      if (config?.signal) {
        // 检查是否已经 aborted
        if (config.signal.aborted) {
          controller.abort()
        } else {
          config.signal.addEventListener('abort', () => controller.abort())
        }
      }

      try {
        const response = await this.doFetch(ctx, controller.signal)
        clearTimeout(timeoutId)

        // 解析响应
        const contentType = response.headers.get('content-type')
        let data: T | null = null

        if (contentType?.includes('application/json')) {
          data = await response.json()
        } else if (contentType?.includes('text/')) {
          data = await response.text() as unknown as T
        }

        if (response.ok) {
          return createSuccessResponse(data, ctx, response)
        }

        const errorData = data as { code?: number; message?: string } | null
        return createErrorResponse<T>(
          errorData?.code ?? response.status,
          errorData?.message ?? `HTTP ${response.status}`,
          ctx,
          response,
          'server'
        )
      } catch (err) {
        clearTimeout(timeoutId)
        const error = err instanceof Error ? err : new Error(String(err))

        // 区分错误类型
        if (error.name === 'AbortError') {
          // 检查是超时还是主动取消
          const isTimeout = !config?.signal?.aborted
          return createErrorResponse<T>(
            isTimeout ? 408 : 0,
            isTimeout ? '请求超时' : '请求已取消',
            ctx,
            null,
            isTimeout ? 'timeout' : 'abort'
          )
        }

        return createErrorResponse<T>(0, error.message || '网络错误', ctx, null, 'network')
      }
    }

    try {
      const response = await compose(this.middlewares)(ctx, finalHandler)
      return {
        data: response.data as T | null,
        error: response.error,
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      return {
        data: null,
        error: { code: 0, message: error.message || '请求失败', type: 'unknown' },
      }
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
