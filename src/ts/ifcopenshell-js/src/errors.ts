/**
 * Public error types for `ifcopenshell`.
 *
 * Brand protocol matches generated `ifcopenshell_api.mjs` so `instanceof`
 * works across errors thrown by the low-level API and this package.
 */

const ERROR_BRAND = Symbol.for('org.ifcopenshell.error');

export const IfcOpenShellErrorKind = Object.freeze({
  NONE: 0,
  RUNTIME: 1,
  VALUE: 2,
  TYPE: 3,
  CANCELLED: 4,
} as const);

export type IfcOpenShellErrorKind =
  (typeof IfcOpenShellErrorKind)[keyof typeof IfcOpenShellErrorKind];

export const IfcOpenShellErrorCode = Object.freeze({
  NONE: 0,
  UNSPECIFIED: 1,
  INVALID_ARGUMENT: 2,
  DOMAIN_ERROR: 3,
  OPERATION_CANCELLED: 4,
} as const);

export type IfcOpenShellErrorCode =
  (typeof IfcOpenShellErrorCode)[keyof typeof IfcOpenShellErrorCode];

export class IfcOpenShellError extends Error {
  readonly kind: IfcOpenShellErrorKind;
  readonly code: IfcOpenShellErrorCode;

  constructor(message: string, cause?: unknown);
  constructor(
    kind: IfcOpenShellErrorKind,
    code: IfcOpenShellErrorCode,
    message: string,
    cause?: unknown,
  );
  constructor(
    kindOrMessage: IfcOpenShellErrorKind | string,
    codeOrCause?: IfcOpenShellErrorCode | unknown,
    message?: string,
    cause?: unknown,
  ) {
    let kind: IfcOpenShellErrorKind;
    let code: IfcOpenShellErrorCode;
    let msg: string;
    let errCause: unknown;

    if (typeof kindOrMessage === 'string') {
      msg = kindOrMessage;
      errCause = codeOrCause;
      if (errCause instanceof IfcOpenShellError) {
        kind = errCause.kind;
        code = errCause.code;
      } else {
        kind = IfcOpenShellErrorKind.RUNTIME;
        code = IfcOpenShellErrorCode.UNSPECIFIED;
      }
    } else {
      kind = kindOrMessage;
      code = codeOrCause as IfcOpenShellErrorCode;
      msg = message!;
      errCause = cause;
    }

    super(msg, errCause !== undefined ? { cause: errCause } : undefined);
    this.name = kind === IfcOpenShellErrorKind.CANCELLED ? 'AbortError' : 'IfcOpenShellError';
    this.kind = kind;
    this.code = code;
    Object.defineProperty(this, ERROR_BRAND, { value: true });
  }

  static override [Symbol.hasInstance](value: unknown): boolean {
    return !!(value && (value as Record<symbol, unknown>)[ERROR_BRAND] === true);
  }
}

export function abortError(
  message = 'IfcOpenShell operation was cancelled',
  cause?: unknown,
): IfcOpenShellError {
  return new IfcOpenShellError(
    IfcOpenShellErrorKind.CANCELLED,
    IfcOpenShellErrorCode.OPERATION_CANCELLED,
    message,
    cause,
  );
}

export function isIfcOpenShellAbortError(error: unknown): error is IfcOpenShellError {
  return error instanceof IfcOpenShellError
    && error.code === IfcOpenShellErrorCode.OPERATION_CANCELLED;
}
