<div align="center">

  <a href="https://abyssgpt.vercel.app" target="_blank" rel="noopener noreferrer">
    <img src="./frontend/public/apple-touch-icon.png" alt="AbyssGPT Logo" width="130" height="130" style="border-radius: 28px; box-shadow: 0 10px 35px rgba(99, 102, 241, 0.45);" />
  </a>

  # ⚡ AbyssGPT

  ### 🌌 *Autonomous AI Engineering, Universal Reasoning & Next-Gen PWA Agent*

  <p align="center">
    <a href="https://abyssgpt.vercel.app"><img src="https://img.shields.io/badge/Frontend-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel"></a>
    <a href="https://abyssgpt-cb9k.onrender.com/health"><img src="https://img.shields.io/badge/Backend-Render-46E3B7?style=for-the-badge&logo=render&logoColor=white" alt="Render"></a>
    <a href="https://api.aicredits.in"><img src="https://img.shields.io/badge/AI_Engine-AI_Credits-7c3aed?style=for-the-badge&logo=openai&logoColor=white" alt="AI Credits"></a>
    <a href="https://firebase.google.com"><img src="https://img.shields.io/badge/Auth_%26_DB-Firebase-FFA611?style=for-the-badge&logo=firebase&logoColor=black" alt="Firebase"></a>
    <img src="https://img.shields.io/badge/PWA-Installable-5b4fd6?style=for-the-badge&logo=pwa&logoColor=white" alt="PWA Ready">
    <img src="https://img.shields.io/badge/SMTP-Active_Alerts-10b981?style=for-the-badge&logo=gmail&logoColor=white" alt="SMTP Alerts">
    <a href="https://t.me/MrNewton_2"><img src="https://img.shields.io/badge/Support-Telegram-229ED9?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram"></a>
    <img src="https://img.shields.io/badge/License-MIT-3b82f6?style=for-the-badge" alt="License">
  </p>

  <p align="center">
    <a href="https://abyssgpt.vercel.app"><b>🌐 Live App (Vercel)</b></a> •
    <a href="https://abyssgpt-cb9k.onrender.com/health"><b>🩺 Backend Health (Render)</b></a> •
    <a href="#-core-highlights"><b>🌟 Highlights</b></a> •
    <a href="#-pwa-mobile-experience"><b>📱 PWA App Mode</b></a> •
    <a href="#-system-architecture"><b>🏗️ Architecture</b></a> •
    <a href="#-environment--quick-start"><b>🚀 Setup & Env</b></a> •
    <a href="#-author--contact"><b>👨‍💻 Developer</b></a>
  </p>

</div>

---

## 🌟 Core Highlights

**AbyssGPT** is a production-grade, full-stack AI platform built for deep reasoning, real-time web research, autonomous software engineering, and instant code execution. Designed with clean minimalism and performance in mind, it provides:

- 🚀 **Progressive Web App (PWA) Certified**: Install directly to home screens on Android and iOS — opens as a true standalone, distraction-free app without browser address bars.
- ⚡ **Autonomous Tool-Calling Loop**: Equipped with live Tavily Web Search, Jina Reader URL inspection, terminal sandboxing, and self-healing error triage.
- 📬 **Smart SMTP Dispatch & Real-Time Welcome**: Automatically identifies user first names from profiles/emails, triggering personalized, high-deliverability welcome and active status alerts.
- 🎨 **Minimalist & Distraction-Free UI**: Pure typography, high-contrast dark palette, zero promotional clutter, and fluid streaming markdown rendering.
- 🛡️ **Enterprise Multi-Tier Access**: Firebase Authentication with Pro Tier membership locks, daily message quotas, rate limiting, and an Admin Command Dashboard (`/admin`).

---

## 📱 PWA Mobile Experience (Add to Home Screen)

AbyssGPT delivers a first-class native app feel on mobile and desktop:

| Feature | Desktop Browser | Mobile PWA (Installed) |
| :--- | :---: | :---: |
| **Full-Screen Standalone** | Windowed Tab | 📱 Full Screen (No browser URL bar) |
| **Offline Shell Pre-Caching** | Standard Cache | ⚡ Service Worker (`sw.js`) Pre-cached |
| **Home Screen App Icon** | Bookmark | 🖼️ HD Maskable App Icon (192px & 512px) |
| **Launch Speed** | ~1.2s | ⚡ Instant (<200ms) |
| **Direct Install Prompts** | Chrome Omnibox | 📥 In-App 1-Click Install Modal |

### How to Install:
- **Android**: Tap the **⋮** menu in Chrome and choose **"Install app"** or use the in-app **"Install App"** button.
- **iOS (iPhone/iPad)**: Open in Safari, tap the **Share** button, and tap **"Add to Home Screen"**.

---

