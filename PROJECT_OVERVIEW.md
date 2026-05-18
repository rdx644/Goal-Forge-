# GoalForge — Project Overview

---

## 1. Repository & Live URL

| | Link |
|---|---|
| **GitHub Repository** | https://github.com/rdx644/Goal-Forge- |
| **Live Hosted URL** | https://goal-forge-woad.vercel.app/ |

---

## 2. Architecture Diagram

> The diagram below illustrates the full system architecture of GoalForge.

![Architecture Diagram](https://github.com/user-attachments/assets/fdeadd15-7f9b-4e67-a1bf-1f3318a607c8)

### Architecture Explanation

GoalForge follows a **monolithic Next.js full-stack architecture** divided into four layers:

#### 🖥️ Frontend — Next.js App
The UI is a single Next.js application with four distinct page contexts served based on role:
- **Login Page** — Authenticates all users; supports Quick Login buttons for each role.
- **Employee Dashboard** — Goal creation, check-in logging, notification inbox.
- **Manager Dashboard** — Team goal review, approvals/returns, quarterly check-in comments, shared goal push.
- **Admin Dashboard** — Cycle management, user management, analytics, audit trail, escalation rules.

#### ⚡ API Layer — Next.js Route Handlers
All business logic is exposed via co-located API routes:

| Route | Purpose |
|---|---|
| `/api/auth/*` | Login, session verification via JWT |
| `/api/goals/*` | Goal CRUD, submit, approve/return, shared goals |
| `/api/checkins/*` | Quarterly achievement logging and manager comments |
| `/api/notifications/*` | In-app notification delivery |
| `/api/admin/*` | Performance cycles and user management |
| `/api/reports/*` | Analytics dashboard data and CSV export |
| `/api/escalation/*` | Escalation rule configuration |
| `/api/auth/sso/*` | Azure AD / Microsoft Entra ID single sign-on |

#### 🔧 Core Services
Internal service modules that the API routes delegate to:

- **Auth Service (JWT + bcrypt)** — Issues and validates stateless JWT tokens; hashes passwords with bcrypt; enforces Role-Based Access Control (RBAC) for Employee, Manager, and Admin roles.
- **Database Service (SQLite + better-sqlite3)** — Single-file embedded database; handles all reads/writes; zero external infrastructure cost.
- **Escalation Engine (Rule Evaluation)** — Evaluates configurable 3-level escalation rules; fires HR notifications when thresholds are breached.
- **Notification Engine (In-App)** — Writes notification records on goal submission, approval, return, shared goal push, and check-in feedback events.
- **Azure AD Module (SSO + Org Sync)** — Optional integration for enterprise single sign-on via Microsoft Entra ID.

#### 🗄️ Data Layer
- **`goalforge.db`** — A single SQLite file that persists all application data (users, goals, check-ins, notifications, audit logs, escalation rules).

#### 🌐 External Services (Optional Integrations)
| Service | Role |
|---|---|
| **SMTP Server** | Outbound email delivery for notifications |
| **MS Teams Incoming Webhook** | Push alerts into Microsoft Teams channels |
| **Microsoft Entra ID / Azure AD** | Enterprise SSO identity provider |

---

## 3. Login Credentials

![Login Credentials](https://github.com/user-attachments/assets/9896e91e-e437-4716-b48b-eb61148e0ab9)

| Role | Employee ID | Password | Access Level |
|---|---|---|---|
| **Employee** | `emp001` | `password123` | Create goals, submit sheets, log achievements, view notifications |
| **Manager** | `mgr001` | `password123` | Approve/return goals, quarterly check-ins, team overview |
| **Admin / HR** | `admin001` | `password123` | Full admin: cycles, users, escalation, reports, audit trail, integrations |

> 💡 **Quick Login**: The login page provides one-click **Quick Login** buttons for each role — no need to type credentials manually. Use these buttons to instantly switch between and explore all three user journeys.

---

## 4. Switching Between User Journeys

1. Open the live URL (or `http://localhost:3000` locally).
2. On the **Login Page**, click the **Quick Login** button for the role you want to explore:
   - **Employee** → Redirects to the Employee Dashboard
   - **Manager** → Redirects to the Manager Dashboard
   - **Admin** → Redirects to the Admin Dashboard
3. To switch roles, log out (top-right menu) and click a different Quick Login button.
