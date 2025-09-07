export type Result<T, E = Error> = 
  | { success: true; value: T }
  | { success: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { success: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { success: false, error };
}

export function unwrap<T, E = Error>(result: Result<T, E>): T {
    if (result.success) {
        return result.value
    } else {
        throw new Error(`Cannot unwrap error result: ${result.error instanceof Error ? result.error.message : String(result.error)}`);
    }
}

export function unwrapErr<T, E = Error>(result: Result<T, E>): E {
    if (!result.success) {
        return result.error;
    } else {
        throw new Error(`Cannot unwrap error from success result: ${JSON.stringify(result.value)}`);
    }
}

export function map<T, U, E = Error>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
    if (result.success) {
        return ok(fn(result.value));
    } else {
        return result;
    }
}

export function mapErr<T, E, F = Error>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
    if (result.success) {
        return result;
    } else {
        return err(fn(result.error));
    }
}