/**
 * Tests for workbench hydration route (Phase 1 route refactor).
 * /hydration redirects to /decisions; project configuration approval is handled from the Decisions panel.
 * @see docs/ROUTE_REFACTORING_PLAN.md
 */

import { redirect } from 'next/navigation';
import Page from '../page';

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

describe('WorkbenchHydrationRedirect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects to /decisions with no query', async () => {
    await Page({ searchParams: Promise.resolve({}) });
    expect(redirect).toHaveBeenCalledWith('/decisions');
  });

  it('redirects to /decisions preserving search params', async () => {
    await Page({
      searchParams: Promise.resolve({ threadId: 'test-123' }),
    });
    expect(redirect).toHaveBeenCalledWith('/decisions?threadId=test-123');
  });
});
