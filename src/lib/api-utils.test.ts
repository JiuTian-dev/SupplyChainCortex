import { describe, it, expect } from 'vitest';
import { apiSuccess, apiError, apiPaginated, paginate, parsePagination, AppError, NotFoundError, ValidationError, UnauthorizedError, ForbiddenError, ConflictError } from './api-utils';

describe('API Utils', () => {
  describe('apiSuccess', () => {
    it('returns standardized success response', () => {
      const response = apiSuccess({ foo: 'bar' });
      expect(response.status).toBe(200);
    });

    it('accepts custom status code', () => {
      const response = apiSuccess({ id: '1' }, 201);
      expect(response.status).toBe(201);
    });
  });

  describe('apiError', () => {
    it('returns standardized error response', () => {
      const response = apiError('Not found', 404, 'NOT_FOUND');
      expect(response.status).toBe(404);
    });

    it('defaults to 500 status', () => {
      const response = apiError('Server error');
      expect(response.status).toBe(500);
    });
  });

  describe('paginate', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ id: i, name: `Item ${i}` }));

    it('returns correct page of items', () => {
      const result = paginate(items, { page: 1, pageSize: 10 });
      expect(result.data).toHaveLength(10);
      expect(result.data[0].id).toBe(0);
    });

    it('returns correct pagination metadata', () => {
      const result = paginate(items, { page: 2, pageSize: 10 });
      expect(result.pagination.page).toBe(2);
      expect(result.pagination.pageSize).toBe(10);
      expect(result.pagination.total).toBe(50);
      expect(result.pagination.totalPages).toBe(5);
    });

    it('handles last page with fewer items', () => {
      const result = paginate(items, { page: 5, pageSize: 10 });
      expect(result.data).toHaveLength(10);
    });

    it('handles empty array', () => {
      const result = paginate([], { page: 1, pageSize: 10 });
      expect(result.data).toHaveLength(0);
      expect(result.pagination.totalPages).toBe(1);
    });

    it('handles page beyond range', () => {
      const result = paginate(items, { page: 10, pageSize: 10 });
      expect(result.data).toHaveLength(0);
    });
  });

  describe('parsePagination', () => {
    it('parses valid pagination params', () => {
      const params = new URLSearchParams('page=2&pageSize=50');
      const result = parsePagination(params);
      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(50);
    });

    it('uses defaults for missing params', () => {
      const params = new URLSearchParams();
      const result = parsePagination(params);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
    });
  });

  describe('Error factories', () => {
    it('NotFoundError creates 404 error', () => {
      const err = NotFoundError('Item not found');
      expect(err.status).toBe(404);
      expect(err.code).toBe('NOT_FOUND');
    });

    it('ValidationError creates 400 error', () => {
      const err = ValidationError('Invalid input');
      expect(err.status).toBe(400);
      expect(err.code).toBe('VALIDATION_ERROR');
    });

    it('UnauthorizedError creates 401 error', () => {
      const err = UnauthorizedError();
      expect(err.status).toBe(401);
      expect(err.code).toBe('UNAUTHORIZED');
    });

    it('ForbiddenError creates 403 error', () => {
      const err = ForbiddenError();
      expect(err.status).toBe(403);
      expect(err.code).toBe('FORBIDDEN');
    });

    it('ConflictError creates 409 error', () => {
      const err = ConflictError('Duplicate');
      expect(err.status).toBe(409);
      expect(err.code).toBe('CONFLICT');
    });
  });
});
