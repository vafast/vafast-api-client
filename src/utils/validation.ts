import type { ApiError, ErrorDetail } from '../types'

/** HTTP 422 或业务码 422 视为 schema 校验失败 */
export function isValidationError(
  error: ApiError | null | undefined,
  status?: number,
): error is ApiError & { details: ErrorDetail[] } {
  if (!error?.details?.length) return false
  return (status ?? 0) === 422 || error.code === 422
}

/** Arco Form setFields 参数 */
export function mapDetailsToFormFields(details: ErrorDetail[]) {
  return details.map((d) => ({
    field: d.field,
    message: d.message,
  }))
}
