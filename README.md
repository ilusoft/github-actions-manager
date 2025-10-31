# GitHub Actions Manager

React + Vite application for exploring GitHub Actions workflows across repositories within a GitHub organization. This document tracks project rules, architecture decisions, and onboarding steps. Update it whenever new tooling or conventions are introduced.

## Stack Overview

- **Framework**: React 19 with TypeScript 5.9 (`src/` compiled by Vite 7).
- **Styling**: Tailwind CSS 3.4 with CSS variables, `tailwindcss-animate`, and shadcn/ui New York theme.
- **UI Components**: shadcn/ui via CLI (`components.json`), Radix UI primitives (`@radix-ui/react-*`), Lucide icons (`lucide-react`), `class-variance-authority`, `clsx`, and `tailwind-merge` utilities.
- **Data & GitHub integrations**: TanStack Query orchestrating GitHub REST calls, custom API client in `src/lib/github/client.ts`, `js-yaml` for parsing workflow files, and helper modules under `src/lib/github/`.
- **Tooling**: ESLint 9 (flat config in `eslint.config.js`), PostCSS, Vite dev server & build pipeline.

## Getting Started

- **Install dependencies**: `npm install`
- **Run locally**: `npm run dev`
- **Lint**: `npm run lint`
- **Preview production build**: `npm run preview` (after `npm run build`)

The app boots from `src/main.tsx`, renders `App.tsx`, and styles load from `src/index.css` (Tailwind entry point).

## Using the Application

1. **Authenticate with GitHub**

   - Open the _Access Token_ dialog from the header to provide a personal access token (PAT).
   - Only the presence of a token is stored in React state; the raw token persists in `localStorage` and is never shown in the UI.
   - Clearing the token invalidates cached GitHub queries so the UI stays consistent across tabs.

2. **Choose monitoring scope**

   - The _Organization & Repository Selector_ loads organizations tied to the PAT and lists repositories for the selected organization.
   - Repositories persist in `localStorage`, and you can enable/disable entries, filter by name, reorder the list, or reset the scope entirely.

3. **Explore workflow health**

- The _Repository Workflow Dashboard_ fetches workflows for each monitored repository and summarizes their most recent runs.
- Filter runs by branch, date range, or run title, and hide workflows without recent activity to focus on active pipelines.
- Open the _Workflow Details_ dialog for per-run metadata, timestamps, and quick links back to GitHub.

4. **Track deployments across environments**

- Switch the dashboard view to **Deployments** to open the _Repository Deployment Grid_. Each repository renders a column per detected GitHub environment with the latest non-`inactive` deployment status highlighted in the cell color.
- Cells show a quick status label, updated timestamp, initiating actor, and truncated commit message (hover to view the full value). The “History” link opens the GitHub deployment history for the repository/environment pair.
- Use **Customize columns** to hide or reorder environments. Preferences persist to `localStorage` per-organization, and controls stay responsive even after reordering. Click **Reset** to restore defaults.

5. **Run bulk automation**

- **Bulk Branch Dialog**: create a new branch across all selected repositories from a shared base ref.
- **Bulk PR Dialog**: open matching pull requests across repositories with a shared title, description, and source/target branches.
- **Bulk Workflow Run Dialog**: dispatch multiple workflow runs in parallel across selected repositories.
  - **Multi-select workflows**: Choose one or more workflows from all available workflows across selected repositories. Workflows are displayed in the format "{repository} - {workflow name}" and you can select multiple workflows to run simultaneously (no longer limited to workflows common to all repositories).
  - **Aggregated input handling**: Automatically combines inputs from all selected workflows, showing which workflows require each input and allowing you to provide values that apply to all relevant workflows.
  - **Input caching**: Avoids redundant API calls when switching between workflow selections and rehydrates inputs from previous runs to minimise typing.
  - **Per-workflow payload filtering**: Dispatch requests only include inputs that the target workflow file supports, preventing 422 errors from unexpected parameters.
  - **Enhanced progress tracking**: Shows repository and workflow name for each dispatch operation with real-time status updates and links back to the created runs.
  - **Dialog layout parity**: Dialog height is constrained to 80% of the viewport with a scrollable body, aligning with the other bulk dialogs for consistent ergonomics.
- Each action surfaces repository-level progress, success/error statuses, and direct links to resulting GitHub resources.

6. **Bulk Branch View**

