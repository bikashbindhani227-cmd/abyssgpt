<div align="center">

  <a href="https://abyssgpt.vercel.app" target="_blank" rel="noopener noreferrer">
    <img src="./assets/logo.svg" alt="AbyssGPT Logo" width="140" height="140" style="filter: drop-shadow(0 0 25px rgba(59, 130, 246, 0.45));" />
  </a>

  # ⚡ AbyssGPT
  
  ### 🌌 *Autonomous General-Purpose Software Engineering & Full-Stack AI Agent*

  <p align="center">
    <a href="https://abyssgpt.vercel.app"><img src="https://img.shields.io/badge/Frontend-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel"></a>
    <a href="https://abyssgpt-cb9k.onrender.com/health"><img src="https://img.shields.io/badge/Backend-Render-46E3B7?style=for-the-badge&logo=render&logoColor=white" alt="Render"></a>
    <a href="https://api.aicredits.in"><img src="https://img.shields.io/badge/AI_Engine-AI_Credits-7c3aed?style=for-the-badge&logo=openai&logoColor=white" alt="AI Credits"></a>
    <a href="https://firebase.google.com"><img src="https://img.shields.io/badge/Auth_%26_DB-Firebase-FFA611?style=for-the-badge&logo=firebase&logoColor=black" alt="Firebase"></a>
    <a href="https://www.daytona.io"><img src="https://img.shields.io/badge/Sandbox-Daytona-0ea5e9?style=for-the-badge&logo=docker&logoColor=white" alt="Daytona"></a>
    <a href="https://t.me/MrNewton_2"><img src="https://img.shields.io/badge/Support-Telegram-229ED9?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram"></a>
    <img src="https://img.shields.io/badge/License-MIT-3b82f6?style=for-the-badge" alt="License">
  </p>

  <p align="center">
    <a href="https://abyssgpt.vercel.app"><b>🌐 Live Application</b></a> •
    <a href="https://abyssgpt-cb9k.onrender.com/health"><b>🩺 Backend Health</b></a> •
    <a href="#-capabilities--project-types"><b>🛠️ Capabilities</b></a> •
    <a href="#-the-engineering-lifecycle"><b>🔄 Lifecycle Loop</b></a> •
    <a href="#-system-architecture"><b>🏗️ Architecture</b></a> •
    <a href="#-quick-start"><b>🚀 Quick Start</b></a> •
    <a href="#-deployment-guide"><b>🚢 Deployment</b></a>
  </p>

  <br />

  <a href="https://abyssgpt.vercel.app" target="_blank">
    <img src="./assets/banner.png" alt="AbyssGPT Interface Preview" width="100%" style="border-radius: 14px; border: 1px solid #1f2937; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7);" />
  </a>

</div>

<br />

---

## 🌌 Overview

**AbyssGPT** is a next-generation, general-purpose software engineering and autonomous AI agent platform. Engineered from the ground up to transcend simple single-turn chatbots, AbyssGPT plans, structures, writes, executes, tests, and auto-repairs full-scale software solutions directly inside sandboxed developer environments.

Whether you need a full-stack web application, a production REST or GraphQL API, an asynchronous automation bot, a CLI developer tool, or complex database migrations — AbyssGPT dynamically plans the architecture, generates clean modular code, runs tests, observes runtime errors, and iterates until the solution is rock solid.

### 🎯 Strict Architectural Principles
- **Domain Agnostic**: Zero hardcoded niches. Every project type (e-commerce, SaaS, bots, dashboards, APIs, developer tools) is treated with native first-class engineering discipline.
- **Model Agnostic**: Driven dynamically via `MODEL_ID` with normalized function calling, intelligent JSON repair, and fault-tolerant streaming.
- **Closed-Loop Self-Healing**: Automated `Plan -> Implement -> Sandbox Test -> Error Capture -> Fix -> Verification` execution cycle.
- **Strict Server-Side Safety**: Hard server ceilings on token usage, execution time, and step budgets ensure zero runaway loops or leaked secrets.

---

## 🛠️ Capabilities & Project Types

AbyssGPT adapts its engineering strategy based on your exact specifications:

