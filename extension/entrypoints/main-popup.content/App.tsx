import { useUserProfile } from './hooks/useUserProfile';
import { MainPopup } from './components/MainPopup';
import { InitialPanel } from './components/InitialPanel';
import type { PopupStatus } from './components/MainPopup';

function derivePopupStatus(
  hasProfile: boolean,
  isLoading: boolean,
): PopupStatus {
  if (isLoading) return 'connected';
  return hasProfile ? 'connected' : 'incomplete';
}

export function App() {
  const { profile, isLoading } = useUserProfile();

  const hasProfile =
    profile !== null &&
    profile.cvTemplate.trim() !== '' &&
    profile.professionalHistory.trim() !== '';

  const popupStatus = derivePopupStatus(hasProfile, isLoading);

  const handleExtractJob = () => {
    // TODO: trigger job description extraction from current page
  };

  const handleEditProfile = () => {
    browser.runtime.sendMessage({ type: 'open-options-page' });
  };

  const handleClose = () => {
    // TODO: hide overlay UI
  };

  return (
    <MainPopup status={popupStatus} onClose={handleClose}>
      <InitialPanel
        hasProfile={hasProfile}
        isLoading={isLoading}
        onExtractJob={handleExtractJob}
        onEditProfile={handleEditProfile}
      />
    </MainPopup>
  );
}
