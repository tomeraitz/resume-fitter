import { userProfile, pipelineSession, EMPTY_SESSION, clearPipelineSession, setPipelineStatus } from '../services/storage';
import type { RunPipelineMessage } from '../types/messages';

function isRunPipelineMessage(msg: unknown): msg is RunPipelineMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return (
    m.type === 'run-pipeline' &&
    typeof m.jobDescription === 'string' &&
    m.jobDescription.length > 0 &&
    m.jobDescription.length <= 50_000 &&
    (m.jobTitle === undefined || typeof m.jobTitle === 'string') &&
    (m.jobCompany === undefined || typeof m.jobCompany === 'string')
  );
}

function isCancelMessage(msg: unknown): boolean {
  if (typeof msg !== 'object' || msg === null) return false;
  return (msg as Record<string, unknown>).type === 'cancel-pipeline';
}

export default defineBackground(() => {
  browser.storage.session
    .setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })
    .catch((err: unknown) => console.warn('setAccessLevel failed:', err));

  browser.action.onClicked.addListener(async (tab) => {
    if (!tab.id) return;
    try {
      await browser.tabs.sendMessage(tab.id, { type: 'toggle-popup' });
    } catch {
      // Content script not loaded on this tab (e.g. chrome:// or new tab page)
    }
  });

  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    if (sender.id !== browser.runtime.id) return;

    if (isRunPipelineMessage(message)) {
      handleRunPipeline(message.jobDescription, message.jobTitle, message.jobCompany);
      return true;
    }

    if (isCancelMessage(message)) {
      clearPipelineSession();
      return true;
    }
  });
});

async function handleRunPipeline(
  jobDescription: string,
  jobTitle?: string,
  jobCompany?: string,
) {
  try {
    const profile = await userProfile.getValue();

    if (!profile.cvTemplate || !profile.professionalHistory) {
      console.warn('Pipeline started without complete profile.');
      return;
    }

    await pipelineSession.setValue({
      ...EMPTY_SESSION,
      status: 'running',
      jobDescription,
      jobTitle,
      jobCompany,
    });

    // TODO: POST to backend with profile.cvTemplate + profile.professionalHistory + jobDescription
  } catch (err) {
    console.error('Pipeline initialization failed:', err);
    await setPipelineStatus('error');
  }
}
