import type { QueryParams, PathParams, RequestBody, FileUpload, ApiFormData } from "../types";

/**
 * 构建查询字符串
 */
export function buildQueryString(params: QueryParams): string {
  if (!params || Object.keys(params).length === 0) return "";

  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      if (Array.isArray(value)) {
        value.forEach((v) => searchParams.append(key, String(v)));
      } else {
        searchParams.append(key, String(value));
      }
    }
  }

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : "";
}

/**
 * 替换路径参数
 */
export function replacePathParams(path: string, params: PathParams): string {
  let result = path;

  for (const [key, value] of Object.entries(params)) {
    result = result.replace(`:${key}`, String(value));
  }

  return result;
}

/**
 * 检查是否为文件对象
 */
export function isFile(value: unknown): value is File | Blob {
  return value instanceof File || value instanceof Blob;
}

/**
 * 检查是否为文件上传对象
 */
export function isFileUpload(value: unknown): value is FileUpload {
  if (value === null || value === undefined) return false;
  return (
    value && typeof value === "object" && "file" in value && isFile((value as FileUpload).file)
  );
}

/**
 * 检查对象是否包含文件
 */
export function hasFiles(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return false;

  for (const value of Object.values(obj as Record<string, unknown>)) {
    if (isFile(value) || isFileUpload(value)) return true;
    if (Array.isArray(value) && value.some(isFile)) return true;
    if (typeof value === "object" && hasFiles(value)) return true;
  }

  return false;
}

/**
 * 创建 FormData
 */
export function createFormData(data: ApiFormData): globalThis.FormData {
  const formData = new globalThis.FormData();

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;

    if (isFileUpload(value)) {
      formData.append(key, value.file, value.filename);
    } else if (isFile(value)) {
      formData.append(key, value);
    } else if (Array.isArray(value)) {
      value.forEach((v) => {
        if (isFileUpload(v)) {
          formData.append(key, v.file, v.filename);
        } else if (isFile(v)) {
          formData.append(key, v);
        } else {
          formData.append(key, String(v));
        }
      });
    } else {
      formData.append(key, String(value));
    }
  }

  return formData;
}

/**
 * 深度合并对象
 */
export function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target } as T;

  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const targetValue = result[key as keyof T];
      if (targetValue && typeof targetValue === "object" && !Array.isArray(targetValue)) {
        result[key as keyof T] = deepMerge(targetValue, value) as T[keyof T];
      } else {
        result[key as keyof T] = value as T[keyof T];
      }
    } else {
      result[key as keyof T] = value as T[keyof T];
    }
  }

  return result;
}

/**
 * 延迟函数
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 指数退避重试延迟
 */
export function exponentialBackoff(attempt: number, baseDelay: number, maxDelay: number): number {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  return delay + Math.random() * 1000; // 添加随机抖动
}

/**
 * 验证状态码
 */
export function validateStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

/**
 * 解析响应内容类型
 */
export function parseContentType(contentType: string | null): string {
  if (!contentType) return "text/plain";
  return contentType.split(";")[0].trim();
}

/**
 * 解析响应数据
 */
export async function parseResponse(response: Response): Promise<any> {
  const contentType = parseContentType(response.headers.get("content-type"));

  switch (contentType) {
    case "application/json":
      return response.json();
    case "application/octet-stream":
      return response.arrayBuffer();
    case "multipart/form-data":
      const formData = await response.formData();
      const data: Record<string, any> = {};
      formData.forEach((value, key) => {
        data[key] = value;
      });
      return data;
    case "text/event-stream":
      return response.body;
    default:
      return response.text();
  }
}

/**
 * 创建错误对象
 */
export function createError(status: number, message: string, data?: unknown): Error {
  const error = new Error(message) as Error & { status: number; data?: unknown; name: string };
  error.status = status;
  error.data = data;
  error.name = "ApiError";
  return error;
}

/**
 * 克隆请求对象
 */
export function cloneRequest(request: Request): Request {
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    mode: request.mode,
    credentials: request.credentials,
    cache: request.cache,
    redirect: request.redirect,
    referrer: request.referrer,
    referrerPolicy: request.referrerPolicy,
    integrity: request.integrity,
    keepalive: request.keepalive,
    signal: request.signal,
  });
}

/**
 * 检查是否为可重试的错误
 */
export function isRetryableError(error: Error, status?: number): boolean {
  if (status) {
    return [408, 429, 500, 502, 503, 504].includes(status);
  }

  // 网络错误通常是可重试的
  if (error.name === "TypeError" && error.message.includes("fetch")) {
    return true;
  }

  // 检查其他网络相关错误
  if (
    error.message.includes("fetch") ||
    error.message.includes("network") ||
    error.message.includes("connection")
  ) {
    return true;
  }

  return false;
}
