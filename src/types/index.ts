/**
 * 类型定义
 */

/** HTTP 方法 */
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'

/**
 * 请求配置
 */
export interface RequestConfig {
  /** 请求头 */
  headers?: Record<string, string>
  /** 超时时间（毫秒） */
  timeout?: number
  /** 取消信号 */
  signal?: AbortSignal
}

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
