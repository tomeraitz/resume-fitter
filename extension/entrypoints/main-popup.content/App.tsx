import { useState } from 'react';
import { useUserProfile } from './hooks/useUserProfile';
import { MainPopup } from './components/MainPopup';
import { InitialPanel } from './components/InitialPanel';
import { ProfilePanel } from './components/ProfilePanel';
import type { PopupStatus } from './components/MainPopup';

type AppView = 'initial' | 'profile';

function derivePopupStatus(
  hasProfile: boolean,
  isLoading: boolean,
  view: AppView,
): PopupStatus {
  if (isLoading) return 'connected';
  if (view === 'profile') return hasProfile ? 'complete' : 'incomplete';
  return hasProfile ? 'connected' : 'incomplete';
}

export function App() {
  const { profile, isLoading } = useUserProfile();
  const [view, setView] = useState<AppView>('initial');

  const hasProfile =
    profile !== null &&
    profile.cvTemplate.trim() !== '' &&
    profile.professionalHistory.trim() !== '';

  const popupStatus = derivePopupStatus(hasProfile, isLoading, view);

  const handleExtractJob = () => {
    // TODO: trigger job description extraction from current page
  };

  const handleEditProfile = () => setView('profile');
  const handleCancelProfile = () => setView('initial');
  const handleSaveProfile = () => setView('initial');

  const handleClose = () => {
    browser.runtime.sendMessage({ type: 'close-popup' });
  };

  return (
    <MainPopup status={popupStatus} onClose={handleClose}>
      {view === 'initial' ? (
        <InitialPanel
          hasProfile={hasProfile}
          isLoading={isLoading}
          onExtractJob={handleExtractJob}
          onEditProfile={handleEditProfile}
        />
      ) : (
        <ProfilePanel
          profile={profile ?? { cvTemplate: '', professionalHistory: '' }}
          onSave={handleSaveProfile}
          onCancel={handleCancelProfile}
        />
      )}
    </MainPopup>
  );
}
