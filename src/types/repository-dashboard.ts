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
  // Stale branch detection settings
  staleSearch?: {
    baseBranch: string;
    authorFilter?: string;
    daysOldThreshold: number;
    foundBranches?: {
      repository: string;
      branchName: string;
      branchUrl: string;
      author?: string;
      lastCommitDate?: string;
      lastCommitSha: string;
      baseBranch: string;
      aheadBy: number;
      behindBy: number;
    }[];
  };
};

export type PullRequestViewSettings = {
  state: "open" | "closed" | "all";
  perPage: number;
  base: string;
  author: string;
};
