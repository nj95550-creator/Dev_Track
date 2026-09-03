function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Separates intentional request cancellation from transport failures.
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Keeps transport, HTTP, and backend errors consistent across every DevTrack
 * request. Reading text before parsing JSON also prevents proxy error pages
 * from surfacing as confusing JSON syntax errors.
 */
export async function requestJson<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, options);
  } catch (error: unknown) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new Error(
      "DevTrack cannot reach the backend right now. Make sure the API server is running, then try again.",
      { cause: error }
    );
  }

  const responseText = await response.text();
  let payload: unknown;

  try {
    payload = responseText.length > 0 ? JSON.parse(responseText) : null;
  } catch {
    if (response.status >= 500) {
      throw new Error(
        "DevTrack cannot reach the backend right now. Make sure the API server is running, then try again."
      );
    }

    throw new Error("The server returned an unreadable response. Please try again.");
  }

  if (!response.ok) {
    const backendMessage =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : null;

    throw new Error(
      backendMessage ??
        (response.status >= 500
          ? "The DevTrack backend is unavailable right now. Please try again shortly."
          : "The request could not be completed.")
    );
  }

  if (payload === null) {
    throw new Error("The server returned an empty response. Please try again.");
  }

  return payload as T;
}
