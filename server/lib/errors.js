export class ApiError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function notFound(message = "Not found") {
  return new ApiError(404, "NOT_FOUND", message);
}

export function forbidden(message = "You do not have permission to do that.") {
  return new ApiError(403, "FORBIDDEN", message);
}