- We can delete branches across all selected repositories using the **Bulk Branch View**.

7. **Review pull requests before merging**

- The **Pull Requests** dashboard view surfaces repository PRs with mergeability context derived from GitHub.
- **Mergeable status badges**: Each PR entry now indicates whether it is mergeable, has conflicts, is blocked, or has failing checks. Unknown states render a neutral badge while GitHub computes mergeability.
- **Auto refresh controls**: Use the toolbar toggle to enable 60-second auto refreshes for the active dashboard view; disable it to remain on-demand.

> **Maintenance reminder:** Update this usage section whenever features are added, modified, or removed.

## Project Structure

- **`src/components/ui/`**: shadcn/ui components (e.g., `button.tsx`). Always generate via CLI.
- **`src/components/`**: custom application components (composed from `ui/`).
- **`src/components/bulk-workflow-run-dialog.tsx`**: Multi-select workflow dispatch dialog with aggregated input handling, caching, and real-time progress tracking.
- **`src/components/repository-dashboard-toolbar.tsx`**: View mode tabs with an auto-refresh toggle that drives 60-second background refresh intervals.
- **`src/components/repository-pull-request-tree.tsx`**: Repository grouped PR listing with mergeability badges, selection handling, and memoised TanStack Query integration.
- **`src/components/repository-deployment-grid.tsx`**: Environment grid that visualizes the latest deployment per repository/environment, supports column customization, and links to GitHub history pages.
- **`src/lib/`**: utilities such as `utils.ts` exposing `cn()`.
- **`src/hooks/`**: application hooks (e.g., `useGithubAccessToken()` for token state, `useOrganizationRepositorySelection()` for monitoring scope persistence).
- **`src/hooks/useDeploymentGridPreferences.ts`**: Persists deployment grid column order and visibility in `localStorage` and syncs changes across tabs.
- **`components.json`**: shadcn/ui CLI configuration (style, aliases, registry).
- **`tailwind.config.ts`**: Tailwind theme tokens, container defaults, animation primitives.
- **`tsconfig.app.json` & `tsconfig.json`**: TypeScript compiler options, `@/*` path alias.
- **`public/`**: static assets served as-is.

## Architecture & Conventions

- **Component-driven**: Keep layout primitives (e.g., `App.tsx`) thin. Build reusable pieces in `src/components`. Keep UI-only logic inside `ui/` components; business logic lives in feature modules under `src/features/` when they are introduced.
- **Imports**: Use the `@/*` alias instead of relative paths (`@/components/ui/button`). Configure new tsconfig references if additional packages require type-aware linting.
- **Styling**: Follow the CSS variables defined in `src/index.css`. Apply theme tokens using Tailwind utility classes. Prefer `cn()` helper for conditional class composition.
- **State & Data**: TanStack Query (React Query) is the standard data layer—use `QueryClientProvider` (configured in `src/main.tsx`) and colocated hooks for GitHub interactions. `src/hooks/githubQueries.ts` centralizes query hooks and reusable fetch helpers.
- **GitHub API client**: `src/lib/github/client.ts` handles authenticated REST calls, common headers, and error propagation (`GithubApiError`).
- **Workflow helpers**: `src/lib/github/workflows.ts` fetches workflow YAML, parses it with `js-yaml`, and exposes helpers for dispatching workflow runs.
- **Access Tokens**: `useGithubAccessToken()` stores only a `hasToken` flag in React state while persisting the actual PAT in `localStorage`. Tokens are write-only (never surfaced back to the UI). Clearing the token removes it from storage and broadcasts a custom event for cross-tab sync.
- **Monitoring Scope**: `OrgRepoSelector` with `useOrganizationRepositorySelection()` captures the target organization and repositories. Changes persist in `localStorage`, support toggling per-repo monitoring, and offer global reset actions. Treat this as the single source of truth for downstream data fetching.
- **Deployment visibility**: `RepositoryDeploymentGrid` composes TanStack Query results with persisted preferences (`useDeploymentGridPreferences`) to show environment health at-a-glance, ignoring `inactive` statuses so long-lived environments stay meaningful.
- **Dashboard orchestration**: `RepositoryWorkflowDashboard` coordinates repository-level workflow summaries, bulk dialogs (`bulk-branch-dialog`, `bulk-pr-dialog`, `bulk-workflow-run-dialog`), and detailed views (`workflow-details-dialog`). The bulk workflow dialog supports multi-select workflow dispatch with aggregated input handling and caching.
- **Auto refresh pattern**: `RepositoryDashboardToolbar` exposes a push/pull toggle that stores auto-refresh state locally, triggers an immediate refresh when enabled, and sets a single interval in `useEffect` to avoid duplicate timers.
- **Mergeability enrichment**: `fetchRepositoryPullRequests` hydrates open PRs with detail responses (mergeable flags and `mergeable_state`) so UI components can render actionable badges.
- **Per-workflow input hygiene**: Workflow dispatches build payloads per repository/workflow using cached definitions to avoid sending extraneous keys.
- **Future routing**: Currently single-page. When routing is required, adopt `react-router-dom` and record the decision in this README.
- **Testing**: Testing stack not yet configured. When added (e.g., Vitest, Testing Library), document commands and directory layout.

