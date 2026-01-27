/**
 * Unit tests for Authentication Middleware
 * Tests cover:
 * 1. Public route access
 * 2. Protected route redirects
 * 3. Authenticated user access
 * 4. Callback URL preservation
 */

import { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Mock next-auth/jwt
jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn(),
}));

// Mock NextResponse
const mockNext = jest.fn(() => ({ type: 'next' }));
const mockRedirect = jest.fn((url: URL) => ({ type: 'redirect', url: url.toString() }));

jest.mock('next/server', () => ({
  NextResponse: {
    next: mockNext,
    redirect: mockRedirect,
  },
}));

// Import middleware after mocks
import { middleware } from '../middleware';

describe('Authentication Middleware', () => {
  const mockGetToken = getToken as jest.MockedFunction<typeof getToken>;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.REFLEXION_JWT_SECRET = 'test-secret';
  });

  afterEach(() => {
    delete process.env.REFLEXION_JWT_SECRET;
  });

  describe('Public Routes', () => {
    it('should allow access to /api/auth routes', async () => {
      const request = new NextRequest(new URL('https://example.com/api/auth/signin'));
      mockGetToken.mockResolvedValue(null);

      const response = await middleware(request);

      expect(mockGetToken).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow access to /api/health', async () => {
      const request = new NextRequest(new URL('https://example.com/api/health'));
      mockGetToken.mockResolvedValue(null);

      const response = await middleware(request);

      expect(mockGetToken).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow access to /api/info', async () => {
      const request = new NextRequest(new URL('https://example.com/api/info'));
      mockGetToken.mockResolvedValue(null);

      const response = await middleware(request);

      expect(mockGetToken).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow access to /api/langsmith-config', async () => {
      const request = new NextRequest(new URL('https://example.com/api/langsmith-config'));
      mockGetToken.mockResolvedValue(null);

      const response = await middleware(request);

      expect(mockGetToken).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow access to /_next routes', async () => {
      const request = new NextRequest(new URL('https://example.com/_next/static/chunk.js'));
      mockGetToken.mockResolvedValue(null);

      const response = await middleware(request);

      expect(mockGetToken).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow access to static assets', async () => {
      const request = new NextRequest(new URL('https://example.com/favicon.ico'));
      mockGetToken.mockResolvedValue(null);

      const response = await middleware(request);

      expect(mockGetToken).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Unauthenticated Access', () => {
    it('should allow access to root path', async () => {
      const request = new NextRequest(new URL('https://example.com/'));
      mockGetToken.mockResolvedValue(null);

      const response = await middleware(request);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow access to /login path', async () => {
      const request = new NextRequest(new URL('https://example.com/login'));
      mockGetToken.mockResolvedValue(null);

      const response = await middleware(request);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should redirect unauthenticated users from protected routes', async () => {
      const request = new NextRequest(new URL('https://example.com/workbench/map'));
      mockGetToken.mockResolvedValue(null);

      const response = await middleware(request);

      expect(mockGetToken).toHaveBeenCalledWith({
        req: request,
        secret: 'test-secret',
      });
      expect(mockRedirect).toHaveBeenCalled();
      
      const redirectCall = mockRedirect.mock.calls[0][0];
      expect(redirectCall.toString()).toContain('/');
      expect(redirectCall.searchParams.get('callbackUrl')).toBe('/workbench/map');
    });

    it('should preserve callback URL in redirect', async () => {
      const request = new NextRequest(new URL('https://example.com/workbench/settings'));
      mockGetToken.mockResolvedValue(null);

      const response = await middleware(request);

      const redirectCall = mockRedirect.mock.calls[0][0];
      expect(redirectCall.searchParams.get('callbackUrl')).toBe('/workbench/settings');
    });
  });

  describe('Authenticated Access', () => {
    const mockToken = {
      email: 'test@example.com',
      name: 'Test User',
    };

    it('should allow authenticated users to access protected routes', async () => {
      const request = new NextRequest(new URL('https://example.com/workbench/map'));
      mockGetToken.mockResolvedValue(mockToken as any);

      const response = await middleware(request);

      expect(mockGetToken).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should redirect authenticated users from root to workbench', async () => {
      const request = new NextRequest(new URL('https://example.com/'));
      mockGetToken.mockResolvedValue(mockToken as any);

      const response = await middleware(request);

      expect(mockRedirect).toHaveBeenCalled();
      const redirectCall = mockRedirect.mock.calls[0][0];
      expect(redirectCall.toString()).toContain('/workbench/map');
    });

    it('should allow authenticated users to access workbench routes', async () => {
      const request = new NextRequest(new URL('https://example.com/workbench/discovery'));
      mockGetToken.mockResolvedValue(mockToken as any);

      const response = await middleware(request);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow authenticated users to access API routes', async () => {
      const request = new NextRequest(new URL('https://example.com/api/projects'));
      mockGetToken.mockResolvedValue(mockToken as any);

      const response = await middleware(request);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Environment Variables', () => {
    it('should use REFLEXION_JWT_SECRET when available', async () => {
      process.env.REFLEXION_JWT_SECRET = 'custom-secret';
      const request = new NextRequest(new URL('https://example.com/workbench/map'));
      mockGetToken.mockResolvedValue(null);

      await middleware(request);

      expect(mockGetToken).toHaveBeenCalledWith({
        req: request,
        secret: 'custom-secret',
      });
    });

    it('should fallback to NEXTAUTH_SECRET when REFLEXION_JWT_SECRET is not set', async () => {
      delete process.env.REFLEXION_JWT_SECRET;
      process.env.NEXTAUTH_SECRET = 'fallback-secret';
      const request = new NextRequest(new URL('https://example.com/workbench/map'));
      mockGetToken.mockResolvedValue(null);

      await middleware(request);

      expect(mockGetToken).toHaveBeenCalledWith({
        req: request,
        secret: 'fallback-secret',
      });
    });
  });
});
