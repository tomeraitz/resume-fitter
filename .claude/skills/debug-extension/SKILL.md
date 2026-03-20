---
name: debug-extension
description: Launch the WXT extension in dev mode, connect Playwright MCP, and interactively test the extension popup UI on a live page.
---

# Extension Debugger Workflow

Launch the extension dev server, connect Playwright via CDP, and test the extension UI end-to-end.

## Prerequisites

- `.mcp.json` has Playwright configured with `--cdp-endpoint http://localhost:9222`
- `extension/wxt.config.ts` has `chromiumArgs: ['--remote-debugging-port=9222']`

## Workflow Steps

### Step 1: Kill stale processes on port 9222

Kill only the Chrome process bound to the debug port (not your personal browser) and the WXT dev server:

```bash
# Find and kill the process using port 9222
for /f "tokens=5" %a in ('netstat -aon ^| findstr :9222 ^| findstr LISTENING') do taskkill //F //PID %a
```

Wait 2 seconds for cleanup.

### Step 2: Start Docker services

Start the required backend services:

```bash
docker compose up --build
```

Run this as a **background task**. Wait for the services to be healthy before proceeding.

### Step 3: Start extension dev server

Run the WXT dev server in the background:

```bash
cd extension && npm run dev:headless
```

Run this as a **background task**. Wait ~15 seconds, then check the output for:
- `Built extension in X s`
- `Opened browser in X ms`

If you see `ENOENT` errors, retry — the previous build output may have been cleaned up.

### Step 4: Get the extension ID

Query the CDP endpoint to find the extension's service worker, which contains the extension ID:

```bash
curl -s http://localhost:9222/json
```

Look for the `service_worker` entry. The extension ID is in the URL:
`chrome-extension://<EXTENSION_ID>/background.js`

### Step 5: Start the E2E mock server

In a separate background task, start the mock page server:

```bash
cd e2e && npm run serve
```

This serves mock job pages at `http://localhost:3006`. Available routes:
- `http://localhost:3006/test-comp/jobs/4488055101` — Greenhouse AI Engineer posting

### Step 6: Navigate to the test page

Use Playwright MCP to navigate to the mock job page:

```
mcp__playwright__browser_navigate({ url: "http://localhost:3006/test-comp/jobs/4488055101" })
```

### Step 7: Trigger the extension popup

Playwright MCP **blocks `chrome-extension://` URLs**, so you cannot navigate to `popup.html` directly.

Instead, use CDP via Python to execute code in the service worker context, simulating the extension icon click:

```bash
python3 -c "
import json, asyncio, websockets

async def trigger():
    async with websockets.connect('ws://localhost:9222/devtools/page/<SERVICE_WORKER_ID>') as ws:
        msg = {
            'id': 1,
            'method': 'Runtime.evaluate',
            'params': {
                'expression': '''
                    (async () => {
                        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
                        if (tab && tab.id) {
                            await chrome.tabs.sendMessage(tab.id, {type: 'toggle-popup'});
                            return 'sent toggle-popup to tab ' + tab.id;
                        }
                        return 'no active tab';
                    })()
                ''',
                'awaitPromise': True
            }
        }
        await ws.send(json.dumps(msg))
        result = await ws.recv()
        print(result)

asyncio.run(trigger())
"
```

Replace `<SERVICE_WORKER_ID>` with the `id` from Step 4's CDP `/json` response.

### Step 8: Verify the popup visually

Take a screenshot to confirm the popup rendered:

```
mcp__playwright__browser_take_screenshot({ type: "png" })
```

The extension popup renders as a **shadow DOM** element (`<resume-fitter-popup>`) overlaid on the page.

### Step 9: Run E2E test scenarios

Scan the `e2e/tests/` directory for all `.md` test files. Read each file and execute the steps described in it, in order (01, 02, 03, ...).

```bash
ls e2e/tests/*.md
```

For each test file:
1. Read the file to understand the steps and pass criteria
2. Execute each step using Playwright MCP and CDP as described
3. Take screenshots after key interactions to verify visually
4. When a step calls for `frontend-design` validation, use the `/frontend-design` skill to review the screenshot
5. Report PASS or FAIL for each test with details on any failures

Since the popup lives inside a shadow DOM, always use `browser_evaluate` with `shadowRoot` queries to interact with elements:

```js
// Example: query shadow DOM
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  if (!shadow) return 'no shadow root found';
  // ... interact with elements inside shadow
}
```

### Step 10: Cleanup

When done, kill only the processes on port 9222:

```bash
for /f "tokens=5" %a in ('netstat -aon ^| findstr :9222 ^| findstr LISTENING') do taskkill //F //PID %a
```

## Key Limitations

- **Playwright MCP blocks `chrome-extension://` URLs** — cannot navigate to popup.html directly
- **Extension popup uses shadow DOM** — standard Playwright selectors won't find elements; use `browser_evaluate` with `shadowRoot` queries
- **Extension icon click cannot be simulated via Playwright** — must use CDP to send `toggle-popup` message through the service worker
