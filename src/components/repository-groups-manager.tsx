import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  Trash2,
  Download,
  Upload,
  Folder,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  Edit2,
  X,
  Check,
} from "lucide-react";
import {
  useRepositoryGroups,
  type RepositoryGroup,
} from "@/hooks/useRepositoryGroups";

interface RepositoryGroupsManagerProps {
  organization: string;
  availableRepositories: string[];
  onAddRepository?: (repoName: string) => void;
  onRemoveRepository?: (repoName: string) => void;
}

export function RepositoryGroupsManager({
  organization,
  availableRepositories,
  onAddRepository: _onAddRepository,
  onRemoveRepository: _onRemoveRepository,
}: RepositoryGroupsManagerProps) {
  void _onAddRepository;
  void _onRemoveRepository;
  const {
    groups,
    createGroup,
    updateGroupName,
    toggleGroupEnabled,
    deleteGroup,
    addRepositoryToGroup,
    removeRepositoryFromGroup,
    toggleRepositoryInGroup,
    getEnabledRepositories,
    exportConfiguration,
    importConfiguration,
  } = useRepositoryGroups({ externalOrganization: organization });

  const [isAddGroupDialogOpen, setIsAddGroupDialogOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [isAddRepoDialogOpen, setIsAddRepoDialogOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [newRepoName, setNewRepoName] = useState("");
  const [repoFilter, setRepoFilter] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const enabledReposCount = getEnabledRepositories().length;

  // Filter available repositories for adding to group
  const selectableRepos = availableRepositories.filter(
    (repo) => !groups.some((g) => g.repositories.some((r) => r.name === repo)),
  );

  const filteredSelectableRepos = repoFilter
    ? selectableRepos.filter((r) =>
        r.toLowerCase().includes(repoFilter.toLowerCase()),
      )
    : selectableRepos;

  const handleCreateGroup = useCallback(() => {
    if (newGroupName.trim()) {
      createGroup(newGroupName.trim());
      setNewGroupName("");
      setIsAddGroupDialogOpen(false);
    }
  }, [createGroup, newGroupName]);

  const handleUpdateGroupName = useCallback(
    (groupId: string) => {
      if (editingGroupName.trim()) {
        updateGroupName(groupId, editingGroupName.trim());
      }
      setEditingGroupId(null);
      setEditingGroupName("");
    },
    [editingGroupName, updateGroupName],
  );

  const toggleGroupExpanded = useCallback((groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  const handleAddRepoToGroup = useCallback(
    (groupId: string) => {
      if (newRepoName.trim()) {
        addRepositoryToGroup(groupId, newRepoName.trim());
        setNewRepoName("");
      }
      setSelectedGroupId(null);
      setIsAddRepoDialogOpen(false);
    },
    [addRepositoryToGroup, newRepoName],
  );

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const text = await file.text();
        importConfiguration(text);
        e.target.value = "";
      }
    },
    [importConfiguration],
  );

  const startEditingGroup = useCallback((group: RepositoryGroup) => {
    setEditingGroupId(group.id);
    setEditingGroupName(group.name);
  }, []);

  const openAddRepoDialog = useCallback((groupId: string) => {
    setSelectedGroupId(groupId);
    setNewRepoName("");
    setRepoFilter("");
    setIsAddRepoDialogOpen(true);
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Folder className="h-5 w-5" />
              Repository Groups
            </CardTitle>
            <CardDescription>
              Group repositories and enable/disable them together. Currently{" "}
              {enabledReposCount} repositories enabled.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleImportClick}>
              <Upload className="mr-2 h-4 w-4" />
              Import
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={exportConfiguration}
              disabled={groups.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button size="sm" onClick={() => setIsAddGroupDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Group
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No repository groups configured. Create a group to organize your
            repositories.
          </p>
        ) : (
          <div className="space-y-2">
            {groups.map((group) => (
              <div key={group.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={group.enabled}
                      onCheckedChange={() => toggleGroupEnabled(group.id)}
                    />
                    <button
                      onClick={() => toggleGroupExpanded(group.id)}
                      className="flex items-center gap-1 hover:text-primary"
                    >
                      {expandedGroups.has(group.id) ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      {expandedGroups.has(group.id) ? (
                        <FolderOpen className="h-4 w-4" />
                      ) : (
                        <Folder className="h-4 w-4" />
                      )}
                    </button>
                    {editingGroupId === group.id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          value={editingGroupName}
                          onChange={(e) => setEditingGroupName(e.target.value)}
                          className="h-7 w-40"
                          onKeyDown={(e) => {
                            if (e.key === "Enter")
                              handleUpdateGroupName(group.id);
                            if (e.key === "Escape") {
                              setEditingGroupId(null);
                              setEditingGroupName("");
                            }
                          }}
                          autoFocus
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => handleUpdateGroupName(group.id)}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => {
                            setEditingGroupId(null);
                            setEditingGroupName("");
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <span
                        className={
                          group.enabled
                            ? "font-medium"
                            : "text-muted-foreground"
                        }
                      >
                        {group.name}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      ({group.repositories.filter((r) => r.enabled).length}/
                      {group.repositories.length} enabled)
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => openAddRepoDialog(group.id)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => startEditingGroup(group)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => {
                        if (confirm(`Delete group "${group.name}"?`)) {
                          deleteGroup(group.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {expandedGroups.has(group.id) &&
                  group.repositories.length > 0 && (
                    <div className="ml-11 mt-2 space-y-1">
                      {group.repositories.map((repo) => (
                        <div
                          key={repo.name}
                          className="flex items-center justify-between rounded bg-muted/50 px-2 py-1"
                        >
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={repo.enabled}
                              onCheckedChange={() =>
                                toggleRepositoryInGroup(group.id, repo.name)
                              }
                            />
                            <span
                              className={
                                repo.enabled
                                  ? "text-sm"
                                  : "text-sm text-muted-foreground"
                              }
                            >
                              {repo.name}
                            </span>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() =>
                              removeRepositoryFromGroup(group.id, repo.name)
                            }
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Add Group Dialog */}
      <Dialog
        open={isAddGroupDialogOpen}
        onOpenChange={setIsAddGroupDialogOpen}
      >
        <DialogContent scrollable>
          <DialogHeader>
            <DialogTitle>Add Repository Group</DialogTitle>
            <DialogDescription>
              Create a new group to organize your repositories.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="group-name">Group Name</Label>
            <Input
              id="group-name"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="e.g., Frontend, Backend, DevOps"
              className="mt-2"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateGroup();
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsAddGroupDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateGroup} disabled={!newGroupName.trim()}>
              Create Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Repository to Group Dialog */}
      <Dialog open={isAddRepoDialogOpen} onOpenChange={setIsAddRepoDialogOpen}>
        <DialogContent scrollable>
          <DialogHeader>
            <DialogTitle>Add Repository to Group</DialogTitle>
            <DialogDescription>
              Add repositories to this group from your available repositories.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label htmlFor="repo-name">Repository Name</Label>
              <Input
                id="repo-name"
                value={newRepoName}
                onChange={(e) => setNewRepoName(e.target.value)}
                placeholder="Type repository name"
                className="mt-2"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && selectedGroupId)
                    handleAddRepoToGroup(selectedGroupId);
                }}
              />
            </div>
            {selectableRepos.length > 0 && (
              <div>
                <Label>Or select from available</Label>
                <Input
                  placeholder="Filter repositories..."
                  value={repoFilter}
                  onChange={(e) => setRepoFilter(e.target.value)}
                  className="mt-2"
                />
                <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded border p-2">
                  {filteredSelectableRepos.slice(0, 10).map((repo) => (
                    <button
                      key={repo}
                      className="w-full rounded px-2 py-1 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        if (selectedGroupId) {
                          addRepositoryToGroup(selectedGroupId, repo);
                          // Keep filter for selecting multiple repos
                        }
                      }}
                    >
                      {repo}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsAddRepoDialogOpen(false)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
