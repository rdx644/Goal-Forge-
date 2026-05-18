# GoalForge Codebase Graph

This document graphifies the GoalForge Next.js codebase: application surfaces, API routes, shared libraries, database relationships, and the core BRD workflows.

## System Architecture

```mermaid
flowchart TB
  Browser[Web Browser] --> Login[app/page.js<br/>Login + quick role access]
  Browser --> Employee[app/dashboard/employee/page.js]
  Browser --> Manager[app/dashboard/manager/page.js]
  Browser --> Admin[app/dashboard/admin/page.js]

  Login --> AuthAPI[Auth API Routes]
  Employee --> GoalAPI[Goal API Routes]
  Employee --> CheckinAPI[Check-in API]
  Employee --> NotificationAPI[Notifications API]

  Manager --> GoalAPI
  Manager --> ApprovalAPI[Goal Approval API]
  Manager --> SharedAPI[Shared Goals API]
  Manager --> CheckinAPI
  Manager --> AdminUsersAPI[Users API]

  Admin --> AdminUsersAPI
  Admin --> CyclesAPI[Cycles API]
  Admin --> ReportsAPI[Reports API]
  Admin --> EscalationAPI[Escalation API]
  Admin --> NotificationAPI

  AuthAPI --> AuthLib[lib/auth.js]
  GoalAPI --> ValidationLib[lib/validation.js]
  ApprovalAPI --> ValidationLib
  CheckinAPI --> ScoringLib[lib/scoring.js]
  EscalationAPI --> EscalationLib[lib/escalation.js]
  EscalationLib --> NotificationsLib[lib/notifications.js]
  AuthAPI --> DbLib[lib/db.js]
  GoalAPI --> DbLib
  ApprovalAPI --> DbLib
  SharedAPI --> DbLib
  CheckinAPI --> DbLib
  AdminUsersAPI --> DbLib
  CyclesAPI --> DbLib
  ReportsAPI --> DbLib
  NotificationAPI --> DbLib

  DbLib --> SQLite[(data/goalforge.db<br/>SQLite)]
```

## Route Map

```mermaid
flowchart LR
  App[app/] --> PublicPage["/"]
  App --> EmployeePage["/dashboard/employee"]
  App --> ManagerPage["/dashboard/manager"]
  App --> AdminPage["/dashboard/admin"]
  App --> API["/api"]

  API --> Auth["auth/*"]
  Auth --> Login["POST /auth/login"]
  Auth --> Me["GET /auth/me"]
  Auth --> SSO["GET /auth/sso"]
  Auth --> SSOCallback["GET /auth/sso/callback"]

  API --> Goals["goals/*"]
  Goals --> GoalsBase["GET/POST /goals"]
  Goals --> Approve["POST /goals/approve"]
  Goals --> Shared["POST /goals/shared"]

  API --> Checkins["GET/POST /checkins"]
  API --> Notifications["GET/PUT /notifications"]
  API --> ThrustAreas["GET /thrust-areas"]

  API --> AdminAPI["admin/*"]
  AdminAPI --> Users["GET/POST /admin/users"]
  AdminAPI --> Cycles["GET/POST /admin/cycles"]

  API --> Reports["reports/*"]
  Reports --> Dashboard["GET /reports/dashboard"]
  Reports --> Achievement["GET /reports/achievement"]

  API --> Escalation["escalation/*"]
  Escalation --> RulesLogs["GET/POST /escalation"]
  Escalation --> Trigger["GET/POST /escalation/trigger"]
```

## Database ERD

