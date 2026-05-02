/**
 * Centralized API utilities for standardized responses, error handling,
 * validation, pagination, and common query parameter parsing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodSchema, ZodError } from 'zod';
import {
  DATE_REGEX,
  paginationSchema,
} from './validators/common';

// ─── Standardized Response Helpers ────────────────────────────────────────────

/** Success response with standard format */
export function apiSuccess<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(
    { success: true, data, timestamp: new Date().toISOString() },
    { status }
  );
}

/** Error response with standard format */
export function apiError(
  message: string,
  status = 500,
  code?: string
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: message,
      ...(code ? { code } : {}),
      timestamp: new Date().toISOString(),
    },
    { status }
  );
}

/** Paginated response with standard format */
export function apiPaginated<T>(
  data: T[],
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
): NextResponse {
  return NextResponse.json({
    success: true,
    data,
    pagination,
    timestamp: new Date().toISOString(),
  });
}

// ─── Custom Error Class ───────────────────────────────────────────────────────

export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(message: string, status = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

// Common error factory helpers
export const NotFoundError = (message: string) =>
  new AppError(message, 404, 'NOT_FOUND');

export const ValidationError = (message: string) =>
  new AppError(message, 400, 'VALIDATION_ERROR');

export const UnauthorizedError = (message = '未授权访问') =>
  new AppError(message, 401, 'UNAUTHORIZED');

export const ForbiddenError = (message = '禁止访问') =>
  new AppError(message, 403, 'FORBIDDEN');

export const ConflictError = (message: string) =>
  new AppError(message, 409, 'CONFLICT');

// ─── Error Handler Wrapper ────────────────────────────────────────────────────

type ApiHandler = (
  request: NextRequest,
  context?: unknown
) => Promise<NextResponse>;

/** Wraps an API route handler with try/catch, returns standardized 500 error */
export function withErrorHandler(handler: ApiHandler): ApiHandler {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof AppError) {
        return apiError(error.message, error.status, error.code);
      }
      if (error instanceof ZodError) {
        const messages = error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ');
        return apiError(messages, 400, 'VALIDATION_ERROR');
      }
      // Unexpected error
      if (process.env.NODE_ENV === 'development') console.error('API Error:', error);
      return apiError(
        error instanceof Error ? error.message : '服务器内部错误',
        500,
        'INTERNAL_ERROR'
      );
    }
  };
}

// ─── Validation Helpers ───────────────────────────────────────────────────────

interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: NextResponse;
}

/** Validates data against a Zod schema, returns typed result */
export function validateRequest<T>(schema: ZodSchema<T>, data: unknown): ValidationResult<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const messages = result.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  return {
    success: false,
    error: apiError(messages, 400, 'VALIDATION_ERROR'),
  };
}

/** Extracts and validates URL search params against a Zod schema */
export async function validateQuery<T>(
  schema: ZodSchema<T>,
  request: NextRequest
): Promise<ValidationResult<T>> {
  const { searchParams } = new URL(request.url);
  const paramsObj: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    paramsObj[key] = value;
  });
  return validateRequest(schema, paramsObj);
}

/** Parses and validates request body against a Zod schema */
export async function validateBody<T>(
  schema: ZodSchema<T>,
  request: NextRequest
): Promise<ValidationResult<T>> {
  try {
    const body = await request.json();
    return validateRequest(schema, body);
  } catch {
    return {
      success: false,
      error: apiError('请求体格式无效', 400, 'INVALID_BODY'),
    };
  }
}

// ─── Pagination Helpers ───────────────────────────────────────────────────────

/** Paginate an array of items */
export function paginate<T>(
  items: T[],
  { page, pageSize }: { page: number; pageSize: number }
): { data: T[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } } {
  const total = items.length;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const start = (page - 1) * pageSize;
  const data = items.slice(start, start + pageSize);
  return { data, pagination: { page, pageSize, total, totalPages } };
}

/** Extract page/pageSize from URL search params with defaults */
export function parsePagination(searchParams: URLSearchParams): {
  page: number;
  pageSize: number;
} {
  const result = paginationSchema.safeParse({
    page: searchParams.get('page') || '1',
    pageSize: searchParams.get('pageSize') || '20',
  });
  if (result.success) {
    return { page: result.data.page, pageSize: result.data.pageSize };
  }
  return { page: 1, pageSize: 20 };
}

// ─── Common Query Helpers ─────────────────────────────────────────────────────

/** Extract and validate startDate/endDate from URL search params */
export function parseDateRange(searchParams: URLSearchParams): {
  startDate?: string;
  endDate?: string;
  error?: NextResponse;
} {
  const startDate = searchParams.get('startDate') || undefined;
  const endDate = searchParams.get('endDate') || undefined;

  if (startDate && !DATE_REGEX.test(startDate)) {
    return {
      error: apiError('startDate 格式无效，需要 YYYY-MM-DD', 400, 'INVALID_DATE'),
    };
  }
  if (endDate && !DATE_REGEX.test(endDate)) {
    return {
      error: apiError('endDate 格式无效，需要 YYYY-MM-DD', 400, 'INVALID_DATE'),
    };
  }

  // Validate date range logic: startDate should be <= endDate
  if (startDate && endDate && startDate > endDate) {
    return {
      error: apiError('startDate 不能大于 endDate', 400, 'INVALID_DATE_RANGE'),
    };
  }

  return { startDate, endDate };
}

/** Shared date regex for YYYY-MM-DD validation */
export { DATE_REGEX } from './validators/common';
