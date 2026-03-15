import { renderHook, act, waitFor } from '@testing-library/react';
import { useExtractJob } from './useExtractJob';
import type { ExtractJobResponse } from '@/types/messages';
import type { ExtractedJobDetails } from '@/types/extract';

// -- Mock the WXT `browser` global used by the hook --
const sendMessageMock = vi.fn();

vi.stubGlobal('browser', {
  runtime: { sendMessage: sendMessageMock },
});

// -- Helpers --

const fakeJob: ExtractedJobDetails = {
  title: 'Engineer',
  company: 'Acme',
  description: 'A job',
  location: 'NYC',
  skills: ['React'],
};

function setPageHTML(html: string) {
  Object.defineProperty(document.documentElement, 'outerHTML', {
    value: html,
    configurable: true,
  });
}

/** Creates a deferred promise so the test controls when sendMessage resolves. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Triggers startExtraction and waits for the full async flow to complete.
 *
 * The hook uses `await new Promise(r => setTimeout(r, 0))` internally as a
 * yield, so we need fake timers to advance past it, then flush microtasks
 * so the sendMessage promise settles and state updates propagate.
 */
async function runExtraction(result: { current: ReturnType<typeof useExtractJob> }) {
  // 1. Fire startExtraction (sync — schedules the setTimeout)
  act(() => {
    result.current.startExtraction();
  });

  // 2. Advance past the setTimeout(r, 0) yield
  await act(async () => {
    vi.advanceTimersByTime(0);
  });
}

// -- Tests --

describe('useExtractJob', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sendMessageMock.mockReset();
    setPageHTML('<html><body>Hello</body></html>');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets extractedJob on success response', async () => {
    const response: ExtractJobResponse = { success: true, job: fakeJob };
    sendMessageMock.mockResolvedValue(response);

    const { result } = renderHook(() => useExtractJob());

    await runExtraction(result);

    expect(result.current.extractedJob).toEqual(fakeJob);
    expect(result.current.isExtracting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets not-a-job error when notJobPage is true', async () => {
    const response: ExtractJobResponse = {
      success: false,
      error: 'Not a job page',
      notJobPage: true,
    };
    sendMessageMock.mockResolvedValue(response);

    const { result } = renderHook(() => useExtractJob());

    await runExtraction(result);

    expect(result.current.error).toMatch(/doesn't appear to be a job posting/i);
    expect(result.current.extractedJob).toBeNull();
    expect(result.current.isExtracting).toBe(false);
  });

  it('sets error message on network failure', async () => {
    sendMessageMock.mockRejectedValue(new Error('Cannot reach server'));

    const { result } = renderHook(() => useExtractJob());

    await runExtraction(result);

    expect(result.current.error).toBe('Cannot reach server');
    expect(result.current.extractedJob).toBeNull();
    expect(result.current.isExtracting).toBe(false);
  });

  it('falls back to generic error for non-Error throws', async () => {
    sendMessageMock.mockRejectedValue('some string');

    const { result } = renderHook(() => useExtractJob());

    await runExtraction(result);

    expect(result.current.error).toBe('Extraction failed');
  });

  it('cancellation prevents late response from updating state', async () => {
    const d = deferred<ExtractJobResponse>();
    sendMessageMock.mockReturnValue(d.promise);

    const { result } = renderHook(() => useExtractJob());

    // Start extraction and advance past the yield
    act(() => {
      result.current.startExtraction();
    });
    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    // Cancel before sendMessage resolves
    act(() => {
      result.current.cancelExtraction();
    });

    expect(result.current.isExtracting).toBe(false);

    // Now resolve the deferred — should NOT update state
    await act(async () => {
      d.resolve({ success: true, job: fakeJob });
    });

    expect(result.current.extractedJob).toBeNull();
    expect(result.current.isExtracting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('truncates HTML to 500,000 chars before sending', async () => {
    const longHTML = 'x'.repeat(600_000);
    setPageHTML(longHTML);
    sendMessageMock.mockResolvedValue({ success: true, job: fakeJob });

    const { result } = renderHook(() => useExtractJob());

    await runExtraction(result);

    expect(sendMessageMock).toHaveBeenCalledOnce();
    const sentMessage = sendMessageMock.mock.calls[0][0];
    expect(sentMessage.type).toBe('extract-job');
    expect(sentMessage.html.length).toBeLessThanOrEqual(500_000);
  });

  it('strips script, style, and svg tags from HTML', async () => {
    const html =
      '<html><head><style>body{}</style></head><body>' +
      '<script>alert(1)</script><svg><path/></svg><p>Job info</p></body></html>';
    setPageHTML(html);
    sendMessageMock.mockResolvedValue({ success: true, job: fakeJob });

    const { result } = renderHook(() => useExtractJob());

    await runExtraction(result);

    expect(sendMessageMock).toHaveBeenCalledOnce();
    const sentHTML: string = sendMessageMock.mock.calls[0][0].html;
    expect(sentHTML).not.toContain('<script');
    expect(sentHTML).not.toContain('<style');
    expect(sentHTML).not.toContain('<svg');
    expect(sentHTML).toContain('Job info');
  });

  it('does not update state after unmount', async () => {
    const d = deferred<ExtractJobResponse>();
    sendMessageMock.mockReturnValue(d.promise);

    const { result, unmount } = renderHook(() => useExtractJob());

    // Start extraction and advance past the yield
    act(() => {
      result.current.startExtraction();
    });
    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    // Unmount while sendMessage is still pending
    unmount();

    // Resolve after unmount — should not throw or warn
    await act(async () => {
      d.resolve({ success: true, job: fakeJob });
    });
  });

  it('sends message with type extract-job', async () => {
    sendMessageMock.mockResolvedValue({ success: true, job: fakeJob });

    const { result } = renderHook(() => useExtractJob());

    await runExtraction(result);

    expect(sendMessageMock).toHaveBeenCalledOnce();
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'extract-job', html: expect.any(String) }),
    );
  });

  it('sets error from response.error on generic failure', async () => {
    const response: ExtractJobResponse = {
      success: false,
      error: 'Server overloaded',
    };
    sendMessageMock.mockResolvedValue(response);

    const { result } = renderHook(() => useExtractJob());

    await runExtraction(result);

    expect(result.current.error).toBe('Server overloaded');
    expect(result.current.extractedJob).toBeNull();
  });

  it('resetExtraction clears job and error', async () => {
    sendMessageMock.mockResolvedValue({ success: true, job: fakeJob });

    const { result } = renderHook(() => useExtractJob());

    await runExtraction(result);

    expect(result.current.extractedJob).toEqual(fakeJob);

    act(() => {
      result.current.resetExtraction();
    });

    expect(result.current.extractedJob).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