```mermaid
erDiagram
  users ||--o{ users : manages
  users ||--o{ goal_sheets : owns
  users ||--o{ goal_sheets : approves
  users ||--o{ goals : shares
  users ||--o{ checkins : writes
  users ||--o{ audit_log : changes
  users ||--o{ notifications : receives
  users ||--o{ escalation_log : target

  cycles ||--o{ goal_sheets : contains
  thrust_areas ||--o{ goals : categorizes
  goal_sheets ||--o{ goals : contains
  goal_sheets ||--o{ checkins : has
  goals ||--o{ achievements : tracks
  goals ||--o{ goals : shared_from
  escalation_rules ||--o{ escalation_log : triggers

  users {
    int id PK
    text employee_id UK
    text name
    text email UK
    text role
    text department
    int manager_id FK
    int is_active
  }

  cycles {
    int id PK
    text name
    int year
    text goal_setting_start
    text goal_setting_end
    text q1_start
    text q1_end
    text q2_start
    text q2_end
    text q3_start
    text q3_end
    text q4_start
    text q4_end
    int is_active
  }

  goal_sheets {
    int id PK
    int employee_id FK
    int cycle_id FK
    text status
    text submitted_at
    text approved_at
    int approved_by FK
    text return_reason
    real total_weightage
  }

  goals {
    int id PK
    int goal_sheet_id FK
    int thrust_area_id FK
    text title
    text uom_type
    real target_value
    text target_date
    real weightage
    int is_shared
    int shared_from_goal_id FK
    int shared_by_user_id FK
  }

  achievements {
    int id PK
    int goal_id FK
    text quarter
    real actual_value
    text completion_date
    text status
    real progress_score
  }

  checkins {
    int id PK
    int goal_sheet_id FK
    text quarter
    int manager_id FK
    text comment
  }

  audit_log {
    int id PK
    text entity_type
    int entity_id
    text action
    text field_changed
    text old_value
    text new_value
    int changed_by FK
    text reason
  }

  notifications {
    int id PK
    int user_id FK
    text type
    text title
    text message
    text link
    int is_read
  }

  escalation_rules {
    int id PK
    text rule_name
    text trigger_condition
    int days_threshold
    int escalation_level
    int notify_employee
    int notify_manager
    int notify_hr
    int is_active
  }

  escalation_log {
    int id PK
    int rule_id FK
    int target_user_id FK
    int escalation_level
    text status
    text details
    text notified_users
    int resolved_by FK
    text resolution
  }
```

## Core Goal Lifecycle

```mermaid
stateDiagram-v2
  [*] --> draft: Employee creates sheet
  draft --> draft: Save draft
  draft --> submitted: Submit with validation
  returned --> submitted: Revise and resubmit
  submitted --> returned: Manager returns with comments
  submitted --> locked: Manager approves
  locked --> returned: Admin unlocks for exception/rework
  locked --> [*]: Check-ins and reporting

  note right of submitted
    Validation:
    total weightage = 100
    min goal weightage = 10
    max goals = 8
  end note

  note right of locked
    Goals are immutable unless
    Admin unlocks. Post-lock edits
    are written to audit_log.
  end note
```

## Role Workflows

```mermaid
flowchart TB
  subgraph Employee
    E1[Create/edit goals]
    E2[Select thrust area, UoM, target, weightage]
    E3[Save draft or submit]
    E4[Log quarterly achievements]
    E5[View notifications and manager feedback]
  end

  subgraph Manager
    M1[View team sheets]
    M2[Inline edit targets/weightage]
    M3[Approve and lock or return]
    M4[Push shared KPIs]
    M5[Add structured check-in comments]
  end

  subgraph AdminHR[Admin / HR]
    A1[Manage cycles]
    A2[Manage users and hierarchy]
    A3[Unlock locked sheets]
    A4[Review audit log]
    A5[Run escalation engine]
    A6[Export reports and view analytics]
  end

  E3 --> M1
  M3 --> E4
  M4 --> E1
  E4 --> M5
  A3 --> E1
  A5 --> E5
  A6 --> A4
```

## Shared KPI Flow

