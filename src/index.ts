/**
 * Vafast API Client
 * 
 * 类型安全的 Eden 风格 API 客户端
 * 
 * @example
 * ```typescript
 * import { eden, InferEden } from '@vafast/api-client'
 * import { defineRoute, defineRoutes, Type } from 'vafast'
 * 
 * // 定义路由（使用 as const 保留字面量类型）
 * const routeDefinitions = [
 *   defineRoute({
 *     method: 'GET',
 *     path: '/users',
 *     schema: { query: Type.Object({ page: Type.Number() }) },
 *     handler: ({ query }) => ({ users: [], page: query.page })
 *   }),
 *   defineRoute({
 *     method: 'POST',
 *     path: '/users',
 *     schema: { body: Type.Object({ name: Type.String() }) },
 *     handler: ({ body }) => ({ id: '1', name: body.name })
 *   })
 * ] as const
 * 
 * // 服务端
 * const routes = defineRoutes(routeDefinitions)
 * const server = new Server(routes)
 * 
 * // 客户端类型推断
 * type Api = InferEden<typeof routeDefinitions>
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
  ApiError,
} from './types'
