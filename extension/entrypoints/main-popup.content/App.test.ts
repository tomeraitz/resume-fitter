import { describe, it, expect, vi } from 'vitest';

// Mock the storage service barrel to prevent WXT storage.defineItem from running
vi.mock('../../services/storage', () => ({
  userProfile: {
    getValue: vi.fn().mockResolvedValue(null),
    watch: vi.fn().mockResolvedValue(() => {}),
  },
  pipelineSession: {
    getValue: vi.fn().mockResolvedValue(null),
    watch: vi.fn().mockResolvedValue(() => {}),
  },
}));

// Mock hooks that use the storage service
vi.mock('./hooks/useUserProfile', () => ({
  useUserProfile: () => ({ profile: null, isLoading: true }),
}));

vi.mock('./hooks/useExtractJob', () => ({
  useExtractJob: () => ({
    extractedJob: null,
    isExtracting: false,
    error: null,
    startExtraction: vi.fn(),
    cancelExtraction: vi.fn(),
    resetExtraction: vi.fn(),
  }),
}));

vi.mock('./hooks/useJobPageDetection', () => ({
  useJobPageDetection: () => ({ isJobPage: false }),
}));

// Stub browser global for any remaining references (e.g. browser.runtime.sendMessage in App)
vi.stubGlobal('browser', {
  runtime: {
    getManifest: () => ({ version: '0.1.0' }),
    sendMessage: vi.fn(),
  },
});

const { derivePopupStatus } = await import('./App');

describe('derivePopupStatus', () => {
  it('returns "connected" when isLoading is true', () => {
    expect(derivePopupStatus(false, true, 'initial')).toBe('connected');
  });

  it('returns "extracting" when view is "extracting"', () => {
    expect(derivePopupStatus(true, false, 'extracting')).toBe('extracting');
  });

  it('returns "ready" when view is "extract-done"', () => {
    expect(derivePopupStatus(true, false, 'extract-done')).toBe('ready');
  });

  it('returns "complete" when view is "profile" and hasProfile is true', () => {
    expect(derivePopupStatus(true, false, 'profile')).toBe('complete');
  });

  it('returns "incomplete" when view is "profile" and hasProfile is false', () => {
    expect(derivePopupStatus(false, false, 'profile')).toBe('incomplete');
  });

  it('returns "connected" when view is "initial" and hasProfile is true', () => {
    expect(derivePopupStatus(true, false, 'initial')).toBe('connected');
  });

  it('returns "incomplete" when view is "initial" and hasProfile is false', () => {
    expect(derivePopupStatus(false, false, 'initial')).toBe('incomplete');
  });

  it('returns "pipeline" when view is "pipeline"', () => {
    expect(derivePopupStatus(true, false, 'pipeline')).toBe('pipeline');
  });

  it('returns "pipeline-done" when view is "pipeline-done"', () => {
    expect(derivePopupStatus(true, false, 'pipeline-done')).toBe('pipeline-done');
  });
});
