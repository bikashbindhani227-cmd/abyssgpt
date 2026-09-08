# AbyssGPT — Production Deployment Guide

AbyssGPT is a mobile-first AI chat application with Firebase Authentication, Firestore-backed user/conversation data, admin controls, optional Tavily web search, premium plans, and **AI Credits as the only AI generation provider**.

The frontend is built with React + Vite and is designed for Vercel. The backend is Node.js + Express and has a dedicated `backend/` directory so Render can use **Root Directory = `backend`** exactly as requested.

## 1. What is already wired

- Firebase Email/Password + Google sign-in.
- Server-side Firebase ID-token verification.
- Admin-only routes and admin control center.
- Free/Premium plans and server-side daily/rate limits.
- Manual Premium activation from Admin → Users.
- AI Credits streaming chat (`/chat/completions`) with one `MODEL_ID`.
- Tavily web search on the server only; the Tavily key is never sent to the browser.
- Conversation history, message deletion, rename, regeneration, and user memory endpoints.
- Responsive chat UI built for narrow Android screens as well as desktop.
- `/health` endpoint for Render health checks.

## 2. Folder layout

```text
/
├─ frontend/             # Vercel frontend — Root Directory = frontend
│  ├─ src/
│  ├─ public/
│  ├─ index.html
│  ├─ package.json
│  └─ vite.config.ts
├─ backend/              # Render backend — Root Directory = backend
│  ├─ server.ts
│  ├─ server/             # API routes/services
│  ├─ types.ts
│  └─ package.json
├─ firestore.rules
├─ render.yaml
├─ package.json
└─ README.md
```

**Important:** Vercel must use `frontend` as its Root Directory. Render must use `backend` as its Root Directory. The old root-level Express/Vite server has been removed so Vercel cannot accidentally deploy it as a Serverless Function.

## 3. Firebase setup — do this first

### A. Create/choose Firebase project
Open Firebase Console and select your project.

### B. Enable Authentication
Go to **Build → Authentication → Sign-in method** and enable:

- Email/Password
- Google

For Google login, add your Vercel domain to the Firebase authorized domains.

### C. Create Firestore
Go to **Build → Firestore Database** and create the database.

Use the database ID you want in the environment variable `FIREBASE_DATABASE_ID`. For the normal default database use `(default)`.

### D. Create a Firebase Admin service account
Go to **Project settings → Service accounts → Generate new private key**.

You need these Render variables:

```env
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_DATABASE_ID=(default)
```

Never put the private key in the Vercel frontend variables and never commit it to Git.

### E. Firestore rules
Deploy the included `firestore.rules` if your browser accesses Firestore directly. The backend uses Firebase Admin SDK and is not restricted by client Firestore rules.

## 4. AI Credits setup

AbyssGPT intentionally has **one AI provider path**: AI Credits.

In Render, add:

```env
AICREDITS_API_KEY=your_key
AICREDITS_BASE_URL=https://api.aicredits.in/v1
MODEL_ID=your_single_model_id
```

Do not add `GEMINI_API_KEY`. The project no longer has a Gemini fallback.

The backend sends:

```json
{
  "model": "YOUR_MODEL_ID",
  "messages": [...],
  "stream": true
}
```

to:

```text
https://api.aicredits.in/v1/chat/completions
```

## 5. Tavily web search (optional)

Add this to Render only:

```env
TAVILY_API_KEY=your_tavily_key
```

The browser does not expose a web-search toggle. The backend automatically decides when live web grounding is needed and performs the Tavily request server-side.

## 6. Deploy backend to Render — exact settings

### VERY IMPORTANT
When creating the Render Web Service, set:

**Root Directory:**

```text
backend
```

That is intentional. Do not set Render's Root Directory to `server` or to the repository root.

Use:

```text
Environment: Node
Root Directory: backend
Build Command: npm install && npm run build
Start Command: npm start
```

The service listens on Render's injected `PORT` and binds to `0.0.0.0`.

After deploy, open:

```text
https://YOUR-BACKEND.onrender.com/health
```

You should get JSON containing `status: "ok"` and `service: "abyssgpt-backend"`.

### Render environment variables

Add these in Render → Environment:

```env
NODE_ENV=production
FRONTEND_URL=https://YOUR-FRONTEND.vercel.app
AICREDITS_API_KEY=...
AICREDITS_BASE_URL=https://api.aicredits.in/v1
MODEL_ID=...
TAVILY_API_KEY=...                  # optional
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
FIREBASE_DATABASE_ID=(default)
ADMIN_EMAIL=your-admin-email@example.com
PREMIUM_PRICE_INR=299
TELEGRAM_USERNAME=@MrNewton_2
DEFAULT_SYSTEM_PROMPT=...
```

## 7. Deploy frontend to Vercel — exact settings

Create a Vercel Project from the same GitHub repository.

Use **`frontend`** as Vercel's Root Directory. This is important: the repository also contains the Render backend.

