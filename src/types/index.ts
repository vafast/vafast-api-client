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
 * API 响应
 */
export interface ApiResponse<T = unknown> {
  /** 响应数据 */
  data: T | null
  /** 错误信息 */
  error: Error | null
  /** HTTP 状态码 */
  status: number
  /** 响应头 */
  headers: Headers
  /** 原始响应对象 */
  response: Response
}
