import { fetchGithubJson, GithubApiError } from "@/lib/github/client";

export type DeploymentStatusCategory = "success" | "failed" | "in_progress" | "unknown";

export interface DeploymentDetails {
  id: number;
  status: DeploymentStatusCategory;
  statusLabel: string;
  createdAt?: string;
  updatedAt?: string;
  commitSha?: string;
  commitMessage?: string;
  commitUrl?: string;
  initiatedBy?: string;
  targetUrl?: string;
}

export interface EnvironmentDeploymentSummary {
  environment: string;
  environmentUrl?: string;
  latestDeployment: DeploymentDetails | null;
}

interface GithubEnvironment {
  id: number;
  name: string;
  html_url?: string;
}

interface GithubEnvironmentsResponse {
  environments: GithubEnvironment[];
}

interface GithubDeployment {
  id: number;
  sha?: string;
  created_at?: string;
  updated_at?: string;
  statuses_url: string;
  environment: string;
  creator?: {
    login?: string;
  };
}

interface GithubDeploymentStatus {
  id: number;
  state?: string;
  created_at?: string;
  updated_at?: string;
  target_url?: string;
  description?: string;
  creator?: {
    login?: string;
  };
}

interface GithubCommitSummary {
  sha: string;
  html_url?: string;
  author?: {
    login?: string;
  };
  commit?: {
    message?: string;
    author?: {
      name?: string;
    };
  };
}

const STATUS_LABELS: Record<DeploymentStatusCategory, string> = {
  success: "Successful",
  failed: "Failed",
  in_progress: "In progress",
  unknown: "Unknown",
};

const mapDeploymentState = (state?: string): DeploymentStatusCategory => {
  if (!state) {
    return "unknown";
  }

  const normalized = state.toLowerCase();

  if (normalized === "success") {
    return "success";
  }

  if (["failure", "error", "cancelled", "timed_out", "inactive"].includes(normalized)) {
    return "failed";
  }

  if (["in_progress", "queued", "pending", "waiting"].includes(normalized)) {
    return "in_progress";
  }

  return "unknown";
};

const firstLine = (value?: string) => {
  if (!value) {
    return undefined;
  }

  const [line] = value.split("\n");
  return line.trim();
};

export const fetchRepositoryEnvironmentDeployments = async (
  organization: string,
  repository: string,
  signal?: AbortSignal
): Promise<EnvironmentDeploymentSummary[]> => {
  const encodedOrg = encodeURIComponent(organization);
  const encodedRepo = encodeURIComponent(repository);

  const environmentsResponse = await fetchGithubJson<GithubEnvironmentsResponse>({
    path: `/repos/${encodedOrg}/${encodedRepo}/environments`,
    signal,
  });

  const environments = environmentsResponse.environments ?? [];

  if (!environments.length) {
    return [];
  }

  const summaries = await Promise.all(
    environments.map(async (environment) => {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      const encodedEnvironment = encodeURIComponent(environment.name);

      let deployments: GithubDeployment[] = [];
      try {
        deployments = await fetchGithubJson<GithubDeployment[]>({
          path: `/repos/${encodedOrg}/${encodedRepo}/deployments?environment=${encodedEnvironment}&per_page=1`,
          signal,
        });
      } catch (error) {
        if (error instanceof GithubApiError && error.status === 404) {
          deployments = [];
        } else {
          throw error;
        }
      }

      const latestDeployment = deployments[0];

      if (!latestDeployment) {
        return {
          environment: environment.name,
          environmentUrl: environment.html_url,
          latestDeployment: null,
        } satisfies EnvironmentDeploymentSummary;
      }

      let statuses: GithubDeploymentStatus[] = [];
      try {
        statuses = await fetchGithubJson<GithubDeploymentStatus[]>({
          path: `/repos/${encodedOrg}/${encodedRepo}/deployments/${latestDeployment.id}/statuses?per_page=5`,
          signal,
        });
      } catch (error) {
        if (error instanceof GithubApiError && error.status === 404) {
          statuses = [];
        } else {
          throw error;
        }
      }

      const latestActiveStatus = statuses.find((status) =>
        status.state?.toLowerCase() !== "inactive"
      );
      const selectedStatus = latestActiveStatus ?? statuses[0];

      let commitSummary: GithubCommitSummary | undefined;
      if (latestDeployment.sha) {
        try {
          commitSummary = await fetchGithubJson<GithubCommitSummary>({
            path: `/repos/${encodedOrg}/${encodedRepo}/commits/${latestDeployment.sha}`,
            signal,
          });
        } catch (error) {
          if (error instanceof GithubApiError && error.status === 404) {
            commitSummary = undefined;
          } else {
            throw error;
          }
        }
      }

      const deploymentStatus = mapDeploymentState(selectedStatus?.state);

      const initiatedBy =
        selectedStatus?.creator?.login ??
        latestDeployment.creator?.login ??
        commitSummary?.author?.login ??
        commitSummary?.commit?.author?.name;

      const details: DeploymentDetails = {
        id: latestDeployment.id,
        status: deploymentStatus,
        statusLabel: selectedStatus?.state
          ? selectedStatus.state.replace(/_/g, " ")
          : STATUS_LABELS[deploymentStatus],
        createdAt: latestDeployment.created_at,
        updatedAt: selectedStatus?.updated_at ?? latestDeployment.updated_at,
        commitSha: latestDeployment.sha,
        commitMessage: firstLine(commitSummary?.commit?.message),
        commitUrl: commitSummary?.html_url,
        initiatedBy,
        targetUrl:
          selectedStatus?.target_url ?? environment.html_url ?? commitSummary?.html_url,
      };

      return {
        environment: environment.name,
        environmentUrl: environment.html_url,
        latestDeployment: details,
      } satisfies EnvironmentDeploymentSummary;
    })
  );

  return summaries.sort((a, b) => a.environment.localeCompare(b.environment));
};
