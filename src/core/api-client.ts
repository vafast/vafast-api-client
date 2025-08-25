import type {
  ApiClientConfig,
  RequestConfig,
  ApiResponse,
  QueryParams,
  PathParams,
  RequestBody,
  ApiMiddleware,
  Interceptor,
  CacheConfig,
  RetryConfig,
  LogConfig,
} from "../types";
import {
  buildQueryString,
  replacePathParams,
  hasFiles,
  createFormData,
  deepMerge,
  delay,
  exponentialBackoff,
  validateStatus,
  parseResponse,
  createError,
  cloneRequest,
  isRetryableError,
} from "../utils";

/**
 * Vafast API 客户端
 */
export class VafastApiClient {
  private config: ApiClientConfig;
  private middlewares: ApiMiddleware[] = [];
  private interceptors: Interceptor[] = [];
  private cache = new Map<string, { data: unknown; timestamp: number; ttl: number }>();

  constructor(config: ApiClientConfig = {}) {
    this.config = {
      baseURL: "",
      defaultHeaders: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
      retries: 3,
      retryDelay: 1000,
      validateStatus,
      ...config,
    };
  }

  /**
   * 添加中间件
   */
  addMiddleware(middleware: ApiMiddleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * 移除中间件
   */
  removeMiddleware(name: string): this {
    const index = this.middlewares.findIndex((m) => m.name === name);
    if (index !== -1) {
      this.middlewares.splice(index, 1);
    }
    return this;
  }

  /**
   * 添加拦截器
   */
  addInterceptor(interceptor: Interceptor): this {
    this.interceptors.push(interceptor);
    return this;
  }

  /**
   * 移除拦截器
   */
  removeInterceptor(index: number): this {
    if (index >= 0 && index < this.interceptors.length) {
      this.interceptors.splice(index, 1);
    }
    return this;
  }

  /**
   * 设置缓存配置
   */
  setCacheConfig(config: CacheConfig): this {
    // 实现缓存逻辑
    return this;
  }

  /**
   * 设置重试配置
   */
  setRetryConfig(config: RetryConfig): this {
    // 实现重试逻辑
    return this;
  }

  /**
   * 设置日志配置
   */
  setLogConfig(config: LogConfig): this {
    // 实现日志逻辑
    return this;
  }

  /**
   * 发送请求
   */
  async request<T = any>(
    method: string,
    path: string,
    config: RequestConfig = {}
  ): Promise<ApiResponse<T>> {
    const requestConfig = deepMerge(this.config, config);
    const url = this.buildUrl(path);

    try {
      // 应用请求拦截器
      let finalConfig = requestConfig;
      for (const interceptor of this.interceptors) {
        if (interceptor.request) {
          const result = await interceptor.request(finalConfig);
          if (result) finalConfig = result;
        }
      }

      // 应用中间件
      let request = this.createRequest(method, url, finalConfig);
      for (const middleware of this.middlewares) {
        if (middleware.onRequest) {
          const result = await middleware.onRequest(request, finalConfig);
          if (result) request = result;
        }
      }

      // 发送请求
      const response = await this.sendRequest(request, finalConfig);

      // 应用响应拦截器
      let finalResponse = response;
      for (const interceptor of this.interceptors) {
        if (interceptor.response) {
          const result = await interceptor.response(finalResponse);
          if (result) finalResponse = result;
        }
      }

      // 应用响应中间件
      for (const middleware of this.middlewares) {
        if (middleware.onResponse) {
          const result = await middleware.onResponse(finalResponse, finalConfig);
          if (result) finalResponse = result;
        }
      }

      // 解析响应
      const data = await parseResponse(finalResponse);

      return {
        data,
        error: null,
        status: finalResponse.status,
        headers: finalResponse.headers,
        response: finalResponse,
      };
    } catch (error) {
      // 应用错误拦截器
      let finalError = error as Error;
      for (const interceptor of this.interceptors) {
        if (interceptor.error) {
          const result = await interceptor.error(finalError);
          if (result) finalError = result;
        }
      }

      // 应用错误中间件
      for (const middleware of this.middlewares) {
        if (middleware.onError) {
          middleware.onError(finalError, requestConfig);
        }
      }

      return {
        data: null,
        error: finalError,
        status: 0,
        headers: new Headers(),
        response: new Response(),
      };
    }
  }

  /**
   * GET 请求
   */
  async get<T = any>(
    path: string,
    query?: QueryParams,
    config?: RequestConfig
  ): Promise<ApiResponse<T>> {
    const url = path + buildQueryString(query || {});
    return this.request<T>("GET", url, config);
  }

  /**
   * POST 请求
   */
  async post<T = any>(
    path: string,
    body?: RequestBody,
    config?: RequestConfig
  ): Promise<ApiResponse<T>> {
    return this.request<T>("POST", path, { ...config, body });
  }

  /**
   * PUT 请求
   */
  async put<T = any>(
    path: string,
    body?: RequestBody,
    config?: RequestConfig
  ): Promise<ApiResponse<T>> {
    return this.request<T>("PUT", path, { ...config, body });
  }

  /**
   * DELETE 请求
   */
  async delete<T = any>(path: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>("DELETE", path, config);
  }

  /**
   * PATCH 请求
   */
  async patch<T = any>(
    path: string,
    body?: RequestBody,
    config?: RequestConfig
  ): Promise<ApiResponse<T>> {
    return this.request<T>("PATCH", path, { ...config, body });
  }

  /**
   * HEAD 请求
   */
  async head<T = any>(path: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>("HEAD", path, config);
  }

  /**
   * OPTIONS 请求
   */
  async options<T = any>(path: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>("OPTIONS", path, config);
  }

  /**
   * 构建完整 URL
   */
  private buildUrl(path: string): string {
    if (path.startsWith("http://") || path.startsWith("https://")) {
      return path;
    }

    const baseURL = this.config.baseURL || "";
    const cleanPath = path.startsWith("/") ? path : `/${path}`;

    return `${baseURL}${cleanPath}`;
  }

  /**
   * 创建请求对象
   */
  private createRequest(method: string, url: string, config: RequestConfig): Request {
    const headers = new Headers(this.config.defaultHeaders);

    if (config.headers) {
      for (const [key, value] of Object.entries(config.headers)) {
        headers.set(key, value);
      }
    }

    let body: string | FormData | undefined = undefined;

    if (config.body !== undefined && config.body !== null) {
      if (hasFiles(config.body as Record<string, unknown>)) {
        body = createFormData(config.body as Record<string, unknown>);
        // 不设置 Content-Type，让浏览器自动设置
        headers.delete("Content-Type");
      } else if (typeof config.body === "object") {
        body = JSON.stringify(config.body);
        headers.set("Content-Type", "application/json");
      } else {
        body = String(config.body);
        headers.set("Content-Type", "text/plain");
      }
    }

    return new Request(url, {
      method: method.toUpperCase(),
      headers,
      body,
      mode: "cors",
      credentials: "same-origin",
      cache: "default",
    });
  }

  /**
   * 发送请求（带重试逻辑）
   */
  private async sendRequest(request: Request, config: RequestConfig): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= (config.retries || this.config.retries || 0); attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          config.timeout || this.config.timeout
        );

        const response = await fetch(cloneRequest(request), {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (this.config.validateStatus!(response.status)) {
          return response;
        }

        // 状态码错误，检查是否可重试
        if (!isRetryableError(new Error(), response.status)) {
          return response;
        }

        lastError = createError(response.status, `HTTP ${response.status}`, response);
      } catch (error) {
        lastError = error as Error;

        // 检查是否可重试
        if (
          !isRetryableError(error as Error) ||
          attempt === (config.retries || this.config.retries || 0)
        ) {
          throw error;
        }

        // 等待后重试
        const delayMs = exponentialBackoff(
          attempt,
          config.retryDelay || this.config.retryDelay || 1000,
          10000
        );
        await delay(delayMs);
      }
    }

    throw lastError || new Error("Request failed after all retries");
  }

  /**
   * 清除缓存
   */
  clearCache(): this {
    this.cache.clear();
    return this;
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}
