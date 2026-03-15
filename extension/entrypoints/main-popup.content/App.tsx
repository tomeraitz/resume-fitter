import { useState, useEffect } from 'react';
import { useUserProfile } from './hooks/useUserProfile';
import { useExtractJob } from './hooks/useExtractJob';
import { useJobPageDetection } from './hooks/useJobPageDetection';
import { MainPopup } from './components/MainPopup';
import { InitialPanel } from './components/InitialPanel';
import { ProfilePanel } from './components/ProfilePanel';
import { ExtractLoadingPanel } from './components/ExtractLoadingPanel';
import { ExtractFinishedPanel } from './components/ExtractFinishedPanel';
import type { PopupStatus } from './components/MainPopup';

export type AppView = 'initial' | 'profile' | 'extracting' | 'extract-done';

export function derivePopupStatus(
  hasProfile: boolean,
  isLoading: boolean,
  view: AppView,
): PopupStatus {
  if (isLoading) return 'connected';
  if (view === 'extracting') return 'extracting';
  if (view === 'extract-done') return 'ready';
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

  const [view, setView] = useState<AppView>('initial');

  const hasProfile =
    profile !== null &&
    profile.cvTemplate.trim() !== '' &&
    profile.professionalHistory.trim() !== '';

  const popupStatus = derivePopupStatus(hasProfile, isLoading, view);

  useEffect(() => {
    if (view === 'extracting' && !isExtracting && extractedJob) {
      setView('extract-done');
    }
    if (view === 'extracting' && !isExtracting && extractError) {
      setView('initial');
    }
  }, [view, isExtracting, extractedJob, extractError]);

  const handleExtractJob = () => {
    if (!isJobPage) return;
    startExtraction();
    setView('extracting');
  };

  const handleCancelExtraction = () => {
    cancelExtraction();
    setView('initial');
  };

  const handleFitCv = () => {
    if (!extractedJob) return;
    browser.runtime.sendMessage({
      type: 'run-pipeline',
      jobDescription: extractedJob.description,
      jobTitle: extractedJob.title,
      jobCompany: extractedJob.company,
    });
    // TODO: transition to pipeline progress view (future)
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
    browser.runtime.sendMessage({ type: 'close-popup' });
  };

  return (
    <MainPopup status={popupStatus} onClose={handleClose}>
      {view === 'initial' && (
        <InitialPanel
          hasProfile={hasProfile}
          isLoading={isLoading}
          isJobPage={isJobPage}
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
      {view === 'extract-done' && extractedJob && (
        <ExtractFinishedPanel
          job={extractedJob}
          onFitCv={handleFitCv}
          onExtractAgain={handleExtractAgain}
        />
      )}
    </MainPopup>
  );
}
