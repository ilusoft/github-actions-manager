import yaml from "js-yaml";

import { fetchGithubJson, GithubApiError } from "@/lib/github/client";

type WorkflowDispatchInputs = Record<
  string,
  {
    description?: string;
    required?: boolean;
    default?: string;
    type?: "string" | "choice" | "boolean" | "environment" | "number";
    options?: string[];
  }
>;

interface WorkflowYaml {
  on?: {
    workflow_dispatch?: {
      inputs?: WorkflowDispatchInputs;
    };
  };
}

export interface WorkflowDispatchInputDefinition {
  id: string;
  label: string;
  description?: string;
  required: boolean;
  type: "string" | "choice" | "boolean" | "environment" | "number";
  options?: string[];
  defaultValue?: string;
}

interface WorkflowYamlResponse {
  content: string;
  encoding: string;
}

export const fetchWorkflowInputs = async (
  organization: string,
  repository: string,
  workflowPath: string,
  signal?: AbortSignal
): Promise<WorkflowDispatchInputDefinition[]> => {
  const encodedOrg = encodeURIComponent(organization);
  const encodedRepo = encodeURIComponent(repository);
  const encodedPath = encodeURIComponent(workflowPath);

  const response = await fetchGithubJson<WorkflowYamlResponse>({
    path: `/repos/${encodedOrg}/${encodedRepo}/contents/${encodedPath}`,
    signal,
  });

  if (!response?.content) {
    throw new GithubApiError("Workflow file content not found.", 404);
  }

  if (response.encoding !== "base64") {
    throw new GithubApiError("Unsupported workflow file encoding.", 415);
  }

  const decoded = decodeBase64(response.content);

  const parsed = yaml.load(decoded) as WorkflowYaml | null;
  const inputs = parsed?.on?.workflow_dispatch?.inputs ?? {};

  return Object.entries(inputs).map(([key, value]) => ({
    id: key,
    label: key,
    description: value.description,
    required: value.required ?? false,
    type: value.type ?? "string",
    options: value.options,
    defaultValue: value.default,
  }));
};

interface CreateWorkflowDispatchBody {
  ref: string;
  inputs?: Record<string, string>;
}

export const dispatchWorkflow = async (
  organization: string,
  repository: string,
  workflowId: number,
  ref: string,
  inputs?: Record<string, string>,
  signal?: AbortSignal
): Promise<void> => {
  const encodedOrg = encodeURIComponent(organization);
  const encodedRepo = encodeURIComponent(repository);

  await fetchGithubJson<void>({
    path: `/repos/${encodedOrg}/${encodedRepo}/actions/workflows/${workflowId}/dispatches`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref, inputs } as CreateWorkflowDispatchBody),
    signal,
  });
};

const decodeBase64 = (value: string): string => {
  if (typeof window !== "undefined" && typeof window.atob === "function") {
    return window.atob(value);
  }

  const nodeBuffer = (globalThis as {
    Buffer?: {
      from: (input: string, encoding: string) => { toString: (encoding: string) => string };
    };
  }).Buffer;

  if (nodeBuffer) {
    return nodeBuffer.from(value, "base64").toString("utf-8");
  }

  throw new GithubApiError("Unable to decode workflow file content.", 500);
};
