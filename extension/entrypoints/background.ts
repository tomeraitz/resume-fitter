import { userProfile, pipelineSession, EMPTY_SESSION, clearPipelineSession, setPipelineStatus, setExtractionStatus, setExtractedJob, updateStepResult, setGeneratedCv } from '../services/storage';
import type { RunPipelineMessage } from '../types/messages';
import type { AgentStep, AgentResultData } from '../types/pipeline';
import { handleExtractJob, isExtractJobMessage, signJwt } from '../utils/handleExtractJob';

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

function isValidStepOutput(step: AgentStep, output: unknown): boolean {
  if (typeof output !== 'object' || output === null) return false;
  const o = output as Record<string, unknown>;
  switch (step) {
    case 'hiring-manager':
      return typeof o.matchScore === 'number' && Array.isArray(o.missingKeywords);
    case 'ats-scanner':
      return typeof o.atsScore === 'number' && Array.isArray(o.problemAreas);
    case 'verifier':
      return Array.isArray(o.flaggedClaims);
    case 'rewrite-resume':
      return typeof o.updatedCvHtml === 'string';
    default:
      return false;
  }
}

let currentAbort: AbortController | null = null;
let pipelineRunning = false;

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

  browser.tabs.onActivated.addListener(async ({ tabId: _newTabId, ...rest }) => {
    const previousTabId = (rest as { previousTabId?: number }).previousTabId;
    if (!previousTabId) return;
    try {
      await browser.tabs.sendMessage(previousTabId, { type: 'close-popup' });
    } catch {
      // Content script not loaded on previous tab — nothing to close
    }
  });

  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id) return;

    if (isExtractJobMessage(message)) {
      setExtractionStatus('extracting').then(() =>
        handleExtractJob(message.html).then(async (response) => {
          if (response.success) {
            await setExtractedJob(response.job);
            await setExtractionStatus('done');
          } else {
            await setExtractionStatus('error');
          }
          sendResponse(response);
        }),
      );
      return true; // Keep message channel open for async response
    }

    if (isRunPipelineMessage(message)) {
      handleRunPipeline(message.jobDescription, message.jobTitle, message.jobCompany)
        .then(() => sendResponse({ done: true }))
        .catch(() => sendResponse({ done: true }));
      return true; // Keep service worker alive while pipeline runs
    }

    if (isCancelMessage(message)) {
      currentAbort?.abort();
      clearPipelineSession();
      return true;
    }

    if (typeof message === 'object' && message !== null && (message as Record<string, unknown>).type === 'cancel-extraction') {
      setExtractionStatus('idle');
      return true;
    }

    if (typeof message === 'object' && message !== null) {
      const type = (message as Record<string, unknown>).type;

      if (type === 'open-options-page') {
        browser.runtime.openOptionsPage();
        return true;
      }

      if (type === 'close-popup' && sender.tab?.id) {
        browser.tabs.sendMessage(sender.tab.id, { type: 'close-popup' });
        return true;
      }

      if (type === 'open-cv-preview') {
        browser.tabs.create({
          url: browser.runtime.getURL('/cv-preview.html'),
        });
        return true;
      }
    }
  });
});

const STEP_NAMES: Record<number, AgentStep> = {
  1: 'hiring-manager',
  2: 'rewrite-resume',
  3: 'ats-scanner',
  4: 'verifier',
};

const VALID_SSE_EVENTS = new Set(['step', 'done', 'error']);

async function handleSSEEvent(
  eventType: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (!VALID_SSE_EVENTS.has(eventType)) return;

  if (eventType === 'step') {
    const stepNum = data.step;
    if (typeof stepNum !== 'number' || !Number.isInteger(stepNum) || stepNum < 1 || stepNum > 4) return;
    const stepName = STEP_NAMES[stepNum];
    if (!stepName) return;

    const output = (typeof data.output === 'object' && data.output !== null) ? data.output : {};
    if (!isValidStepOutput(stepName, output)) {
      console.warn(`Skipping malformed step output for "${stepName}":`, output);
      return;
    }
    await updateStepResult(stepName, 'completed', {
      step: stepName,
      ...output,
    } as AgentResultData);

    const nextStep = STEP_NAMES[stepNum + 1];
    if (nextStep) {
      await updateStepResult(nextStep, 'running');
    }
  } else if (eventType === 'done') {
    if (typeof data.finalCv === 'string' && data.finalCv.length <= 2_000_000) {
      await setGeneratedCv(data.finalCv);
    }
  } else if (eventType === 'error') {
    await setPipelineStatus('error');
  }
}

async function handleRunPipeline(
  jobDescription: string,
  jobTitle?: string,
  jobCompany?: string,
) {
  console.log('[pipeline] handleRunPipeline called. Already running?', pipelineRunning);
  if (pipelineRunning) return;
  pipelineRunning = true;

  currentAbort?.abort();
  currentAbort = new AbortController();

  const signal = typeof AbortSignal.any === 'function'
    ? AbortSignal.any([currentAbort.signal, AbortSignal.timeout(300_000)])
    : currentAbort.signal;

  try {
    const profile = await userProfile.getValue();

    console.log('[pipeline] Profile loaded. cvTemplate length:', profile.cvTemplate?.length, 'history length:', profile.professionalHistory?.length);
    if (!profile.cvTemplate || !profile.professionalHistory) {
      console.warn('[pipeline] Started without complete profile. cvTemplate:', !!profile.cvTemplate, 'history:', !!profile.professionalHistory);
      await setPipelineStatus('error');
      return;
    }

    await pipelineSession.setValue({
      ...EMPTY_SESSION,
      status: 'running',
      jobDescription,
      jobTitle,
      jobCompany,
      steps: {
        ...EMPTY_SESSION.steps,
        'hiring-manager': { step: 'hiring-manager', status: 'running' },
      },
    });

    console.log('[pipeline] Fetching:', `${import.meta.env.WXT_SERVER_URL}/pipeline`);
    const response = await fetch(`${import.meta.env.WXT_SERVER_URL}/pipeline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await signJwt()}`,
      },
      body: JSON.stringify({
        jobDescription,
        cvTemplate: profile.cvTemplate,
        history: profile.professionalHistory,
      }),
      signal,
    });

    if (!response.ok || !response.body) {
      const errBody = await response.text().catch(() => '(unreadable)');
      console.error('[pipeline] Fetch failed. status:', response.status, 'body:', errBody);
      await setPipelineStatus('error');
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let eventType = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ') && eventType) {
          try {
            const data = JSON.parse(line.slice(6));
            await handleSSEEvent(eventType, data);
          } catch (parseErr) {
            console.warn('Skipping malformed SSE data:', parseErr);
          }
          eventType = '';
        }
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.info('Pipeline stream aborted.');
      return;
    }
    console.error('[pipeline] Pipeline failed:', err);
    await setPipelineStatus('error');
  } finally {
    currentAbort = null;
    pipelineRunning = false;
  }
}
