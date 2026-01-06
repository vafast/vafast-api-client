// 核心 API 客户端
export { VafastApiClient } from './core/api-client'
export { 
  createTypedClient, 
  createRouteBasedClient, 
  createSimpleClient,
  type TypedApiClient 
} from './core/typed-client'

// Eden - 类型安全 API 客户端（推荐）
export {
  eden,
  type EdenConfig,
  type EdenClient,
  type InferEden,
} from './core/eden'

// WebSocket 客户端
export { 
  VafastWebSocketClient, 
  createWebSocketClient, 
  createTypedWebSocketClient 
} from './websocket/websocket-client'

// 类型定义
export type {
  // 基础类型
  HTTPMethod,
  RequestConfig,
  ApiResponse,
  QueryParams,
  PathParams,
  RequestBody,
  ApiClientConfig,
  
  // 类型推断
  InferRouteHandler,
  InferServer,
  RoutePath,
  RouteMethod,
  RouteHandlerType,
  
  // WebSocket 类型
  WebSocketEvent,
  WebSocketClient,
  
  // 文件类型
  FileUpload,
  ApiFormData,
  
  // 中间件和拦截器
  ApiMiddleware,
  Interceptor,
  
  // 配置类型
  CacheConfig,
  RetryConfig,
  LogConfig
} from './types'

// 工具函数
export {
  buildQueryString,
  replacePathParams,
  isFile,
  isFileUpload,
  hasFiles,
  createFormData,
  deepMerge,
  delay,
  exponentialBackoff,
  validateStatus,
  parseResponse,
  createError,
  cloneRequest,
  isRetryableError
} from './utils'

// 默认导出
import { VafastApiClient } from './core/api-client'
export default VafastApiClient