### Architecture Overview

1. **Bootstrap**: `src/main.tsx` mounts `App.tsx`, wraps the tree in `QueryClientProvider`, and loads shared Tailwind styles.
2. **Authentication**: `App.tsx` renders `AccessTokenDialog`, powered by `useGithubAccessToken()`, to capture a personal access token and invalidate GitHub queries on change.
3. **Scope selection**: `OrgRepoSelector` consumes TanStack Query hooks (`useViewerOrganizations`, `useOrganizationRepositories`) and `useOrganizationRepositorySelection()` to persist the organization/repository scope.
4. **Dashboards**: `RepositoryWorkflowDashboard` fetches workflow summaries (`useRepositoryWorkflows`, `useWorkflowRuns`) and exposes bulk actions for branches, pull requests, and workflow dispatches.
5. **Workflow orchestration**: Bulk workflow operations rely on helpers in `src/lib/github/workflows.ts` and `src/hooks/githubQueries.ts` to normalize filters, parse workflow YAML, and dispatch runs with consistent error handling. The bulk workflow run dialog aggregates unique workflows across all selected repositories, supports multi-selection with input caching, and provides real-time progress tracking per repository-workflow combination.
6. **Pull request insights**: `RepositoryPullRequestTree` combines cached summaries with detailed mergeability states so the UI can display badges and disable bulk merges when conflicts are detected. Auto-refresh invalidates only the relevant query keys per view mode.

### Pattern Reference

- **Stable derived collections**: Prefer `useMemo` with primitive dependency keys (e.g., sorted ID joins) or `useRef` caches when building derived arrays such as workflow selections. This prevents render loops when effects depend on the derived data.
- **Cache-first data hydration**: Reuse `workflowInputCacheRef` to avoid redundant GitHub fetches while keeping TanStack Query as the source of truth for server data.
- **Effect-scoped intervals**: When introducing auto-refresh, declare intervals inside `useEffect`, run an immediate refresh to seed state, and always clear the interval in the cleanup function.
- **Per-item status tracking**: Store action statuses in keyed maps/arrays so UI surfaces unique progress indicators (e.g., bulk workflow dispatch, bulk PR merges).
- **Viewport constrained dialogs**: Bulk dialogs share the same 80vh layout recipe (fixed header & footer, scrollable middle region) to guarantee consistent interaction patterns.

### Components Dependency Diagram

