<div align="center">

  <a href="https://abyssgpt.vercel.app" target="_blank" rel="noopener noreferrer">
    <img src="./assets/logo.svg" alt="AbyssGPT Logo" width="130" height="130" />
  </a>

  # ⚡ AbyssGPT
  
  ### *The Next-Generation Autonomous AI Chat & Intelligent Multi-Tool Agent Platform*

  <p align="center">
    <a href="https://abyssgpt.vercel.app"><img src="https://img.shields.io/badge/Frontend-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel"></a>
    <a href="https://abyssgpt-cb9k.onrender.com/health"><img src="https://img.shields.io/badge/Backend-Render-46E3B7?style=for-the-badge&logo=render&logoColor=white" alt="Render"></a>
    <a href="https://api.aicredits.in"><img src="https://img.shields.io/badge/AI_Engine-AI_Credits-7c3aed?style=for-the-badge&logo=openai&logoColor=white" alt="AI Credits"></a>
    <a href="https://firebase.google.com"><img src="https://img.shields.io/badge/Auth_%26_DB-Firebase-FFA611?style=for-the-badge&logo=firebase&logoColor=black" alt="Firebase"></a>
    <a href="https://t.me/MrNewton_2"><img src="https://img.shields.io/badge/Support-Telegram-229ED9?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram"></a>
    <img src="https://img.shields.io/badge/License-MIT-3b82f6?style=for-the-badge" alt="License">
  </p>

  <p align="center">
    <a href="https://abyssgpt.vercel.app"><b>🌐 Live Application</b></a> •
    <a href="https://abyssgpt-cb9k.onrender.com/health"><b>🩺 Backend Health</b></a> •
    <a href="#-key-features"><b>✨ Features</b></a> •
    <a href="#-system-architecture"><b>🏗️ Architecture</b></a> •
    <a href="#-quick-start"><b>🚀 Quick Start</b></a> •
    <a href="#-deployment-guide"><b>🚢 Deployment</b></a> •
    <a href="#-admin-control-center"><b>🛡️ Admin Portal</b></a>
  </p>

  <br />

  <a href="https://abyssgpt.vercel.app" target="_blank">
    <img src="./assets/banner.png" alt="AbyssGPT Interface Preview" width="100%" style="border-radius: 14px; border: 1px solid #1f2937; box-shadow: 0 20px 40px -15px rgba(0,0,0,0.6);" />
  </a>

</div>

<br />

---

## 🌌 Overview

**AbyssGPT** is a high-performance, mobile-first AI chat and autonomous agent platform built with modern web standards. Powered by **AI Credits** as its unified model provider, AbyssGPT integrates live web grounding, intelligent webpage reading, sandboxed code execution, role-based Firebase authentication, and a robust admin control panel into an ultra-responsive dark-mode interface.

Designed with a **strict separation of concerns**:
- **Frontend (Vercel)**: React 18, TypeScript, Vite, Tailwind CSS, Lucide icons, and real-time SSE streaming.
- **Backend (Render)**: Node.js, Express, Firebase Admin SDK, and server-side model orchestration with hard server-enforced safety ceilings.

---

## ✨ Key Features

| Feature | Description |
| :--- | :--- |
| ⚡ **Real-Time Token Streaming** | Server-Sent Events (SSE) deliver buttery-smooth chunk-batched token streams without client-side render stutter or browser freeze. |
| 🧠 **Autonomous Agent Orchestrator** | Dynamic request classifier allocates step, tool, and timeout budgets tailored to message complexity (`simple`, `current_info`, `research`, `coding`). |
| 🌐 **Automatic Web Grounding** | Queries requiring live internet facts are automatically routed to **Tavily** on the server — completely hands-free without manual toggles. |
| 📄 **Deep Webpage Reading** | Links and articles sent in user prompts are cleanly fetched and parsed into contextual Markdown via **Jina Reader**. |
| 💻 **Sandboxed Code Execution** | Safely evaluates Python, JavaScript, and TypeScript blocks inside an isolated **Daytona** sandbox. |
| 🛡️ **Enterprise Auth & Security** | Firebase Authentication (Email/Password + Google OAuth) with server-side ID token verification via Firebase Admin SDK. |
| 💎 **Freemium & Tiered Access** | Free vs. Pro tiers with server-enforced daily limits, rate limits, and custom perks. |
| 📱 **Mobile-Optimized Dark Shell** | Meticulously crafted responsive UI with smooth drawer navigation, mobile keyboard avoidance, and accessible contrast. |
| 🎛️ **Full Admin Control Suite** | Dedicated `/admin` dashboard for managing users, banning/unbanning, manual Pro grants, and dynamic system prompt updates. |

