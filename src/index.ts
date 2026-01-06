/**
 * Vafast API Client
 * 
 * 类型安全的 Eden 风格 API 客户端
 * 
 * @example
 * ```typescript
 * import { eden, InferEden } from '@vafast/api-client'
 * import { defineRoutes, route, createHandler, Type } from 'vafast'
 * 
 * // 定义路由（无需 as const）
 * const routes = defineRoutes([
 *   route('GET', '/users', createHandler(...)),
 *   route('POST', '/users', createHandler(...))
 * ])
 * 
 * // 自动推断类型
 * type Api = InferEden<typeof routes>
 * const api = eden<Api>('http://localhost:3000')
 * 
 * // 类型安全的调用
 * const { data } = await api.users.get({ page: 1 })
 * ```
 */

// Eden 客户端（核心）
export {
  eden,
  type EdenConfig,
  type EdenClient,
  type InferEden,
  type SSEEvent,
  type SSESubscribeOptions,
  type SSESubscription,
} from './core/eden'

// 类型定义
export type {
  HTTPMethod,
  RequestConfig,
  ApiResponse,
} from './types'
