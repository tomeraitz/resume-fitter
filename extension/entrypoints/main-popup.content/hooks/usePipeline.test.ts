import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { PipelineSession, StepsRecord } from '../../../types/pipeline';

const EMPTY_STEPS: StepsRecord = {
  'hiring-manager': { step: 'hiring-manager', status: 'pending' },
  'rewrite-resume': { step: 'rewrite-resume', status: 'pending' },
  'ats-scanner': { step: 'ats-scanner', status: 'pending' },
  'verifier': { step: 'verifier', status: 'pending' },
};

const EMPTY_SESSION: PipelineSession = {
  status: 'idle',
  jobDescription: '',
  steps: EMPTY_STEPS,
  generatedCv: null,
};

// ---- Mocks ----

const mockCancel = vi.fn();
const mockSession = vi.fn<() => PipelineSession | null>(() => null);

vi.mock('./usePipelineSession', () => ({
  usePipelineSession: () => ({
    session: mockSession(),
    isLoading: false,
    cancel: mockCancel,
    download: vi.fn(),
  }),
}));

// Mock the storage barrel to avoid WXT storage SDK init (needs browser.runtime at import time)
vi.mock('../../../services/storage', () => ({
  EMPTY_SESSION: {
    status: 'idle',
    jobDescription: '',
    steps: {
      'hiring-manager': { step: 'hiring-manager', status: 'pending' },
      'rewrite-resume': { step: 'rewrite-resume', status: 'pending' },
      'ats-scanner': { step: 'ats-scanner', status: 'pending' },
      'verifier': { step: 'verifier', status: 'pending' },
    },
    generatedCv: null,
  },
}));

// WXT auto-imports `browser` as a global; stub `runtime.sendMessage`
const mockSendMessage = vi.fn();
vi.stubGlobal('browser', { runtime: { sendMessage: mockSendMessage } });

// Must import AFTER mocks are declared
const { usePipeline } = await import('./usePipeline');

// ---- Helpers ----

function makeSession(overrides: Partial<PipelineSession>): PipelineSession {
  return { ...EMPTY_SESSION, ...overrides };
}

function withStepStatus(
  statuses: Record<string, 'pending' | 'running' | 'completed' | 'error'>,
): StepsRecord {
  const steps = structuredClone(EMPTY_STEPS);
  for (const [name, status] of Object.entries(statuses)) {
    steps[name as keyof StepsRecord].status = status;
  }
  return steps;
}

// ---- Tests ----

describe('usePipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.mockReturnValue(null);
  });

  it('returns idle status and null results initially', () => {
    const { result } = renderHook(() => usePipeline());

    expect(result.current.status).toBe('idle');
    expect(result.current.results).toBeNull();
    expect(result.current.currentStepNumber).toBe(0);
    expect(result.current.error).toBeNull();
  });

  it('sends run-pipeline message via browser.runtime.sendMessage on start', () => {
    const { result } = renderHook(() => usePipeline());

    act(() => {
      result.current.start('Job desc', 'Engineer', 'Acme');
    });

    expect(mockSendMessage).toHaveBeenCalledWith({
      type: 'run-pipeline',
      jobDescription: 'Job desc',
      jobTitle: 'Engineer',
      jobCompany: 'Acme',
    });
  });

  it('does not send message when pipeline is already running', () => {
    mockSession.mockReturnValue(
      makeSession({ status: 'running', steps: withStepStatus({ 'hiring-manager': 'running' }) }),
    );

    const { result } = renderHook(() => usePipeline());

    act(() => {
      result.current.start('duplicate call');
    });

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'step 1 running',
      statuses: { 'hiring-manager': 'running' },
      expected: 1,
    },
    {
      label: 'step 1 done, step 2 running',
      statuses: { 'hiring-manager': 'completed', 'rewrite-resume': 'running' },
      expected: 2,
    },
    {
      label: 'steps 1-2 done, step 3 running',
      statuses: {
        'hiring-manager': 'completed',
        'rewrite-resume': 'completed',
        'ats-scanner': 'running',
      },
      expected: 3,
    },
    {
      label: 'steps 1-3 done, step 4 running',
      statuses: {
        'hiring-manager': 'completed',
        'rewrite-resume': 'completed',
        'ats-scanner': 'completed',
        'verifier': 'running',
      },
      expected: 4,
    },
  ])('currentStepNumber is $expected when $label', ({ statuses, expected }) => {
    mockSession.mockReturnValue(
      makeSession({ status: 'running', steps: withStepStatus(statuses) }),
    );

    const { result } = renderHook(() => usePipeline());
    expect(result.current.currentStepNumber).toBe(expected);
  });

  it('assembles results correctly when all steps are completed', () => {
    const steps = withStepStatus({
      'hiring-manager': 'completed',
      'rewrite-resume': 'completed',
      'ats-scanner': 'completed',
      'verifier': 'completed',
    });
    steps['hiring-manager'].data = {
      step: 'hiring-manager',
      matchScore: 85,
      missingKeywords: [],
      summary: 'Good match',
      cvLanguage: 'en',
    };
    steps['rewrite-resume'].data = {
      step: 'rewrite-resume',
      updatedCvHtml: '<p>CV</p>',
      keywordsNotAdded: [],
    };
    steps['ats-scanner'].data = {
      step: 'ats-scanner',
      atsScore: 92,
      problemAreas: [],
    };
    steps['verifier'].data = {
      step: 'verifier',
      verifiedCv: '<p>CV</p>',
      flaggedClaims: ['Claim A'],
    };

    mockSession.mockReturnValue(
      makeSession({ status: 'completed', steps, generatedCv: '<p>Final CV</p>' }),
    );

    const { result } = renderHook(() => usePipeline());

    expect(result.current.results).toEqual({
      matchScore: 85,
      atsScore: 92,
      flaggedClaims: ['Claim A'],
      finalCv: '<p>Final CV</p>',
    });
  });

  it('returns null results when only some steps are completed', () => {
    const steps = withStepStatus({
      'hiring-manager': 'completed',
      'rewrite-resume': 'completed',
      'ats-scanner': 'running',
    });
    steps['hiring-manager'].data = {
      step: 'hiring-manager',
      matchScore: 85,
      missingKeywords: [],
      summary: 'Good match',
      cvLanguage: 'en',
    };

    mockSession.mockReturnValue(
      makeSession({ status: 'running', steps, generatedCv: null }),
    );

    const { result } = renderHook(() => usePipeline());
    expect(result.current.results).toBeNull();
  });

  it('calls clearPipelineSession on cancel', () => {
    const { result } = renderHook(() => usePipeline());

    act(() => {
      result.current.cancel();
    });

    expect(mockCancel).toHaveBeenCalledOnce();
  });

  it('populates error when pipeline status is error', () => {
    const steps = withStepStatus({
      'hiring-manager': 'completed',
      'rewrite-resume': 'error',
    });
    steps['rewrite-resume'].error = 'LLM rate limit exceeded';

    mockSession.mockReturnValue(makeSession({ status: 'error', steps }));

    const { result } = renderHook(() => usePipeline());

    expect(result.current.error).toBe('LLM rate limit exceeded');
    expect(result.current.status).toBe('error');
  });

  it('returns fallback error message when no step has an error string', () => {
    mockSession.mockReturnValue(makeSession({ status: 'error' }));

    const { result } = renderHook(() => usePipeline());
    expect(result.current.error).toBe('Pipeline failed unexpectedly.');
  });
});