Build settings:

```text
Framework: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

### Vercel environment variables

Add only public/client-safe configuration:

```env
VITE_API_BASE_URL=https://YOUR-BACKEND.onrender.com
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_DATABASE_ID=(default)
```

**Never put `AICREDITS_API_KEY`, `TAVILY_API_KEY`, or `FIREBASE_PRIVATE_KEY` in Vercel.**

## 8. Firebase authorized domains

In Firebase Authentication → Settings → Authorized domains, add:

```text
YOUR-FRONTEND.vercel.app
```

Also add any custom domain you connect to Vercel.

## 9. First admin login

Set:

```env
ADMIN_EMAIL=your-admin-email@example.com
```

After that exact email signs in, the backend can bootstrap that account as an admin.

Open the Admin panel from the chat menu. Admin controls include:

- Dashboard overview
- System prompt editor + history
- Free/Premium limits
- User search and management
- Ban/unban
- Daily usage reset
- Manual Premium activation/removal
- Premium duration
- App settings
- Maintenance mode
- Registration toggle

## 10. Premium flow

There is no automatic payment verification in this build.

A normal user sees the Premium page and the configured Telegram contact:

```text
@MrNewton_2
```

The admin manually activates Premium from the admin Users panel.

## 11. Local development

Prerequisite: Node.js 20+

From the repository root:

```bash
npm install
cp .env.example .env
npm run dev
```

The root dev command runs the combined Express + Vite development server.

For a production-style backend test using the same structure as Render:

```bash
cd backend
npm install
npm run build
npm start
```

## 12. Common deployment mistakes

### Render says it cannot find the backend
Check:

```text
Root Directory = backend
```

### CORS error in the browser
Set:

```env
FRONTEND_URL=https://YOUR-FRONTEND.vercel.app
```

The value must exactly match the browser origin, including `https://` and without a trailing slash.

### Chat says AI Credits is not configured
Check these three Render variables:

```env
AICREDITS_API_KEY=...
AICREDITS_BASE_URL=https://api.aicredits.in/v1
MODEL_ID=...
```

### Firebase auth works but backend returns 401
Make sure the Render service account is valid and that the frontend is calling the correct `VITE_API_BASE_URL`.

### Google sign-in is blocked
Add the deployed Vercel domain to Firebase Authentication → Authorized domains and configure the Google provider.

### Premium/admin changes disappear after redeploy
Your Render service must have valid Firebase Admin credentials so server-side Firestore can persist the data. Do not rely on local JSON storage as your production database.

## 13. Architecture notes

```text
User browser
   │
   ├── Vercel: React/Vite frontend
   │       │
   │       └── Firebase Auth (ID token)
   │
   └── HTTPS API
           │
           ▼
     Render: Express backend
           │
           ├── Verify Firebase ID token
           ├── Firestore / Firebase Admin
           ├── AI Credits API
           └── Tavily API (when requested)
```

Secrets stay on Render. The browser never receives provider API keys.

## 14. Final pre-launch checklist

```text
[ ] Render Root Directory = backend
[ ] Render Build Command = npm install && npm run build
[ ] Render Start Command = npm start
[ ] /health returns status=ok
[ ] FRONTEND_URL points to Vercel
[ ] AI Credits key + MODEL_ID configured
[ ] Firebase Admin service-account variables configured
[ ] Firestore database exists
[ ] Email/password auth enabled
[ ] Google auth enabled + Vercel domain authorized
[ ] VITE_API_BASE_URL points to Render
[ ] Admin email configured
[ ] Tavily key configured only if web search is needed
```

## 15. Important honesty note

The project does not invent AI responses. If AI Credits is unavailable, misconfigured, rate-limited, or returns an error, the backend reports the actual failure instead of silently switching to another AI provider.

## Latest production repair
- Mobile chat now stays dark and readable; the previous light-background/white-text clash is removed from the primary chat shell.
- Removed the visible Web/Tavily control and provider chip from the composer. Web search remains a backend capability and is not named in the chat UI.
- Prevented conversation reload races while streaming, which could make optimistic messages appear duplicated or disappear.
- Fixed the streaming abort lifecycle so a normal completed POST request does not prematurely abort the upstream AI stream.
- Backend CORS now accepts the production AbyssGPT Vercel domain, AbyssGPT Vercel preview URLs, and local development origins.
- Empty local storage files are initialized safely instead of producing a JSON parse warning.
- The frontend validates `VITE_API_BASE_URL`; malformed/missing values fall back to the current Render backend URL.
- Firebase client Firestore is no longer eagerly initialized because the backend is the source of truth for application data.

## 10. Agentic tool layer

AbyssGPT now has an automatic server-side tool layer. It does not call every provider on every message: tools are selected only when the request needs them, and independent tools run concurrently to reduce latency.

