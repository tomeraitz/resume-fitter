import { useState, useEffect, useRef } from 'react';
import { useUserProfile } from './hooks/useUserProfile';
import { useExtractJob } from './hooks/useExtractJob';
import { useJobPageDetection } from './hooks/useJobPageDetection';
import { usePipeline } from './hooks/usePipeline';
import { MainPopup } from './components/MainPopup';
import { InitialPanel } from './components/InitialPanel';
import { ProfilePanel } from './components/ProfilePanel';
import { ExtractLoadingPanel } from './components/ExtractLoadingPanel';
import { ExtractFinishedPanel } from './components/ExtractFinishedPanel';
import { ProgressPanel } from './components/ProgressPanel';
import { PipelineCompletePanel } from './components/PipelineCompletePanel';
import type { PopupStatus } from './components/MainPopup';

export type AppView = 'initial' | 'profile' | 'extracting' | 'extract-done' | 'pipeline' | 'pipeline-done';

export function derivePopupStatus(
  hasProfile: boolean,
  isLoading: boolean,
  view: AppView,
): PopupStatus {
  if (isLoading) return 'connected';
  if (view === 'extracting') return 'extracting';
  if (view === 'extract-done') return 'ready';
  if (view === 'pipeline') return 'pipeline';
  if (view === 'pipeline-done') return 'pipeline-done';
  if (view === 'profile') return hasProfile ? 'complete' : 'incomplete';
  return hasProfile ? 'connected' : 'incomplete';
}

export function App() {
  const { profile, isLoading } = useUserProfile();
  const { isJobPage } = useJobPageDetection();
  const {
    extractedJob,
    isExtracting,
    error: extractError,
    startExtraction,
    cancelExtraction,
    resetExtraction,
  } = useExtractJob();

  const {
    steps,
    status: pipelineStatus,
    extractionStatus,
    currentStepNumber,
    results: pipelineResults,
    error: pipelineError,
    isSessionLoading,
    sessionExtractedJob,
    start: startPipeline,
    cancel: cancelPipeline,
  } = usePipeline();

  const [view, setView] = useState<AppView>('initial');
  const viewInitialized = useRef(false);

  // Restore view from persisted pipeline session on mount
  useEffect(() => {
    if (viewInitialized.current) return;
    if (isSessionLoading) return;

    if (pipelineStatus === 'running') {
      setView('pipeline');
    } else if (pipelineStatus === 'completed' && pipelineResults) {
      setView('pipeline-done');
    } else if (extractionStatus === 'extracting') {
      setView('extracting');
    } else if (sessionExtractedJob && pipelineStatus === 'idle') {
      setView('extract-done');
    }

    viewInitialized.current = true;
  }, [isSessionLoading, pipelineStatus, pipelineResults, extractionStatus, sessionExtractedJob]);

  // Use local extractedJob if available, fall back to persisted session value
  const effectiveExtractedJob = extractedJob ?? sessionExtractedJob ?? null;

  const hasProfile =
    profile !== null &&
    profile.cvTemplate.trim() !== '' &&
    profile.professionalHistory.trim() !== '';

  const popupStatus = derivePopupStatus(hasProfile, isLoading, view);

  // Extraction state transitions
  useEffect(() => {
    if (view === 'extracting' && extractionStatus === 'done' && effectiveExtractedJob) {
      setView('extract-done');
    }
    if (view === 'extracting' && extractionStatus === 'error') {
      setView('initial');
    }
  }, [view, extractionStatus, effectiveExtractedJob]);

  // Pipeline state transitions
  useEffect(() => {
    console.log('[App] Pipeline transition check — view:', view, 'pipelineStatus:', pipelineStatus, 'pipelineResults:', !!pipelineResults);
    if (view === 'pipeline' && pipelineStatus === 'completed' && pipelineResults) {
      console.log('[App] Transitioning to pipeline-done');
      setView('pipeline-done');
    }
    if (view === 'pipeline' && pipelineStatus === 'error') {
      console.log('[App] Pipeline errored, transitioning to initial');
      setView('initial');
    }
  }, [view, pipelineStatus, pipelineResults]);

  const handleExtractJob = () => {
    if (!isJobPage) return;
    startExtraction();
    setView('extracting');
  };

  const handleCancelExtraction = () => {
    cancelExtraction();
    browser.runtime.sendMessage({ type: 'cancel-extraction' }).catch(() => {});
    setView('initial');
  };

  const handleFitCv = () => {
    if (!effectiveExtractedJob) return;
    startPipeline(
      effectiveExtractedJob.description,
      effectiveExtractedJob.title,
      effectiveExtractedJob.company,
    );
    setView('pipeline');
  };

  const handleCancelPipeline = () => {
    cancelPipeline();
    setView('initial');
  };

  const handleReviewCv = () => {
    if (!pipelineResults?.finalCv) return;
    browser.runtime.sendMessage({ type: 'open-cv-preview' }).catch(() => {});
    browser.runtime.sendMessage({ type: 'close-popup' }).catch(() => {});
  };

  const handleExtractAgain = () => {
    resetExtraction();
    startExtraction();
    setView('extracting');
  };

  const handleEditProfile = () => setView('profile');
  const handleCancelProfile = () => setView('initial');
  const handleSaveProfile = () => setView('initial');

  const handleClose = () => {
    browser.runtime.sendMessage({ type: 'close-popup' }).catch(() => {});
  };

  return (
    <MainPopup
      status={popupStatus}
      pipelineStep={view === 'pipeline' ? currentStepNumber : undefined}
      onClose={handleClose}
    >
      {view === 'initial' && (
        <InitialPanel
          hasProfile={hasProfile}
          isLoading={isLoading}
          isJobPage={isJobPage}
          extractError={extractError}
          onExtractJob={handleExtractJob}
          onEditProfile={handleEditProfile}
        />
      )}
      {view === 'profile' && (
        <ProfilePanel
          profile={profile ?? { cvTemplate: '', professionalHistory: '' }}
          onSave={handleSaveProfile}
          onCancel={handleCancelProfile}
        />
      )}
      {view === 'extracting' && (
        <ExtractLoadingPanel onCancel={handleCancelExtraction} />
      )}
      {view === 'extract-done' && effectiveExtractedJob && (
        <ExtractFinishedPanel
          job={effectiveExtractedJob}
          onFitCv={handleFitCv}
          onExtractAgain={handleExtractAgain}
        />
      )}
      {view === 'pipeline' && (
        <ProgressPanel
          steps={steps}
          currentStepNumber={currentStepNumber}
          onCancel={handleCancelPipeline}
        />
      )}
      {view === 'pipeline-done' && pipelineResults && (
        <PipelineCompletePanel
          results={pipelineResults}
          onReviewCv={handleReviewCv}
          onCancel={handleCancelPipeline}
        />
      )}
    </MainPopup>
  );
}
