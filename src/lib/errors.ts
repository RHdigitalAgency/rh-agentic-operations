export class AppError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
  }
}
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, "VALIDATION");
  }
}
export class UnauthenticatedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, 401, "UNAUTHENTICATED");
  }
}
export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action") {
    super(message, 403, "FORBIDDEN");
  }
}
export class NotFoundError extends AppError {
  constructor(message = "Record not found") {
    super(message, 404, "NOT_FOUND");
  }
}
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
  }
}

/** Records outside the caller's scope are reported as not found, so restricted roles cannot probe for existence. */
export function assertFound<T>(row: T | undefined | null, what = "Record"): T {
  if (!row) throw new NotFoundError(`${what} not found`);
  return row;
}
