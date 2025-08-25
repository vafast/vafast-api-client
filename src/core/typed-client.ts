// 导入必要的类型
import type {
  ApiClientConfig,
  RequestConfig,
  ApiResponse,
  QueryParams,
  PathParams,
  RequestBody,
  Server,
  Route,
  RouteHandler,
  InferRouteHandler,
  InferServer,
  RoutePath,
  RouteMethod,
  RouteHandlerType,
} from "../types";
import { VafastApiClient } from "./api-client";
import { replacePathParams } from "../utils";

// 类型推断类型 - 重新导出
export type { InferRouteHandler, InferServer, RoutePath, RouteMethod, RouteHandlerType };

// 定义 HTTP 方法类型
type HttpMethod = "get" | "post" | "put" | "delete" | "patch" | "head" | "options";

// 类型守卫函数
function isHttpMethod(prop: string): prop is HttpMethod {
  return ["get", "post", "put", "delete", "patch", "head", "options"].includes(prop);
}

// 类型安全的 HTTP 方法映射
type HttpMethodMap = {
  get: (path: string, query?: QueryParams, config?: RequestConfig) => Promise<ApiResponse<unknown>>;
  post: (path: string, body?: RequestBody, config?: RequestConfig) => Promise<ApiResponse<unknown>>;
  put: (path: string, body?: RequestBody, config?: RequestConfig) => Promise<ApiResponse<unknown>>;
  delete: (path: string, config?: RequestConfig) => Promise<ApiResponse<unknown>>;
  patch: (
    path: string,
    body?: RequestBody,
    config?: RequestConfig
  ) => Promise<ApiResponse<unknown>>;
  head: (path: string, config?: RequestConfig) => Promise<ApiResponse<unknown>>;
  options: (path: string, config?: RequestConfig) => Promise<ApiResponse<unknown>>;
};

// 改进的参数类型判断
function isRequestBody(value: unknown): value is RequestBody {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof FormData)
  );
}

function isQueryParams(value: unknown): value is QueryParams {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof FormData)
  );
}

// 改进的路径构建函数
function normalizePath(basePath: string, prop: string): string {
  const cleanBase = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  const cleanProp = prop.startsWith("/") ? prop.slice(1) : prop;
  return `${cleanBase}/${cleanProp}`;
}

// 类型安全的客户端接口
export interface TypedApiClient<T> {
  // 基础 HTTP 方法
  get<P extends string>(
    path: P,
    query?: QueryParams,
    config?: RequestConfig
  ): Promise<ApiResponse<unknown>>;

  post<P extends string>(
    path: P,
    body?: RequestBody,
    config?: RequestConfig
  ): Promise<ApiResponse<unknown>>;

  put<P extends string>(
    path: P,
    body?: RequestBody,
    config?: RequestConfig
  ): Promise<ApiResponse<unknown>>;

  delete<P extends string>(path: P, config?: RequestConfig): Promise<ApiResponse<unknown>>;

  patch<P extends string>(
    path: P,
    body?: RequestBody,
    config?: RequestConfig
  ): Promise<ApiResponse<unknown>>;

  head<P extends string>(path: P, config?: RequestConfig): Promise<ApiResponse<unknown>>;

  options<P extends string>(path: P, config?: RequestConfig): Promise<ApiResponse<unknown>>;

  // 动态路径方法
  [key: string]: unknown;
}

/**
 * 创建类型安全的 API 客户端
 */
export function createTypedClient<T extends Server>(
  server: T,
  config?: ApiClientConfig
): TypedApiClient<T> {
  const apiClient = new VafastApiClient(config);

  // 创建代理对象，支持链式调用
  return new Proxy({} as TypedApiClient<T>, {
    get(target, prop: string) {
      // 如果是 HTTP 方法，返回对应的请求方法
      if (isHttpMethod(prop)) {
        return (path: string, bodyOrQuery?: RequestBody | QueryParams, config?: RequestConfig) => {
          const method = prop.toUpperCase();

          if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
            // 暂时使用类型断言，保持功能正常
            return (apiClient as any)[prop](path, bodyOrQuery as QueryParams, config);
          } else {
            return (apiClient as any)[prop](path, bodyOrQuery as RequestBody, config);
          }
        };
      }

      // 如果是路径段，返回新的代理对象
      return createPathProxy(apiClient, prop);
    },
  });
}

/**
 * 创建路径代理
 */
