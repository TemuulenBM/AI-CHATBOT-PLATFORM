import { useEffect, useState } from "react";

/**
 * Hook to get CSRF token from cookie
 *
 * The CSRF token is automatically set by the server in a cookie named 'csrf-token-readable'.
 * This hook reads that token and provides it to components that need to make
 * state-changing requests (POST, PUT, PATCH, DELETE).
 *
 * Usage:
 * ```tsx
 * const csrfToken = useCsrfToken();
 *
 * // Then include in headers:
 * fetch('/api/endpoint', {
 *   method: 'POST',
 *   headers: {
 *     'X-CSRF-Token': csrfToken,
 *     'Content-Type': 'application/json',
 *   },
 *   body: JSON.stringify(data)
 * });
 * ```
 */
export function useCsrfToken(): string {
  const [token, setToken] = useState<string>("");

  useEffect(() => {
    // Read CSRF token from cookie
    const getCookie = (name: string): string | null => {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) {
        return parts.pop()?.split(';').shift() || null;
      }
      return null;
    };

    const csrfToken = getCookie("csrf-token-readable");
    if (csrfToken) {
      setToken(csrfToken);
    }
  }, []);

  return token;
}

/**
 * Get CSRF headers to include in fetch requests
 *
 * Usage:
 * ```tsx
 * const csrfHeaders = useCsrfHeaders();
 *
 * fetch('/api/endpoint', {
 *   method: 'POST',
 *   headers: {
 *     ...csrfHeaders,
 *     'Content-Type': 'application/json',
 *   },
 *   body: JSON.stringify(data)
 * });
 * ```
 */
export function useCsrfHeaders(): Record<string, string> {
  const token = useCsrfToken();

  return token ? { "X-CSRF-Token": token } : {};
}

/**
 * Get CSRF token from cookie (non-hook utility function)
 */
export function getCsrfToken(): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; csrf-token-readable=`);
  if (parts.length === 2) {
    return parts.pop()?.split(';').shift() || null;
  }
  return null;
}

/**
 * Get CSRF headers (non-hook utility function)
 */
export function getCsrfHeaders(): Record<string, string> {
  const token = getCsrfToken();
  return token ? { "X-CSRF-Token": token } : {};
}
