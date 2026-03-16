import { SignJWT } from 'jose';
import { isExtractedJobDetails } from '../types/extract';
import type { ExtractJobResponse } from '../types/messages';

const MAX_HTML_LENGTH = 500_000;

async function signJwt(): Promise<string> {
  const secretString = import.meta.env.WXT_SESSION_SECRET;
  if (!secretString) {
    throw new Error('WXT_SESSION_SECRET is not configured');
  }
  const secret = new TextEncoder().encode(secretString);

  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secret);
}

function isExtractJobMessage(msg: unknown): msg is { type: 'extract-job'; html: string } {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return (
    m.type === 'extract-job' &&
    typeof m.html === 'string' &&
    m.html.length > 0 &&
    m.html.length <= MAX_HTML_LENGTH
  );
}

async function handleExtractJob(html: string): Promise<ExtractJobResponse> {
  try {
    const token = await signJwt();
    const url = `${import.meta.env.WXT_SERVER_URL}/extract`;

    console.log('[extract-job] POST', url);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ html }),
    });

    console.log('[extract-job] response status:', res.status);

    if (res.ok) {
      const body = await res.json();
      if (isExtractedJobDetails(body)) {
        return { success: true, job: body };
      }
      return { success: false, error: 'Unexpected response format' };
    }

    if (res.status === 422) {
      try {
        const body = await res.json();
        return {
          success: false,
          error: typeof body.reason === 'string' ? body.reason.slice(0, 200) : 'Not a job page',
          notJobPage: true,
        };
      } catch {
        return { success: false, error: 'Extraction failed', notJobPage: true };
      }
    }

    if (res.status === 401) {
      return { success: false, error: 'Authentication failed' };
    }

    if (res.status === 500 || res.status === 502 || res.status === 503) {
      return { success: false, error: 'Server error, try again' };
    }

    return { success: false, error: 'Extraction failed' };
  } catch (err) {
    console.error('[extract-job] network error:', err instanceof Error ? err.message : 'unknown');
    return { success: false, error: 'Cannot reach server' };
  }
}

export { handleExtractJob, isExtractJobMessage };
