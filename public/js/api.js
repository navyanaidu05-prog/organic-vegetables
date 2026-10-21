export class ApiError extends Error {
  constructor(message, { status = 0, code = "REQUEST_FAILED", details = undefined } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(path, { method = "GET", body, signal } = {}) {
  const options = {
    method,
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal: signal || AbortSignal.timeout(25000)
  };

  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  } else if (method !== "GET" && method !== "HEAD") {
    options.headers["Content-Type"] = "application/json";
    options.body = "{}";
  }

  let response;
  try {
    response = await fetch(`/api${path}`, options);
  } catch (error) {
    if (error.name === "TimeoutError") {
      throw new ApiError("The request took too long. Please check your connection and try again.", {
        code: "TIMEOUT"
      });
    }
    throw new ApiError("We could not connect to the store. Check your internet connection and try again.", {
      code: "NETWORK"
    });
  }

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    throw new ApiError(data?.error?.message || "Something went wrong. Please try again.", {
      status: response.status,
      code: data?.error?.code || "REQUEST_FAILED",
      details: data?.error?.details
    });
  }

  return data;
}

export const api = {
  get: (path, options = {}) => request(path, { ...options, method: "GET" }),
  post: (path, body = {}, options = {}) => request(path, { ...options, method: "POST", body }),
  patch: (path, body = {}, options = {}) => request(path, { ...options, method: "PATCH", body }),
  delete: (path, options = {}) => request(path, { ...options, method: "DELETE", body: {} })
};
