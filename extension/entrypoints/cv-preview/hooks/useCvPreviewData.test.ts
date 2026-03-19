import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCvPreviewData } from './useCvPreviewData';
import type { PipelineSession } from '../../../types/pipeline';

vi.mock('../../../services/storage', () => {
  const completedSession: PipelineSession = {
    status: 'completed',
    extractionStatus: 'done',
    jobDescription: 'Test JD',
    jobTitle: 'Senior Engineer',
    jobCompany: 'Acme',
    generatedCv: '<html><body>CV</body></html>',
    steps: {
      'hiring-manager': {
        step: 'hiring-manager',
        status: 'completed',
        data: {
          step: 'hiring-manager',
          matchScore: 92,
          missingKeywords: [],
          summary: 'Good match',
          cvLanguage: 'en',
        },
      },
      'rewrite-resume': {
        step: 'rewrite-resume',
        status: 'completed',
        data: {
          step: 'rewrite-resume',
          updatedCvHtml: '<html>updated</html>',
          keywordsNotAdded: [],
        },
      },
      'ats-scanner': {
        step: 'ats-scanner',
        status: 'completed',
        data: {
          step: 'ats-scanner',
          atsScore: 87,
          problemAreas: [],
          updatedCvHtml: '<html>ats</html>',
        },
      },
      'verifier': {
        step: 'verifier',
        status: 'completed',
        data: {
          step: 'verifier',
          verifiedCv: '<html>verified</html>',
          flaggedClaims: [],
        },
      },
    },
  };

  let currentSession = { ...completedSession };
  let watchers: Array<(val: PipelineSession) => void> = [];

  return {
    pipelineSession: {
      getValue: vi.fn(() => Promise.resolve(currentSession)),
      watch: vi.fn((cb: (val: PipelineSession) => void) => {
        watchers.push(cb);
        return () => {
          watchers = watchers.filter((w) => w !== cb);
        };
      }),
      setValue: vi.fn(async (val: PipelineSession) => {
        currentSession = val;
        watchers.forEach((w) => w(val));
      }),
    },
    EMPTY_SESSION: {
      status: 'idle',
      extractionStatus: 'idle',
      jobDescription: '',
      steps: {
        'hiring-manager': { step: 'hiring-manager', status: 'pending' },
        'rewrite-resume': { step: 'rewrite-resume', status: 'pending' },
        'ats-scanner': { step: 'ats-scanner', status: 'pending' },
        'verifier': { step: 'verifier', status: 'pending' },
      },
      extractedJob: undefined,
      generatedCv: null,
    },
  };
});

describe('useCvPreviewData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns loading initially then ready with data', async () => {
    const { result } = renderHook(() => useCvPreviewData());
    expect(result.current.status).toBe('loading');

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    if (result.current.status === 'ready') {
      expect(result.current.data.jobTitle).toBe('Senior Engineer');
      expect(result.current.data.atsScore).toBe(87);
      expect(result.current.data.matchScore).toBe(92);
      expect(result.current.data.finalCv).toContain('<html>');
    }
  });
});
