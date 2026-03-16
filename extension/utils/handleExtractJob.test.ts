import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExtractedJobDetails } from '../types/extract';
import type { ExtractJobResponse } from '../types/messages';

// Mock jose — SignJWT is used with `new`, so the mock must be constructible.
const mockSign = vi.hoisted(() => vi.fn().mockResolvedValue('mock-jwt-token'));

vi.mock('jose', () => {
  class MockSignJWT {
    setProtectedHeader() { return this; }
    setIssuedAt() { return this; }
    setExpirationTime() { return this; }
    sign = mockSign;
  }
  return { SignJWT: MockSignJWT };
});

// Vitest makes import.meta.env writable at test time
import.meta.env.WXT_SESSION_SECRET = 'test-secret-for-jwt-signing';
import.meta.env.WXT_SERVER_URL = 'http://localhost:3000';

import { handleExtractJob } from './handleExtractJob';

const validJob: ExtractedJobDetails = {
  title: 'Engineer',
  company: 'Acme',
  description: 'Build stuff',
  location: 'NYC',
  skills: ['React', 'Node.js'],
};

function makeFetchResponse(overrides: {
  ok?: boolean;
  status?: number;
  json?: () => Promise<unknown>;
}): Response {
  return {
    ok: overrides.ok ?? true,
    status: overrides.status ?? 200,
    json: overrides.json ?? (() => Promise.resolve({})),
  } as unknown as Response;
}

describe('handleExtractJob', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSign.mockResolvedValue('mock-jwt-token');
  });

  it('returns success with job details on 200 with valid data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeFetchResponse({ ok: true, status: 200, json: () => Promise.resolve(validJob) }),
    ));

    const result = await handleExtractJob('<html>job page</html>');

    expect(result).toEqual({ success: true, job: validJob });
  });

  it('returns notJobPage on 422 with reason', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeFetchResponse({
        ok: false,
        status: 422,
        json: () => Promise.resolve({ error: 'Not a job page', reason: 'No job details found' }),
      }),
    ));

    const result = await handleExtractJob('<html>not a job</html>');

    expect(result).toEqual({
      success: false,
      error: 'No job details found',
      notJobPage: true,
    });
  });

  it('returns authentication failed on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeFetchResponse({ ok: false, status: 401 }),
    ));

    const result = await handleExtractJob('<html>page</html>');

    expect(result).toEqual({ success: false, error: 'Authentication failed' });
  });

  it('returns server error on 502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeFetchResponse({ ok: false, status: 502 }),
    ));

    const result = await handleExtractJob('<html>page</html>');

    expect(result).toEqual({ success: false, error: 'Server error, try again' });
  });

  it('returns server error on 503', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeFetchResponse({ ok: false, status: 503 }),
    ));

    const result = await handleExtractJob('<html>page</html>');

    expect(result).toEqual({ success: false, error: 'Server error, try again' });
  });

  it('returns cannot reach server on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const result = await handleExtractJob('<html>page</html>');

    expect(result).toEqual({ success: false, error: 'Cannot reach server' });
  });

  it('returns unexpected response format on malformed 200 body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeFetchResponse({ ok: true, status: 200, json: () => Promise.resolve({ bad: 'data' }) }),
    ));

    const result = await handleExtractJob('<html>page</html>');

    expect(result).toEqual({ success: false, error: 'Unexpected response format' });
  });

  it('sends correct Authorization header and Content-Type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeFetchResponse({ ok: true, status: 200, json: () => Promise.resolve(validJob) }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await handleExtractJob('<html>job</html>');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/extract');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer mock-jwt-token',
    });
    expect(JSON.parse(init.body)).toEqual({ html: '<html>job</html>' });
  });
});
