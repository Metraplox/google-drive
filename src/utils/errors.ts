import { HttpException } from '@nestjs/common';

export class ApiError extends HttpException {
  public readonly details?: string;

  constructor(
    message: string, 
    code: number, 
    details?: string
  ) {
    super(
      {
        error: message,
        code,
        ...(details && { details })
      },
      code
    );
    this.details = details;
  }

  static conflict(message: string): ApiError {
    return new ApiError(message, 409);
  }

  static badRequest(message: string): ApiError {
    return new ApiError(message, 400);
  }

  static unauthorized(message: string): ApiError {
    return new ApiError(message, 401);
  }

  static internalServerError(message: string): ApiError {
    return new ApiError(message, 500);
  }

  static invalidData(message: string): ApiError {
    return new ApiError(message, 400);
  }

  static notFound(message: string): ApiError {
    return new ApiError(message, 404);
  }

  static mongoError(error: Error, message?: string): ApiError {
    const errorMessage = message || 'Database error';
    const details = error.message;
    return new ApiError(`${errorMessage}: ${details}`, 500, details);
  }

  static serializationError(error: Error): ApiError {
    const details = error.message;
    return new ApiError('Invalid data format', 400, details);
  }

  static deserializationError(error: Error): ApiError {
    const details = error.message;
    return new ApiError('Invalid data format', 400, details);
  }
}

export interface ApiErrorResponse {
  error: string;
  code: number;
  details?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiErrorResponse;
}

export function successResponse<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data: data
  }
}

export function errorResponse(apiError: ApiError): ApiResponse<never> {
  return {
    success: false,
    error: {
      error: apiError.message,
      code: apiError.getStatus(),
      details: apiError.details
    }
  }
}

export const createErrorResponses = {
  conflict: (message: string): ApiError => new ApiError(message, 409),
  badRequest: (message: string): ApiError => new ApiError(message, 400),
  unauthorized: (message: string): ApiError => new ApiError(message, 401),
  notFound: (message: string): ApiError => new ApiError(message, 404),
  internalServerError: (message: string): ApiError => new ApiError(message, 500),
  invalidData: (message: string): ApiError => new ApiError(message, 400),
};