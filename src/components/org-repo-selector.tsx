import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { RepositoryWorkflowDashboard } from "@/components/repository-workflow-dashboard"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useOrganizationRepositories, useViewerOrganizations } from "@/hooks/githubQueries"
import { useOrganizationRepositorySelection } from "@/hooks/useOrganizationRepositorySelection"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { HelpCircle, Plus } from "lucide-react"

export function OrgRepoSelector() {
  const {
    organization,
    repositories,
    selectedRepositories,
    setOrganization,
    addRepository,
    toggleRepository,
    removeRepository,
    clearAll,
    reorderRepositories,
  } = useOrganizationRepositorySelection()

  const [selectedRepoOption, setSelectedRepoOption] = useState<string | undefined>(undefined)
  const [repoFilter, setRepoFilter] = useState("")
  const [repoSelectOpen, setRepoSelectOpen] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const filterInputRef = useRef<HTMLInputElement | null>(null)

  const organizationsQuery = useViewerOrganizations()
  const reposQuery = useOrganizationRepositories(organization)

  const availableRepositories = useMemo(() => {
    const repos = reposQuery.data ?? []
    return [...repos].sort((a, b) => a.name.localeCompare(b.name))
  }, [reposQuery.data])
  const selectableRepos = useMemo(
    () =>
      availableRepositories.filter(
        (repo) => !repositories.some((item) => item.name.toLowerCase() === repo.name.toLowerCase())
      ),
    [availableRepositories, repositories]
  )

  const filteredRepos = useMemo(() => {
    const normalized = repoFilter.trim().toLowerCase()
    if (!normalized) {
      return selectableRepos
    }

    return selectableRepos.filter((repo) => repo.name.toLowerCase().includes(normalized))
  }, [repoFilter, selectableRepos])

  useEffect(() => {
    if (repoSelectOpen) {
      requestAnimationFrame(() => filterInputRef.current?.focus())
    }
  }, [repoSelectOpen])

  const addSelectedRepository = (value: string) => {
    addRepository(value)
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-2">
              <CardTitle>Monitoring scope</CardTitle>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mt-1 h-6 w-6"
                      aria-label="Dashboard usage help"
                    >
                      <HelpCircle className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-sm">
                    Choose an organization and its repositories to populate the workflow dashboard below.
                    Toggle repositories to include or exclude them from monitoring.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-sm text-muted-foreground">
                {organization ? (
                  <span>{selectedRepositories.length} repos selected</span>
                ) : (
                  <span>No organization selected</span>
                )}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setIsDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                Manage selection
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="flex max-h-[80vh] max-w-3xl flex-col overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>Configure monitored repositories</DialogTitle>
            <DialogDescription>
              Choose the organization and repositories to display in the workflow dashboard. Changes apply immediately.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="shrink-0 space-y-6 px-6 py-4">
              <div className="space-y-2">
                <Label>Organization</Label>
                <Select
                  value={organization || undefined}
                  onValueChange={(value) => setOrganization(value)}
                  disabled={organizationsQuery.isLoading || organizationsQuery.isError}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={organizationsQuery.isLoading ? "Loading..." : "Select organization"} />
                  </SelectTrigger>
                  <SelectContent>
                    {organizationsQuery.data?.map((org) => (
                      <SelectItem key={org} value={org}>
                        {org}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Organizations are loaded from the GitHub API using the stored access token. Ensure the token
                  has permissions to list organization memberships.
                </p>
                {organizationsQuery.isError ? (
                  <p className="text-xs text-destructive">
                    Unable to load organizations. Confirm your token and try again.
                  </p>
                ) : null}
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="space-y-1">
                    <Label className="text-base">Repositories</Label>
                    <p className="text-xs text-muted-foreground">
                      Select repositories from the organization list. Toggle to exclude specific repos from
                      monitoring. Removing a repository deletes it from the list.
                    </p>
                  </div>
                  {repositories.length ? (
                    <Button variant="ghost" size="sm" onClick={clearAll}>
                      Reset
                    </Button>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Add from organization</Label>
                  <Select
                    value={selectedRepoOption}
                    onValueChange={(value) => {
                      addSelectedRepository(value)
                      setSelectedRepoOption(undefined)
                      // keep dropdown open to allow multiple selections
                      setRepoSelectOpen(true)
                    }}
                    open={repoSelectOpen}
                    onOpenChange={(open) => {
                      setRepoSelectOpen(open)
                    }}
                    disabled={!organization || reposQuery.isLoading || reposQuery.isError || selectableRepos.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          !organization
                            ? "Select an organization first"
                            : reposQuery.isLoading
                              ? "Loading repositories..."
                              : selectableRepos.length === 0
                                ? "No additional repositories"
                                : "Select repository"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent position="popper" side="bottom" align="start" avoidCollisions={false}>
                      <div className="p-2">
                        <Input
                          ref={filterInputRef}
                          value={repoFilter}
                          onChange={(event) => setRepoFilter(event.target.value)}
                          placeholder="Filter repositories"
                          onKeyDown={(event) => event.stopPropagation()}
                        />
                      </div>
                      <Separator />
                      {filteredRepos.length ? (
                        filteredRepos.map((repo) => (
                          <SelectItem key={repo.name} value={repo.name}>
                            {repo.name}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="__no-results" disabled>
                          No repositories found
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {reposQuery.isError ? (
                    <p className="text-xs text-destructive">
                      Unable to load repositories for {organization}. Verify permissions or try again later.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-4">
              <div className="space-y-3 pr-2">
                {repositories.length ? (
                  repositories.map((repo) => (
                    <div key={repo.name} className="flex items-center justify-between gap-4 rounded-lg border p-3">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          id={`repo-${repo.name}`}
                          checked={repo.enabled}
                          onCheckedChange={(checked) =>
                            toggleRepository(repo.name, checked === true)
                          }
                        />
                        <Label htmlFor={`repo-${repo.name}`} className="text-sm font-medium">
                          {repo.name}
                        </Label>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeRepository(repo.name)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    No repositories added yet. Add one using the form above.
                  </p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="border-t bg-background px-6 py-4">
            <Button type="button" variant="secondary" onClick={() => setIsDialogOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {organization && selectedRepositories.length ? (
        <RepositoryWorkflowDashboard
          organization={organization}
          repositories={selectedRepositories}
          onReorder={reorderRepositories}
        />
      ) : null}
    </div>
  )
}
