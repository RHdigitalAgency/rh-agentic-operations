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

/**
 * Maps errors to the app's error types. Database constraint and input errors (PostgreSQL SQLSTATE codes, raised by
 * both postgres.js and PGlite) become user-facing errors instead of 500s — e.g. a malformed id in a URL is "not
 * found", a lost race on a unique index is a conflict. Anything else returns null and stays an internal error.
 */
export function toAppError(e: unknown): AppError | null {
  if (e instanceof AppError) return e;
  const code = typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined;
  switch (code) {
    case "22P02": // invalid_text_representation (malformed uuid / number)
      return new NotFoundError();
    case "23505": // unique_violation
      return new ConflictError("This record already exists or was just changed. Refresh the page and try again.");
    case "23503": // foreign_key_violation
      return new ValidationError("A linked record no longer exists. Refresh the page and try again.");
    case "23514": // check_violation
    case "22003": // numeric_value_out_of_range
      return new ValidationError("A value is outside the allowed range.");
    case "22007": // invalid_datetime_format
    case "22008": // datetime_field_overflow
      return new ValidationError("Invalid date.");
    default:
      return null;
  }
}
