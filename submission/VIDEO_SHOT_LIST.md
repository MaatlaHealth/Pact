# Shot list

Synchronized with VIDEO_SCRIPT.md. Resolution 1920x1080, browser maximized, light theme, Chrome with no extensions visible. Record with OBS or the OS screen recorder; export at 1080p, 30 fps. Target total 2:45; hard limit under 3:00.

| # | Time | Shot | Page or element | Action | Capture notes |
| --- | --- | --- | --- | --- | --- |
| 1 | 0:00 | Wide | `/app` Overview | Hover the four stat cards briefly | Judge demo workspace badge visible in the top bar |
| 2 | 0:06 | Wide | `/app/contracts/new` | Objective prefilled; show budget 60; scenario "Defective first draft" selected | Hold 3 seconds on the scenario explanation |
| 3 | 0:14 | Wide | Same | Click Generate contract; loading state | Trim the wait to under 4 seconds in the edit |
| 4 | 0:20 | Medium | Contract page, Contract tab | Scroll the criteria list slowly | Show objective and subjective badges and the hash line |
| 5 | 0:28 | Wide | Action bar | Click Approve contract and start negotiation | Pipeline strip updates to Negotiation |
| 6 | 0:31 | Medium | Agents tab | Messages appear: selection note, task brief, proposal, counter, accept | Keep the live indicator in frame |
| 7 | 0:40 | Wide | Action bar | Click Authorize with PayPal | |
| 8 | 0:44 | Wide | PayPal sandbox checkout | Sign in as the sandbox payer, approve | Blur or crop the payer email if desired |
| 9 | 0:52 | Medium | Payment tab | Order, Authorization cards with IDs and expiry | Hold 4 seconds |
| 10 | 1:00 | Medium | Agents tab | Worker run expanded: tool executions scrolling | Show write_file, self_check, submit_deliverable |
| 11 | 1:10 | Wide | New tab | Open deliverable #1 | Scroll the generated page once; show the contact form |
| 12 | 1:18 | Wide | Contract page | Pipeline strip at Verification; status Under verification | |
| 13 | 1:25 | Medium | Verification tab, attempt 1 | Expand; show FAILED badge | |
| 14 | 1:30 | Close | Contact form submission row | Reason text and the FORM_SUBMISSION evidence link | Zoom to 125 percent in post if the text is small |
| 15 | 1:38 | Medium | Screenshot gallery | Hover two screenshots | Taken by the verifier |
| 16 | 1:43 | Close | Policy panel (right) | "Blocked: capture payment" and failing rules | Hold 5 seconds |
| 17 | 1:50 | Medium | Agents tab | Correction request message; second worker run | |
| 18 | 1:58 | Wide | Open deliverable #2 | Submit the contact form manually; confirmation page | Optional if time is short |
| 19 | 2:05 | Medium | Verification tab, attempt 2 | All rows green; Lighthouse score badge | Attempt 1 still visible below |
| 20 | 2:15 | Close | Policy panel | "Allowed: capture payment" with rule count | |
| 21 | 2:20 | Wide | Action bar or Approvals | Approve if a request is pending; otherwise Capture now | |
| 22 | 2:26 | Medium | Payment tab | Capture card with ID and COMPLETED | Hold 4 seconds |
| 23 | 2:31 | Close | Live timeline | PayPal capture event | |
| 24 | 2:35 | Wide | Receipt page | Signature block; click Verify; checks green | |
| 25 | 2:40 | Medium | `/app/agents/atlas-web-worker` | Trust Passport stats | |
| 26 | 2:43 | Title | Home page hero | Tagline on screen | End card, 2 seconds |

## Preparation checklist

- Deployment reachable over HTTPS; worker running; `GET /api/health` shows the worker seen within the last minute.
- Judge account signed in; PayPal sandbox payer credentials at hand; sandbox balance sufficient.
- Email, storage, and signing key configured on the deployment so receipts are issued.
- One warm-up run completed so Chromium and Lighthouse are cached on the worker.
- Browser zoom 100 percent, bookmarks bar hidden, notifications off.