- **Tavily**: current web search.
- **Jina Reader**: reads supplied URLs into clean model context.
- **Daytona**: executes explicit fenced Python/JavaScript/TypeScript code in an isolated sandbox. Daytona is designed for isolated AI-agent code execution.
- **Trigger.dev**: background task infrastructure with retries/queues for long-running agent jobs.

The chat stream is also server-batched before forwarding chunks to the browser, reducing per-token React renders and scroll churn.

### Render agent environment variables

```env
JINA_API_KEY=...
DAYTONA_API_KEY=...
DAYTONA_TARGET=us
TRIGGER_SECRET_KEY=...
TRIGGER_PROJECT_REF=...
```

Keep all of these server-side. Never expose them as `VITE_` variables.

### Direct admin URL

The admin control center is available at:

```text
https://YOUR-DOMAIN/admin
```

The frontend route is still protected by the Firebase admin check, and all `/api/admin/*` endpoints remain server-side protected.


## Admin panel
Open `/admin` on the frontend domain. The admin password is verified only by the backend and must be stored in Render as `ADMIN_PASSWORD`. Do not put the admin password in Vercel or frontend source. The browser receives only a short-lived signed admin session token.

## Automatic Agent Resource Management

Every request is now resourced automatically by the backend. Developers and admins never configure per-request limits, users never see or set them, and the AI model can never raise its own budget.

### Flow

```text
USER REQUEST
  → TASK CLASSIFICATION      (rule-based, zero-cost, runs before any model call)
  → AUTOMATIC BUDGET PLANNER (per-request budget, clamped to hard ceilings)
  → AGENT EXECUTION          (BudgetTracker gates every step and tool call)
  → SERVER-SIDE HARD LIMITS  (absolute envelope, enforced even against the model)
```

### Task classification

The classifier inspects the message (signals: explicit search flag, URLs, code fences, debug/run/execute keywords, current-info keywords, research-depth patterns, message length, multi-part structure) and produces:

- **Category**: `simple` | `current_info` | `research` | `coding`
- **Complexity**: 1–10
- **Capability flags**: whether web search and/or code execution may be allocated

### Automatic budgets per category

| Control | simple | current_info | research | coding |
|---|---|---|---|---|
| MAX_AGENT_STEPS | 2 | 4 | 9 | 6 |
| MAX_TOOL_CALLS | 2 | 5 | 12 | 8 |
| MAX_TOOL_OUTPUT_SIZE | 12k | 20k | 30k | 24k |
| TOOL_TIMEOUT_MS | 10s | 15s | 25s | 30s |
| TOTAL_AGENT_TIMEOUT_MS | 45s | 80s | 150s | 120s |
| MAX_SEARCH_RESULTS | 3 | 4 | 6 | 2 |
| MAX_WEBPAGE_SIZE | 20k | 30k | 45k | 25k |
| MAX_CODE_EXECUTION_TIME_MS | 0 | 15s | 30s | 45s |

Complexity nudges these inside the tier (low complexity shrinks, complexity ≥ 7 grows), and every value is clamped to the hard ceilings.

### Server-side hard ceilings

Render environment variables (backend only, never `VITE_`): `MAX_AGENT_STEPS`, `MAX_TOOL_CALLS`, `MAX_TOOL_OUTPUT_SIZE`, `TOOL_TIMEOUT_MS`, `TOTAL_AGENT_TIMEOUT_MS`, `MAX_SEARCH_RESULTS`, `MAX_WEBPAGE_SIZE`, `MAX_CODE_EXECUTION_TIME_MS`. Code-level absolute maxima cap these even if a bad env value is supplied. The planner may choose lower values per task, but no component — including the model — can exceed the ceilings.

### Budget adaptation during execution

- First tool result fully answers → the model stops calling tools and the loop terminates immediately.
- Task proves simpler than planned → remaining budget shrinks.
- Genuinely complex research still making progress → one controlled expansion, still below the ceilings.
- The agent loop is never restarted mid-request; it either continues with the remaining budget or finalizes the answer.

### Early termination

The agent terminates early when the answer is sufficient, the requested information is obtained, additional calls would not improve the result, the same call keeps returning the same output, tools keep failing, the tool/step budget is exhausted, or the total timeout is reached.

### Anti-loop protection

The BudgetTracker fingerprints every call (tool + normalized arguments + result hash). Repeated identical tool calls, repeated identical searches or webpage reads, repeated code-execution failures, and no-progress result streaks are detected and the loop is terminated safely, always leaving the user with a final answer.

### Security model

- The planner is NOT the final authority; the backend enforces everything.
- Model-generated values are never trusted; the model can only choose *whether* to call a tool, never the limits.
- Ceilings live in backend configuration only; nothing is exposed to the frontend, and budget diagnostics are server-log-only.
## Automatic web grounding

AbyssGPT does not expose a manual web-search toggle in the chat composer. The backend classifies each request and automatically grounds live-information requests with Tavily and explicit URL requests with Jina Reader. This is server-side behavior and remains independent of model-native tool-calling support.