| Domain | Supported Systems & Stacks | Key Capabilities |
| :--- | :--- | :--- |
| 🌐 **Full-Stack & Web Apps** | React, Vite, Next.js, Node.js, Express, Tailwind CSS | Multi-page apps, responsive UI, state managers, server-side APIs, client-side routing |
| 💼 **SaaS & Admin Dashboards** | Full-stack TypeScript/Python, SQLite, PostgreSQL | Analytics charts, role-based access control, tabular reporting, audit logging |
| ⚡ **APIs & Microservices** | Fastify, Express, FastAPI, Flask, GraphQL, REST | Schema design, input validation (Zod/Pydantic), token authentication, middleware |
| 🤖 **Bots & Automation** | Telegram Bots, Discord Bots, Cron Workers, Webhook Handlers | Long polling, interactive keyboards, command routing, rate limiting |
| 💻 **CLI & Developer Tools** | Node.js (Commander/Yargs), Python (Click/Argparse), Bash | ANSI formatting, config management, pipeline batch processing, file transforms |
| 🗄️ **Database & Persistence** | PostgreSQL, SQLite, Prisma, Drizzle, Firestore | Relational schema migrations, indexing, relational joins, ACID transactions |
| 🛡️ **Auth & Payment Flows** | Firebase Auth, JWT, OAuth2, Stripe, PayPal | Session tokens, email/password, webhooks, protected route guards |
| 🧪 **Refactoring & Debugging** | Multi-language syntax & runtime triage | Traceback extraction, unit testing, memory leak diagnosis, test-driven fixing |

---

## 🔄 The Engineering Lifecycle (Plan • Implement • Test • Fix)

AbyssGPT approaches engineering tasks with structured, iterative workflows:

```text
  ┌──────────────────┐
  │   User Prompt    │ ───► Categorization & Dynamic Budgeting
  └────────┬─────────┘
           │
           ▼
  ┌────────────────────────────────────────────────────────┐
  │ 1. ARCHITECT & PLAN                                    │
  │    • Define file manifest (filesPlanned)               │
  │    • Select frameworks, dependencies, and structure    │
  └────────┬───────────────────────────────────────────────┘
           │
           ▼
  ┌────────────────────────────────────────────────────────┐
  │ 2. IMPLEMENT & STAGE                                   │
  │    • Write clean, production-ready source files        │
  │    • Maintain state in Authoritative Project Manager   │
  └────────┬───────────────────────────────────────────────┘
           │
           ▼
  ┌────────────────────────────────────────────────────────┐
  │ 3. SANDBOX EXECUTION & TESTING                         │
  │    • Run commands, unit tests, and syntax validations  │
  │    • Isolated execution in Daytona Cloud Sandbox       │
  └────────┬───────────────────────────────────────────────┘
           │
           ├────────────────────────────┐
           ▼ (Errors Detected)          ▼ (All Tests Pass)
  ┌─────────────────────────────┐   ┌─────────────────────────────┐
  │ 4. SELF-HEALING FIX LOOP    │   │ 5. VERIFICATION & ANSWER    │
  │    • Capture stack traces   │   │    • Finalize deliverables  │
  │    • Re-write failing code  │   │    • Stream complete summary│
  │    • Re-execute verification│   │    • Deliver artifacts      │
  └────────┬────────────────────┘   └─────────────────────────────┘
           │ (Loop until green)
           └────────────────────────────┘
```

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
                     ┌────────────────────┘               └────────────────────┐
                     ▼                                                         ▼
      ┌─────────────────────────────┐                           ┌─────────────────────────────┐
      │     Firebase Admin SDK      │                           │  Engineering Orchestrator   │
      │  • User Profiles & Roles    │                           │  • Task Classifier          │
      │  • Quotas & Rate Limits     │                           │  • Project State Manager    │
      │  • Security Rules Guard     │                           │  • Budget Tracker & Ceilings│
      └─────────────────────────────┘                           └──────────────┬──────────────┘
                                                                               │
                                            ┌──────────────────────────────────┼──────────────────────────────────┐
                                            ▼                                  ▼                                  ▼
                             ┌─────────────────────────────┐    ┌─────────────────────────────┐    ┌─────────────────────────────┐
                             │      AI Credits Engine      │    │     Internet Grounding      │    │      Daytona Sandbox        │
                             │  • MODEL_ID (Universal)     │    │  • Tavily Web Search        │    │  • Command Execution        │
                             │  • SSE Chunk Streaming      │    │  • Jina Reader (URLs)       │    │  • Python/Node Sandboxing   │
                             │  • Tool Call Repair Engine  │    │  • Live Fact Extraction     │    │  • File Staging & Test Run  │
                             └─────────────────────────────┘    └─────────────────────────────┘    └─────────────────────────────┘