---

## 🏗️ System Architecture

```text
                                  ┌─────────────────────────────┐
                                  │      Client (Browser)       │
                                  │   React 18 + Vite (Vercel)  │
                                  └──────────────┬──────────────┘
                                                 │
                                                 │ Firebase Auth ID Token + SSE Stream
                                                 ▼
                                  ┌─────────────────────────────┐
                                  │     Node.js + Express       │
                                  │     Backend API (Render)    │
                                  └──────┬───────────────┬──────┘
                                         │               │
                     ┌───────────────────┘               └───────────────────┐
                     ▼                                                       ▼
      ┌─────────────────────────────┐                         ┌─────────────────────────────┐
      │     Firebase Admin SDK      │                         │  Model & Agent Orchestrator │
      │  • Users & Profiles         │                         │  • Task Classifier          │
      │  • Firestore DB (default)   │                         │  • Budget Planner & Ceilings│
      │  • Admin Session Validation │                         │  • Anti-Loop Protection     │
      └─────────────────────────────┘                         └──────────────┬──────────────┘
                                                                             │
                                           ┌─────────────────────────────────┼─────────────────────────────────┐
                                           ▼                                 ▼                                 ▼
                            ┌─────────────────────────────┐   ┌─────────────────────────────┐   ┌─────────────────────────────┐
                            │      AI Credits API         │   │     Live Web Tools          │   │     Code & Automation       │
                            │  • MODEL_ID (Universal)     │   │  • Tavily Web Search        │   │  • Daytona Sandboxed Exec   │
                            │  • /chat/completions        │   │  • Jina Reader (URLs)       │   │  • Trigger.dev Background   │
                            └─────────────────────────────┘   └─────────────────────────────┘   └─────────────────────────────┘
```

### 🔒 Security Principles
1. **Zero Secret Exposure**: Model keys, search tokens, service accounts, and admin passwords live strictly on the Render backend. The frontend bundle never receives sensitive credentials.
2. **Server-Side Hard Ceilings**: The AI model can never elevate its own step limits, execution quotas, or timeouts. Every tool call is tracked, verified, and gated.
3. **No Hallucinated Tool Outputs**: When an external tool fails or is unavailable, AbyssGPT returns an honest status rather than fabricating information.

---

## ⚙️ Automatic Agent Resource Limits

Every user request is categorized upfront to balance speed and research depth:

| Parameter | Simple | Current Info | Deep Research | Coding & Sandbox |
| :--- | :---: | :---: | :---: | :---: |
| **Max Agent Steps** | 2 | 4 | 9 | 6 |
| **Max Tool Invocations** | 2 | 5 | 12 | 8 |
| **Max Tool Output Buffer** | 12 KB | 20 KB | 30 KB | 24 KB |
| **Per-Tool Timeout** | 10s | 15s | 25s | 30s |
| **Total Request Timeout** | 45s | 80s | 150s | 120s |
| **Max Search Results** | 3 | 4 | 6 | 2 |
| **Max Webpage Size** | 20 KB | 30 KB | 45 KB | 25 KB |
| **Max Code Exec Duration** | 0s | 15s | 30s | 45s |

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- **Node.js**: v20.0.0 or higher
- **npm**: v10.0.0 or higher

### 2. Clone and Install
```bash
git clone https://github.com/your-username/AbyssGPT.git
cd AbyssGPT

# Install all workspace dependencies
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in your API keys (AI Credits, Firebase, etc.).

### 4. Run Development Server
```bash
# Starts both frontend and backend concurrently
npm run dev
```
Open **`http://localhost:3000`** in your browser.

### 5. Running Verification & Tests
```bash
# Run unit test suite (76 tests)
npm test

# Run frontend TypeScript validation
npm run lint
```

---

## 🚢 Production Deployment Guide

AbyssGPT is structured specifically for **Render (Backend)** + **Vercel (Frontend)** dual deployment.

### 1. Render Backend Deployment