```mermaid
sequenceDiagram
  participant ManagerAdmin as Manager/Admin
  participant API as /api/goals/shared
  participant DB as SQLite
  participant Owner as Primary Owner
  participant Recipient as Linked Recipient

  ManagerAdmin->>API: Push shared KPI to employees
  API->>DB: Create owner goal
  API->>DB: Create linked shared goals
  API->>DB: Notify recipients
  Recipient->>DB: Adjust weightage only
  Owner->>DB: Log actual achievement
  DB->>DB: Sync achievement to linked goals
  Recipient->>DB: View synced actual/progress
```

## Quarterly Check-in Flow

```mermaid
sequenceDiagram
  participant Employee
  participant CheckinsAPI as /api/checkins
  participant Scoring as lib/scoring.js
  participant DB as SQLite
  participant Manager

  Employee->>CheckinsAPI: Submit actual, status, quarter
  CheckinsAPI->>DB: Verify sheet is approved/locked
  CheckinsAPI->>DB: Enforce quarter window
  CheckinsAPI->>Scoring: Compute progress score
  CheckinsAPI->>DB: Upsert achievement
  Manager->>CheckinsAPI: Add structured comment
  CheckinsAPI->>DB: Save check-in comment
  CheckinsAPI->>DB: Notify employee
```

## Library Dependency Graph

```mermaid
flowchart LR
  db[lib/db.js<br/>SQLite schema + connection]
  auth[lib/auth.js<br/>JWT, bcrypt, role guards]
  validation[lib/validation.js<br/>Goal sheet rules]
  scoring[lib/scoring.js<br/>UoM progress formulas]
  notifications[lib/notifications.js<br/>In-app, email, Teams]
  escalation[lib/escalation.js<br/>Rule engine]
  azure[lib/azure-ad.js<br/>Entra ID helpers]
  seed[lib/seed.js<br/>Demo data]

  seed --> db
  seed --> auth
  escalation --> notifications
  notifications --> ExternalIntegrations[SMTP / Teams webhook]
  azure --> Entra[Microsoft Entra ID]
```

## Feature-To-Code Matrix

| Requirement Area | Main Code |
|---|---|
| Login, JWT auth, RBAC | `app/api/auth/*`, `lib/auth.js`, `middleware.js` |
| Employee goal sheet creation | `app/dashboard/employee/page.js`, `app/api/goals/route.js` |
| Weightage and goal validation | `lib/validation.js`, `app/api/goals/route.js`, `app/api/goals/approve/route.js` |
| Manager approval and inline edits | `app/dashboard/manager/page.js`, `app/api/goals/approve/route.js` |
| Shared/cascaded goals | `app/api/goals/shared/route.js`, `app/api/checkins/route.js` |
| Quarterly achievements | `app/dashboard/employee/page.js`, `app/api/checkins/route.js`, `lib/scoring.js` |
| Manager check-in comments | `app/dashboard/manager/page.js`, `app/api/checkins/route.js` |
| Admin cycles/users/unlock | `app/dashboard/admin/page.js`, `app/api/admin/cycles/route.js`, `app/api/admin/users/route.js` |
| Reporting and CSV export | `app/api/reports/dashboard/route.js`, `app/api/reports/achievement/route.js` |
| Audit trail | `lib/db.js`, `app/api/goals/route.js`, `app/api/goals/approve/route.js`, `app/api/admin/users/route.js` |
| Escalation module | `lib/escalation.js`, `app/api/escalation/*` |
| Notifications, email, Teams | `lib/notifications.js`, `app/api/notifications/route.js` |
| Microsoft Entra ID SSO | `lib/azure-ad.js`, `app/api/auth/sso/*` |

## Deployment Shape

```mermaid
flowchart TB
  GitHub[GitHub Repository] --> Vercel[Vercel Project]
  Vercel --> Build[next build]
  Build --> App[Next.js App Router]
  App --> Serverless[API Route Functions]
  App --> Static[Static dashboard bundles]
  Serverless --> SQLite[(SQLite file in data/)]

  note1[For durable production data on Vercel,<br/>replace local SQLite storage with a hosted DB.]
  SQLite -. production caveat .-> note1
```