## 🏗️ System Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER (PWA)                            │
│  React 19 + TypeScript + Vite + Tailwind CSS                           │
│  • Service Worker (sw.js) Pre-cache   • Standalone PWA Manifest        │
│  • Firebase Auth Client               • Server-Sent Events (SSE) UI    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                         HTTPS & Secure SSE Stream
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                         BACKEND SERVER LAYER                           │
│  Node.js + Express 5 (Hosted on Render)                                │
│  • Token & Auth Guard Middleware       • Rate-Limiting Engine          │
│  • Dynamic Step Budget Scheduler       • Nodemailer SMTP Dispatcher    │
└──────────────┬────────────────────┬────────────────────┬───────────────┘
               │                    │                    │
┌──────────────▼───────┐ ┌──────────▼───────────┐ ┌──────▼──────────────┐
│  AI Credits Engine   │ │  Real-Time Services  │ │ Firebase Admin SDK  │
│  • Universal Model ID│ │  • Tavily Web Search │ │ • User Quotas & Roles│
│  • Function Calling  │ │  • Jina Markdown URL │ │ • Firestore Memory  │
│  • Stream Parser     │ │  • Daytona Sandbox   │ │ • Pro Tier Access   │
└──────────────────────┘ └──────────────────────┘ └─────────────────────┘
```

---

## 🛠️ Tool Suite & Autonomous Capabilities

AbyssGPT features an extensible agent execution engine:

- 🌐 **`web_search`**: Real-time live web facts, technical documentation, and news via Tavily.
- 📄 **`read_url`**: Parses any web page into contextual Markdown for research and citation via Jina Reader.
- 📝 **`file_write` / `file_read`**: File staging with automatic path sanitization and version safety.
- 💻 **`run_command` / `run_code`**: Isolated execution and testing in Daytona sandboxed environments.
- 🔄 **Self-Healing Error Correction**: Captures compiler stack traces, applies fixes, and re-verifies automatically.

---

## 🔐 Environment Configuration

Create a `.env` file in the root directory (refer to `.env.example`):

### 1. Server & AI Keys (Render Backend)
```env
PORT=3000
NODE_ENV=production
FRONTEND_URL=https://abyssgpt.vercel.app

# Universal AI Engine
AICREDITS_API_KEY=your_aicredits_key
MODEL_ID=your_model_identifier

# Search & Sandbox
TAVILY_API_KEY=your_tavily_key
DAYTONA_API_KEY=your_daytona_key

# Email Dispatcher (Gmail SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=bikashbindhani227@gmail.com
SMTP_PASS=your_16_digit_app_password
SMTP_FROM=AbyssGPT <bikashbindhani227@gmail.com>
SMTP_SECURE=true
```

### 2. Frontend Keys (Vercel)
```env
VITE_API_BASE_URL=https://abyssgpt-cb9k.onrender.com
VITE_FIREBASE_API_KEY=your_firebase_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

---

## 🚀 Quick Start (Local Setup)

```bash
# 1. Clone repository
git clone https://github.com/your-username/AbyssGPT.git
cd AbyssGPT

# 2. Install dependencies across all workspaces
npm install

# 3. Start Frontend & Backend concurrently
npm run dev
```

Visit `http://localhost:3000` to interact with AbyssGPT locally.

---

## 🚢 Deployment Guide

### Render (Backend API)
1. Link your repository on [Render](https://dashboard.render.com).
2. Set **Root Directory** to `backend`.
3. Set **Build Command** to `npm install && npm run build`.
4. Set **Start Command** to `npm start`.
5. Add the `SMTP_*`, `AICREDITS_*`, and Firebase environment variables.

### Vercel (Frontend SPA)
1. Link your repository on [Vercel](https://vercel.com).
2. Set **Root Directory** to `frontend`.
3. Set **Framework Preset** to `Vite`.
4. Add `VITE_API_BASE_URL` pointing to your Render backend.

---

## 👨‍💻 Author & Contact

<table border="0">
  <tr>
    <td width="95" align="center" valign="middle">
      <img src="./frontend/public/apple-touch-icon.png" alt="Bikash Bindhani" width="85" style="border-radius: 50%; box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);" />
    </td>
    <td>
      <b>Bikash Bindhani</b><br />
      <em>Creator & Lead Architect of AbyssGPT</em><br />
      💬 <b>Telegram:</b> <a href="https://t.me/MrNewton_2">@MrNewton_2</a><br />
      📧 <b>Email:</b> <a href="mailto:bikashbindhani227@gmail.com">bikashbindhani227@gmail.com</a><br />
      🌐 <b>Live Web:</b> <a href="https://abyssgpt.vercel.app">abyssgpt.vercel.app</a>
    </td>
  </tr>
</table>

---

<div align="center">
  <sub>Engineered with precision by <b>Bikash Bindhani</b> • Star ⭐ the repository if you find it helpful!</sub>
</div>