1. Create a new **Web Service** on [Render](https://render.com).
2. Connect your Git repository.
3. Configure settings:
   - **Name**: `abyssgpt-backend`
   - **Environment**: `Node`
   - **Root Directory**: `backend` *(Critical: Must be `backend`, not repository root)*
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/health`
4. Add **Environment Variables** in Render Dashboard:
   ```env
   NODE_ENV=production
   PORT=10000
   FRONTEND_URL=https://abyssgpt.vercel.app
   AICREDITS_API_KEY=your_aicredits_key
   AICREDITS_BASE_URL=https://api.aicredits.in/v1
   MODEL_ID=your_chosen_model_id
   TAVILY_API_KEY=your_tavily_key
   JINA_API_KEY=your_jina_key
   FIREBASE_PROJECT_ID=your_firebase_project_id
   FIREBASE_CLIENT_EMAIL=your_service_account_email
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   FIREBASE_DATABASE_ID=(default)
   ADMIN_EMAIL=bikashbindhani227@gmail.com
   ADMIN_PASSWORD=your_secure_admin_password
   PREMIUM_PRICE_INR=299
   TELEGRAM_USERNAME=@MrNewton_2
   ```

### 2. Vercel Frontend Deployment

1. Create a new project on [Vercel](https://vercel.com).
2. Connect the same Git repository.
3. Configure settings:
   - **Root Directory**: `frontend` *(Critical: Must be `frontend`)*
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Add **Environment Variables** in Vercel Dashboard:
   ```env
   VITE_API_BASE_URL=https://abyssgpt-cb9k.onrender.com
   VITE_FIREBASE_API_KEY=your_firebase_web_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_firebase_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   VITE_FIREBASE_DATABASE_ID=(default)
   ```
5. In **Firebase Console → Authentication → Settings → Authorized domains**, add:
   - `abyssgpt.vercel.app`
   - Any custom domains you map to Vercel.

---

## 🛡️ Admin Control Center

AbyssGPT includes a comprehensive administrative portal accessible directly at `/admin`:

- **URL**: `https://abyssgpt.vercel.app/admin`
- **Authentication**: Secured via master admin password and short-lived HMAC session tokens.
- **Capabilities**:
  - 📊 **Real-time Analytics**: Total users, message volume, active premium members.
  - 👥 **User Management**: Search users by email or ID, toggle bans, and reset daily quota counters.
  - 💎 **Premium Membership**: Manually grant or revoke Pro access with configurable validity periods.
  - ⚙️ **Prompt & System Settings**: Live-edit the system prompt, enable maintenance mode, or pause registrations.

---

## 📂 Repository Structure

```text
AbyssGPT/
├── assets/                  # Brand assets, vectors, and documentation images
│   ├── logo.svg             # Scalable vector logo
│   ├── logo.png             # Raster icon
│   └── banner.png           # Showcase preview banner
├── backend/                 # Render deployment root
│   ├── server.ts            # Express server entry point & routing
│   ├── server/
│   │   ├── config/          # Firebase Admin & SDK configuration
│   │   ├── routes/          # API endpoints (chat, auth, memory, admin)
│   │   └── services/        # Model adapters, agent orchestrator, budget planner
│   ├── tests/               # Backend unit and integration test suite
│   ├── package.json         # Backend dependencies & build scripts
│   └── tsconfig.json
├── frontend/                # Vercel deployment root
│   ├── public/              # Static assets, robots.txt, sitemap, llms.txt
│   ├── src/
│   │   ├── components/      # UI components (Navbar, Sidebar, MessageBubble, Logo)
│   │   ├── contexts/        # React context providers (Auth, Chat, Theme)
│   │   ├── lib/             # API client, Firebase web client, helpers
│   │   ├── pages/           # Chat, Auth, Settings, Premium, Admin portal
│   │   └── types.ts         # Shared TypeScript definitions
│   ├── index.html           # HTML5 entry point with SEO metadata
│   ├── vercel.json          # Rewrites, proxy headers & CSP rules
│   ├── vite.config.ts
│   └── package.json
├── firestore.rules          # Production security rules for Firestore
├── render.yaml              # Render blueprint deployment file
└── README.md                # Project documentation
```

---

## 👨‍💻 Author & Support

<table border="0">
  <tr>
    <td width="90" align="center" valign="middle">
      <img src="./assets/logo.png" alt="Bikash Bindhani" width="80" style="border-radius: 50%;" />
    </td>
    <td>
      <b>Bikash Bindhani</b><br />
      Lead Developer & Creator of AbyssGPT<br />
      💬 Telegram Support: <a href="https://t.me/MrNewton_2"><b>@MrNewton_2</b></a><br />
      📧 Inquiries: <a href="mailto:bikashbindhani227@gmail.com">bikashbindhani227@gmail.com</a>
    </td>
  </tr>
</table>

---

<div align="center">
  <sub>Built with ❤️ by Bikash Bindhani • Powered by AI Credits • Star ⭐ the repo if you like it!</sub>
</div>
