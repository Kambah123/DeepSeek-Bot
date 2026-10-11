/** Application errors with HTTP status codes. Never leak internal error text or
 *  secrets to clients — map to a safe message in the API layer. */
export class AppError extends Error {
  status: number
  code: string
  constructor(message: string, status = 400, code = 'bad_request') {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.code = code
  }
  toJSON() {
    return { error: { message: this.message, code: this.code } }
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'unauthorized')
  }
}
export class ForbiddenError extends AppError {
  constructor(message = 'You do not have access to this resource') {
    super(message, 403, 'forbidden')
  }
}
export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, 404, 'not_found')
  }
}
export class ConflictError extends AppError {
  constructor(message = 'Conflict with current state') {
    super(message, 409, 'conflict')
  }
}
export class ValidationError extends AppError {
  constructor(message = 'Invalid input') {
    super(message, 422, 'validation')
  }
}
export class RateLimitError extends AppError {
  constructor(message = 'Rate limit or quota exceeded') {
    super(message, 429, 'rate_limit')
  }
}
export class GatewayError extends AppError {
  constructor(message = 'Model provider error') {
    super(message, 502, 'gateway_error')
  }
}

/** Coerce unknown throws into a safe, client-presentable AppError. */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err
  // Zod errors → validation
  if (err && typeof err === 'object' && 'issues' in err) {
    return new ValidationError('Validation failed')
  }
  return new AppError('Unexpected error', 500, 'internal')
}