```mermaid
graph TD
  App[App.tsx] --> AccessTokenDialog
  App --> OrgRepoSelector
  App --> RepositoryWorkflowDashboard

  OrgRepoSelector --> useViewerOrganizations
  OrgRepoSelector --> useOrganizationRepositories
  OrgRepoSelector --> useOrganizationRepositorySelection

  RepositoryWorkflowDashboard --> RepositoryDashboardToolbar
  RepositoryWorkflowDashboard --> RepositoryDashboardViewContent
  RepositoryWorkflowDashboard --> WorkflowFiltersCard
  RepositoryWorkflowDashboard --> BranchSettingsCard
  RepositoryWorkflowDashboard --> PullRequestFiltersCard
  RepositoryWorkflowDashboard --> BulkBranchDialog
  RepositoryWorkflowDashboard --> BulkBranchDeleteDialog
  RepositoryWorkflowDashboard --> BulkPrDialog
  RepositoryWorkflowDashboard --> BulkWorkflowRunDialog
  RepositoryWorkflowDashboard --> WorkflowDetailsDialog
  RepositoryWorkflowDashboard --> useWorkflowDashboardData

  RepositoryDashboardToolbar --> AutoRefreshToggle[Auto-refresh toggle]

  RepositoryDashboardViewContent --> RepositoryDeploymentGrid
  RepositoryDashboardViewContent --> RepositoryBranchTree
  RepositoryDashboardViewContent --> RepositoryPullRequestTree
  RepositoryDashboardViewContent --> WorkflowPill[Workflow pill list]

  RepositoryDeploymentGrid --> fetchRepositoryDeployments
  RepositoryBranchTree --> fetchRepositoryBranches
  RepositoryPullRequestTree --> fetchRepositoryPullRequests

  useWorkflowDashboardData --> fetchRepositoryWorkflows
  useWorkflowDashboardData --> fetchRepositoryDeployments
  useWorkflowDashboardData --> fetchRepositoryPullRequests

  fetchRepositoryWorkflows --> fetchWorkflowRuns
  fetchRepositoryPullRequests --> fetchGithubJson
  fetchRepositoryDeployments --> fetchGithubJson
  fetchWorkflowRuns --> fetchGithubJson
  BulkBranchDialog --> createRepositoryBranch
  BulkBranchDeleteDialog --> deleteRepositoryBranch
  BulkPrDialog --> createRepositoryPullRequest
  BulkWorkflowRunDialog --> fetchWorkflowInputs
  BulkWorkflowRunDialog --> dispatchWorkflow
  dispatchWorkflow --> fetchGithubJson
  createRepositoryBranch --> fetchGithubJson
  deleteRepositoryBranch --> fetchGithubJson
  createRepositoryPullRequest --> fetchGithubJson
  fetchWorkflowInputs --> fetchGithubContent
  WorkflowDetailsDialog --> filterWorkflowByRunName
  AutoRefreshToggle --> handleRefreshInterval

  fetchGithubJson --> GithubAPI[(GitHub REST API)]
  fetchGithubContent --> GithubAPI
```

## Tailwind & shadcn Guidelines

- Tailwind scans `index.html` and `src/**/*.{ts,tsx}` for class usage (`tailwind.config.ts`). Update the glob if we introduce MDX or other templates.
- All new components from shadcn/ui must be added via CLI: `npx shadcn@latest add <component>`. The CLI keeps `components.json` and Tailwind tokens synchronized.
- Dark mode toggles via the `class` strategy; apply the `dark` class on `<html>` (future layout component should manage this).

## GitHub Integration Roadmap

- **Authentication**: Personal access token (PAT) for now. Future tasks will introduce OAuth App flow and secure token storage.
- **Token capture**: Launch the access-token dialog from the header. The dialog saves tokens to `localStorage` under an application-specific key, hides the value after submission, and offers a "Clear stored token" action. Document required scopes alongside future API integrations.
- **Data Access**: Plan to wrap GitHub REST and GraphQL APIs in typed clients under `src/lib/github/` with caching.
- **Permissions**: Document required PAT scopes (likely `repo`, `workflow`, `actions:read`) when implemented.

## Deployment Considerations

- Ensure environment variables use Vite `import.meta.env` conventions (`VITE_*`). Document each variable here as they are added.
- Build output served via static hosting (e.g., GitHub Pages, Netlify). Add deployment steps once selected.

## Maintenance Notes

- Keep dependencies up to date. When bumping major versions, capture breaking changes in this file.
- Any new linting or formatting rules must be described here along with expected CI checks.
- Update this README whenever we introduce tooling, architectural patterns, or operational processes.

### Recent Changes (October 2025)

- **Auto refresh toolbar**: Added an auto-refresh toggle to `RepositoryDashboardToolbar` that triggers minute-based refresh intervals and indicates the active state.
- **Mergeability indicators**: `fetchRepositoryPullRequests` now fetches detailed PR metadata so `RepositoryPullRequestTree` can render mergeable/conflict badges.
- **Bulk workflow hardening**: The run dialog filters per-workflow inputs, persists cached definitions, and shares the 80vh layout used by other bulk dialogs.
- **Selection stability**: `selectedWorkflows` derives from memoised data + refs to avoid infinite render loops while keeping progress tracking accurate.
- **UI parity tweaks**: Adjusted bulk dialogs to share consistent header/footer sizing and ensured progress panes remain scrollable.