function createPathProxy(apiClient: VafastApiClient, basePath: string) {
  return new Proxy({} as Record<string, unknown>, {
    get(target, prop: string) {
      const currentPath = normalizePath(basePath, prop);

      // 如果是 HTTP 方法，返回对应的请求方法
      if (isHttpMethod(prop)) {
        return (bodyOrQuery?: RequestBody | QueryParams, config?: RequestConfig) => {
          const method = prop.toUpperCase();

          if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
            // 使用类型安全的方法调用
            const clientMethod = apiClient[prop as keyof HttpMethodMap];
            const queryParams = bodyOrQuery as QueryParams | undefined;
            return (clientMethod as any)(basePath, queryParams, config);
          } else {
            const clientMethod = apiClient[prop as keyof HttpMethodMap];
            const requestBody = bodyOrQuery as RequestBody | undefined;
            return (clientMethod as any)(basePath, requestBody, config);
          }
        };
      }

      // 如果是路径段，返回新的代理对象
      return createPathProxy(apiClient, currentPath);
    },

    // 处理函数调用（用于动态路径）
    apply(target, thisArg, args) {
      const [params, bodyOrQuery, config] = args as [
        PathParams,
        RequestBody | QueryParams,
        RequestConfig?
      ];

      // 替换路径参数
      const resolvedPath = replacePathParams(basePath, params || {});

      // 使用改进的参数类型判断
      if (bodyOrQuery && isRequestBody(bodyOrQuery) && !config) {
        // 如果有 body 参数，使用 POST 方法
        return apiClient.post(resolvedPath, bodyOrQuery, config);
      } else {
        // 否则使用 GET
        return apiClient.get(resolvedPath, bodyOrQuery as QueryParams, config);
      }
    },
  });
}

/**
 * 创建基于路由的客户端
 */
export function createRouteBasedClient<T extends Server>(
  server: T,
  config?: ApiClientConfig
): TypedApiClient<T> {
  const apiClient = new VafastApiClient(config);

  // 分析服务器路由，创建类型安全的客户端
  return createTypedClientFromRoutes(server, apiClient);
}

/**
 * 从路由创建类型安全的客户端
 */
function createTypedClientFromRoutes<T extends Server>(
  server: T,
  apiClient: VafastApiClient
): TypedApiClient<T> {
  // 这里可以根据实际的路由结构来生成客户端
  // 由于 Vafast 的路由结构，我们需要动态分析

  return new Proxy({} as TypedApiClient<T>, {
    get(target, prop: string) {
      // 返回一个可以处理动态路径的对象
      return createDynamicPathHandler(apiClient, prop);
    },
  });
}

/**
 * 创建动态路径处理器
 */
function createDynamicPathHandler(apiClient: VafastApiClient, basePath: string) {
  return new Proxy({} as Record<string, unknown>, {
    get(target, prop: string) {
      const currentPath = normalizePath(basePath, prop);

      // 如果是 HTTP 方法
      if (isHttpMethod(prop)) {
        return (bodyOrQuery?: RequestBody | QueryParams, config?: RequestConfig) => {
          const method = prop.toUpperCase();

          if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
            // 使用类型安全的方法调用
            const clientMethod = apiClient[prop as keyof HttpMethodMap];
            const queryParams = bodyOrQuery as QueryParams | undefined;
            return clientMethod(basePath, queryParams, config);
          } else {
            const clientMethod = apiClient[prop as keyof HttpMethodMap];
            const requestBody = bodyOrQuery as RequestBody | undefined;
            return (clientMethod as any)(basePath, requestBody, config);
          }
        };
      }

      // 继续构建路径
      return createDynamicPathHandler(apiClient, currentPath);
    },

    // 处理函数调用
    apply(target, thisArg, args) {
      const [params, bodyOrQuery, config] = args as [
        PathParams,
        RequestBody | QueryParams,
        RequestConfig?
      ];

      // 替换路径参数
      const resolvedPath = replacePathParams(basePath, params || {});

      // 使用改进的参数类型判断
      if (bodyOrQuery && isRequestBody(bodyOrQuery) && !config) {
        return apiClient.post(resolvedPath, bodyOrQuery);
      } else {
        return apiClient.get(resolvedPath, bodyOrQuery as QueryParams, config);
      }
    },
  });
}

/**
 * 创建简单的类型安全客户端
 */
export function createSimpleClient<T extends Server>(
  server: T,
  config?: ApiClientConfig
): TypedApiClient<T> {
  const apiClient = new VafastApiClient(config);

  return {
    get: (path: string, query?: QueryParams, config?: RequestConfig) =>
      (apiClient as any).get(path, query, config),

    post: (path: string, body?: RequestBody, config?: RequestConfig) =>
      (apiClient as any).post(path, body, config),

    put: (path: string, body?: RequestBody, config?: RequestConfig) =>
      (apiClient as any).put(path, body, config),

    delete: (path: string, config?: RequestConfig) => (apiClient as any).delete(path, config),

    patch: (path: string, body?: RequestBody, config?: RequestConfig) =>
      (apiClient as any).patch(path, body, config),

    head: (path: string, config?: RequestConfig) => (apiClient as any).head(path, config),

    options: (path: string, config?: RequestConfig) => (apiClient as any).options(path, config),
  } as TypedApiClient<T>;
}
