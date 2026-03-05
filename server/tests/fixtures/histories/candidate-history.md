# Professional History — Alex Chen

## Personal Summary

Mid-level full-stack software engineer with 5 years of professional experience. Individual contributor throughout career — no direct reports, no team leadership role. Works collaboratively within engineering teams. Strong at building web applications, integrating data pipelines for reporting, and shipping product features end-to-end.

## Skills

**Languages**: JavaScript (primary), TypeScript, HTML, CSS, SQL
**Frontend**: React (v16–v18), React Router, Redux Toolkit, Styled Components, Tailwind CSS
**Backend**: Node.js, Express.js, REST API design and implementation
**Databases**: PostgreSQL (primary), Redis (caching), basic MongoDB exposure
**Infrastructure**: Docker (containerization), AWS (S3 for storage, EC2 basics for deployment), Nginx (basic reverse proxy configuration)
**CI/CD**: GitHub Actions (build, test, deploy pipelines), basic familiarity with CircleCI
**Tooling**: Git, ESLint, Prettier, Jest, React Testing Library, Postman

**Explicit gaps (no experience)**:
- No Kubernetes or container orchestration
- No Terraform or any infrastructure-as-code tool
- No SRE work: no oncall rotations, no SLO/SLI/error budget management, no PagerDuty
- No Prometheus, Grafana, or production metrics infrastructure
- No machine learning: no PyTorch, TensorFlow, scikit-learn, or any ML framework
- No MLOps: no MLflow, Weights & Biases, or experiment tracking tools
- No Python used professionally (only JavaScript/TypeScript)
- No data engineering: no Spark, Airflow, or feature store tooling
- No team leadership: always individual contributor

---

## Employment History

### Startup: Loopline Technologies (2019–2021) — Junior Full-Stack Developer

**Company**: Loopline Technologies — a 15-person B2B SaaS startup building project management tooling.

**Duration**: 2 years (June 2019 – May 2021)

**Responsibilities and Achievements**:
- Built and maintained React frontend components for the project dashboard, collaborating with a designer and one other developer
- Developed REST API endpoints in Node.js/Express for task management features (create, update, assign, filter tasks)
- Designed and maintained PostgreSQL schemas for core product tables (users, projects, tasks, comments); wrote migrations using Knex.js
- Implemented file upload and storage integration with AWS S3 (profile images, project attachments)
- Contributed to reporting features: built dashboard charts using Chart.js displaying project completion rates and team velocity (no ML involved — pure aggregation queries)
- Set up basic GitHub Actions pipeline for linting and unit tests on pull requests
- Worked within a Scrum team of 5; attended standups, sprint reviews, retrospectives — no leadership role

**Technologies used**: React, Node.js, Express, PostgreSQL, AWS S3, GitHub Actions, Chart.js, Docker (local dev only), Git

---

### Scale-up: Meridian SaaS (2021–2024) — Mid-Level Full-Stack Developer

**Company**: Meridian SaaS — a 120-person B2B analytics platform for e-commerce clients.

**Duration**: 3 years (June 2021 – May 2024)

**Responsibilities and Achievements**:
- Developed and maintained TypeScript React frontend for client-facing analytics dashboards; the product served ~200 client companies
- Built REST APIs in Node.js/TypeScript for data querying, aggregation, and export (CSV, Excel reports)
- Optimized PostgreSQL query performance on large reporting tables (100M+ rows); reduced several dashboard query times through indexing and query restructuring
- Extended CI/CD pipeline using GitHub Actions: added automated integration tests, staging deployments to EC2, and Slack notifications on build failures
- Containerized the Node.js API service with Docker for consistent local and staging environments; worked with Docker Compose for multi-service local dev
- Contributed to data pipeline work: built ETL scripts in Node.js/TypeScript that ingested client data from CSV uploads and webhook events into PostgreSQL — no ML, no Python, pure data transformation
- Collaborated with 4–6 engineers per project; individual contributor, no direct reports
- Participated in on-call rotation once but purely for bug triage (not formal SRE oncall with SLOs or error budgets)

**Technologies used**: React, TypeScript, Node.js, PostgreSQL, Docker, GitHub Actions, AWS (S3, EC2), REST APIs, Redis (session caching)

---

## Education

**B.Sc. Computer Science** — Tel Aviv University, 2015–2019
Relevant coursework: Data Structures and Algorithms, Operating Systems, Databases, Software Engineering, Computer Networks

---

## Notable Gaps (for test fixture purposes)

The following are confirmed absences from Alex Chen's history — any CV claim about these must be flagged by the verifier:
- Kubernetes, Helm, container orchestration of any kind
- Terraform, Pulumi, or any IaC tool
- Prometheus, Grafana, Datadog, or observability tooling
- PagerDuty, VictorOps, or formal incident management platforms
- SLO/SLI definitions, error budgets, oncall scheduling
- Python used in any professional context
- PyTorch, TensorFlow, Keras, or any deep learning framework
- MLflow, Weights & Biases, DVC, or any MLOps platform
- Feature engineering, model training, experiment tracking
- Team lead, tech lead, engineering manager, or any people management role
- Leading a team (always collaborated as IC)
