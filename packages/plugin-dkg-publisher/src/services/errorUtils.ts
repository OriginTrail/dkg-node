/**
 * Serializes an error object into a plain object capturing all useful properties.
 * Handles circular references, BigInt values, and non-enumerable Error properties.
 */
export function serializeErrorDetails(error: unknown): Record<string, unknown> {
  if (error === null || error === undefined) {
    return { message: String(error) };
  }

  if (typeof error === "string") {
    return { message: error };
  }

  if (typeof error !== "object") {
    return { message: String(error) };
  }

  const seen = new WeakSet();

  function sanitize(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "function") return undefined;
    if (typeof value !== "object") return value;

    if (seen.has(value as object)) return "[Circular]";
    seen.add(value as object);

    if (Array.isArray(value)) {
      return value.map(sanitize);
    }

    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (key === "stack") continue;
      result[key] = sanitize((value as Record<string, unknown>)[key]);
    }
    return result;
  }

  // Add root error to seen set to prevent circular references back to it
  seen.add(error as object);

  const err = error as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  // Extract standard Error properties (non-enumerable on some engines)
  if (error instanceof Error) {
    result.message = err.message;
    result.name = err.name;
    if ((error as any).code !== undefined) result.code = (error as any).code;
    if ((error as any).reason !== undefined)
      result.reason = (error as any).reason;
  }

  // Merge all enumerable properties
  for (const key of Object.keys(err)) {
    if (key === "stack") continue;
    result[key] = sanitize(err[key]);
  }

  return result;
}
