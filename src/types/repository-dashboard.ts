export type RepositoryViewMode =
  | "workflows"
  | "deployments"
  | "branches"
  | "pullRequests";

export type WorkflowFilters = {
  excludeNoRuns: boolean;
  branch: string;
  runName: string;
  startDate?: string;
  endDate?: string;
};

export type BranchViewSettings = {
  visibility: "all" | "protected" | "unprotected";
  perPage: number;
  limit: number;
  name: string;
};

export type PullRequestViewSettings = {
  state: "open" | "closed" | "all";
  perPage: number;
  base: string;
  author: string;
};