```

---

## ⚡ Tool Suite

AbyssGPT equips the model with a versatile toolchain:

- 📝 **`file_write`**: Writes complete, production-ready files with automatic path sanitization and version tracking.
- 📖 **`file_read`**: Reads project files to inspect dependencies, existing logic, or configuration.
- 💻 **`run_command`**: Executes shell commands and test runners inside the Daytona cloud sandbox.
- ⚡ **`run_code`**: Evaluates Python, JavaScript, and TypeScript blocks with strict timeout limits.
- 📊 **`project_state`**: Retrieves or updates the active engineering plan, file manifest, and error traces.
- 🌐 **`web_search`**: Live web search powered by Tavily for documentation and real-time facts.
- 📄 **`read_url`**: Extracts clean, contextual Markdown from external URLs via Jina Reader.

---

## ⚙️ Resource Budgets & Auto-Scaling

Resource quotas scale dynamically based on request classification:

| Parameter | Simple Query | Current Info | Deep Research | Software Engineering |
| :--- | :---: | :---: | :---: | :---: |
| **Max Agent Steps** | 2 | 4 | 9 | 10 |
| **Max Tool Calls** | 2 | 5 | 12 | 14 |
| **Max Tool Output** | 12 KB | 20 KB | 30 KB | 40 KB |
| **Per-Tool Timeout** | 10s | 15s | 25s | 35s |
| **Total Request Timeout** | 45s | 80s | 150s | 180s |
| **Code Exec Duration** | 0s | 15s | 30s | 60s |
| **Anti-Loop Protection** | Enabled | Enabled | Enabled | Enabled |

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- **Node.js**: `v20.0.0` or higher
- **npm**: `v10.0.0` or higher

### 2. Clone and Install
```bash
git clone https://github.com/your-username/AbyssGPT.git
cd AbyssGPT

# Install all workspace dependencies
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in your API keys:
- `AICREDITS_API_KEY`: Your AI Credits engine key
- `MODEL_ID`: Your selected universal model ID
- `DAYTONA_API_KEY`: Optional Daytona cloud sandbox key
- `TAVILY_API_KEY`: Optional live web search key
- `FIREBASE_*`: Firebase project credentials

### 4. Run Development Server
```bash
# Starts both frontend (port 3000) and backend concurrently
npm run dev
```
Open **`http://localhost:3000`** in your browser.

### 5. Running Verification & Tests
```bash
# Run unit and integration test suite (86 passing tests)
npm test

# Run frontend TypeScript validation
npm run lint
```

---

## 🚢 Production Deployment Guide

AbyssGPT is pre-configured for **Render (Backend)** + **Vercel (Frontend)**:

### 1. Render Backend Setup
1. Create a new **Web Service** on [Render](https://render.com).
2. Root Directory: `backend` *(Critical: must be `backend`, not root)*.
3. Build Command: `npm install && npm run build`
4. Start Command: `npm start`
5. Health Check Path: `/health`

### 2. Vercel Frontend Setup
1. Create a new project on [Vercel](https://vercel.com).
2. Root Directory: `frontend` *(Critical: must be `frontend`)*.
3. Framework Preset: `Vite`.
4. Build Command: `npm run build`
5. Output Directory: `dist`.
6. Set `VITE_API_BASE_URL` to your Render backend URL.

---

## 🛡️ Admin Control Center

Accessible directly at `/admin` for authorized administrators:
- 📊 **Real-Time Analytics**: Total users, daily message volume, token usage.
- 👥 **User Management**: Ban/unban users, reset daily quotas, search by email.
- 💎 **Premium Management**: Grant, extend, or revoke Pro tier memberships.
- ⚙️ **Dynamic System Settings**: Live update system prompts, toggle maintenance mode.

---

## 👨‍💻 Author & Support

<table border="0">
  <tr>
    <td width="95" align="center" valign="middle">
      <img src="./assets/logo.png" alt="Bikash Bindhani" width="85" style="border-radius: 50%; box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4);" />
    </td>
    <td>
      <b>Bikash Bindhani</b><br />
      <em>Lead Architect & Creator of AbyssGPT</em><br />
      💬 <b>Telegram:</b> <a href="https://t.me/MrNewton_2">@MrNewton_2</a><br />
      📧 <b>Email:</b> <a href="mailto:bikashbindhani227@gmail.com">bikashbindhani227@gmail.com</a><br />
      🌐 <b>Live Web:</b> <a href="https://abyssgpt.vercel.app">abyssgpt.vercel.app</a>
    </td>
  </tr>
</table>

---

<div align="center">
  <sub>Engineered with precision by Bikash Bindhani • Powered by AI Credits • Star ⭐ the repository if you love it!</sub>
</div>
