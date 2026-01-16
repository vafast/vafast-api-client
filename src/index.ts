/**
 * @vafast/api-client
 * 
 * 企业级类型安全 API 客户端
 * 
 * 特性：
 * - 中间件架构：可组合、可扩展
 * - 类型安全：端到端类型推断
 * - Go 风格：{ data, error } 响应格式
 * 
 * @example
 * ```typescript
 * import { createClient, eden, retryMiddleware } from '@vafast/api-client'
 * 
 * // 创建客户端
 * const client = createClient('http://localhost:3000')
 *   .use(authMiddleware)
 *   .use(retryMiddleware({ count: 2 }))
 * 
 * // 类型安全包装
 * const api = eden<Api>(client)
 * 
 * // 使用
 * const { data, error } = await api.users.find.post({ page: 1 })
 * ```
 */

// ==================== 核心 ====================

// 客户端
export { createClient, defineMiddleware, type ClientConfig } from './core/client'

// Eden 类型包装
export {
  eden,
  type EdenClient,
  type InferEden,
  type SSEEvent,
  type SSESubscribeOptions,
  type SSESubscription,
} from './core/eden'

// ==================== 中间件 ====================

export {
  timeoutMiddleware,
  retryMiddleware,
  loggerMiddleware,
  type RetryOptions,
  type LoggerOptions,
} from './middlewares'

// ==================== 类型 ====================

export type {
  // 基础类型
  HTTPMethod,
  ApiError,
  ApiResponse,
  RequestConfig,
  // 上下文类型
  RequestContext,
  ResponseContext,
  // 中间件类型
  Middleware,
  NamedMiddleware,
  MiddlewareOptions,
  // 客户端类型
  Client,
} from './types'
