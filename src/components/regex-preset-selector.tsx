import { useState, useEffect, useCallback } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Edit2, Save, X, Code2 } from "lucide-react";
import type { RegexPreset } from "@/types/repository-dashboard";
import {
  loadPresets,
  savePreset,
  updatePreset,
  deletePreset,
  testPreset,
} from "@/lib/regex-presets";

interface RegexPresetSelectorProps {
  searchPattern: string;
  replaceWith: string;
  sampleContent: string;
  onApplyPreset: (searchPattern: string, replaceWith: string) => void;
  disabled?: boolean;
}

export function RegexPresetSelector({
  searchPattern,
  replaceWith,
  sampleContent,
  onApplyPreset,
  disabled = false,
}: RegexPresetSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [presets, setPresets] = useState<RegexPreset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<RegexPreset | null>(
    null,
  );
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState<string | null>(null);

  // Form state for create/edit
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formSearchPattern, setFormSearchPattern] = useState("");
  const [formReplaceWith, setFormReplaceWith] = useState("");
  const [testResult, setTestResult] = useState<{
    isValid: boolean;
    matches: string[];
    preview: string | null;
    error?: string;
  } | null>(null);

  useEffect(() => {
    setPresets(loadPresets());
  }, [isOpen]);

  const handleSelectPreset = useCallback(
    (preset: RegexPreset) => {
      setSelectedPreset(preset);
      onApplyPreset(preset.searchPattern, preset.replaceWith);
      setIsOpen(false);
    },
    [onApplyPreset],
  );

  const handleCreatePreset = useCallback(() => {
    if (!formName.trim() || !formSearchPattern.trim()) return;

    const newPreset = savePreset({
      name: formName,
      description: formDescription,
      searchPattern: formSearchPattern,
      replaceWith: formReplaceWith,
    });

    setPresets(loadPresets());
    setIsCreating(false);
    setFormName("");
    setFormDescription("");
    setFormSearchPattern("");
    setFormReplaceWith("");
    setTestResult(null);
  }, [formName, formDescription, formSearchPattern, formReplaceWith]);

  const handleUpdatePreset = useCallback(() => {
    if (!isEditing || !formName.trim() || !formSearchPattern.trim()) return;

    updatePreset(isEditing, {
      name: formName,
      description: formDescription,
      searchPattern: formSearchPattern,
      replaceWith: formReplaceWith,
    });

    setPresets(loadPresets());
    setIsEditing(null);
    setFormName("");
    setFormDescription("");
    setFormSearchPattern("");
    setFormReplaceWith("");
    setTestResult(null);
  }, [
    isEditing,
    formName,
    formDescription,
    formSearchPattern,
    formReplaceWith,
  ]);

  const handleDeletePreset = useCallback(
    (id: string) => {
      deletePreset(id);
      setPresets(loadPresets());
      if (selectedPreset?.id === id) {
        setSelectedPreset(null);
      }
    },
    [selectedPreset],
  );

  const handleTestPattern = useCallback(() => {
    const preset: RegexPreset = {
      id: "test",
      name: "Test",
      description: "",
      searchPattern: formSearchPattern,
      replaceWith: formReplaceWith,
      isBuiltIn: false,
      createdAt: "",
    };
    const result = testPreset(preset, sampleContent);
    setTestResult(result);
  }, [formSearchPattern, formReplaceWith, sampleContent]);

  const startEditing = useCallback((preset: RegexPreset) => {
    setIsEditing(preset.id);
    setFormName(preset.name);
    setFormDescription(preset.description);
    setFormSearchPattern(preset.searchPattern);
    setFormReplaceWith(preset.replaceWith);
    setTestResult(null);
  }, []);

  const cancelEdit = useCallback(() => {
    setIsEditing(null);
    setIsCreating(false);
    setFormName("");
    setFormDescription("");
    setFormSearchPattern("");
    setFormReplaceWith("");
    setTestResult(null);
  }, []);

  const builtinPresets = presets.filter((p) => p.isBuiltIn);
  const userPresets = presets.filter((p) => !p.isBuiltIn);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        disabled={disabled}
        className="gap-2"
      >
        <Code2 className="h-4 w-4" />
        Presets
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Regex Pattern Presets</DialogTitle>
            <DialogDescription>
              Choose a preset pattern or create your own for search and replace.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-4 min-h-[400px]">
            {/* Preset List */}
            <div className="w-1/2 border-r pr-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-sm">Built-in Presets</h3>
              </div>
              <div className="h-[150px] mb-4 overflow-y-auto">
                <div className="space-y-2">
                  {builtinPresets.map((preset) => (
                    <div
                      key={preset.id}
                      className={`p-2 rounded border cursor-pointer transition-colors ${
                        selectedPreset?.id === preset.id
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted"
                      }`}
                      onClick={() => handleSelectPreset(preset)}
                    >
                      <div className="font-medium text-sm">{preset.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {preset.description}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-sm">My Presets</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsCreating(true)}
                  disabled={isEditing !== null}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  New
                </Button>
              </div>
              <div className="h-[150px] overflow-y-auto">
                <div className="space-y-2">
                  {userPresets.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-2">
                      No custom presets yet. Create one to get started.
                    </p>
                  ) : (
                    userPresets.map((preset) => (
                      <div
                        key={preset.id}
                        className={`p-2 rounded border cursor-pointer transition-colors group ${
                          selectedPreset?.id === preset.id
                            ? "border-primary bg-primary/5"
                            : "hover:bg-muted"
                        }`}
                        onClick={() => handleSelectPreset(preset)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-sm">
                            {preset.name}
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => {
                                e.stopPropagation();
                                startEditing(preset);
                              }}
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeletePreset(preset.id);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {preset.description}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Create/Edit Form */}
            <div className="w-1/2 pl-4">
              {isCreating || isEditing ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">
                      {isEditing ? "Edit Preset" : "Create Preset"}
                    </h3>
                    <Button variant="ghost" size="sm" onClick={cancelEdit}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="preset-name">Name</Label>
                    <Input
                      id="preset-name"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="My Custom Preset"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="preset-description">Description</Label>
                    <Input
                      id="preset-description"
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      placeholder="What does this preset do?"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="preset-search">
                      Search Pattern (Regex)
                    </Label>
                    <Textarea
                      id="preset-search"
                      value={formSearchPattern}
                      onChange={(e) => setFormSearchPattern(e.target.value)}
                      placeholder='e.g., "(@org/package":\s*")[^"]+'
                      rows={3}
                      className="font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="preset-replace">Replace With</Label>
                    <Input
                      id="preset-replace"
                      value={formReplaceWith}
                      onChange={(e) => setFormReplaceWith(e.target.value)}
                      placeholder="e.g., $1NEW_VERSION"
                      className="font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Test with sample content</Label>
                    <Textarea
                      value={sampleContent}
                      readOnly
                      rows={3}
                      className="text-xs"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleTestPattern}
                        disabled={!formSearchPattern || !sampleContent}
                      >
                        Test
                      </Button>
                    </div>
                    {testResult && (
                      <div
                        className={`text-sm p-2 rounded ${
                          !testResult.isValid
                            ? "bg-red-50 text-red-700"
                            : testResult.matches.length > 0
                              ? "bg-green-50 text-green-700"
                              : "bg-yellow-50 text-yellow-700"
                        }`}
                      >
                        {!testResult.isValid ? (
                          <span>Error: {testResult.error}</span>
                        ) : testResult.matches.length === 0 ? (
                          <span>No matches found</span>
                        ) : (
                          <div>
                            <span>
                              {testResult.matches.length} match(es) found
                            </span>
                            {testResult.preview && (
                              <pre className="mt-2 p-2 bg-white rounded border text-xs overflow-x-auto whitespace-pre-wrap">
                                {testResult.preview}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={
                        isEditing ? handleUpdatePreset : handleCreatePreset
                      }
                    >
                      <Save className="h-4 w-4 mr-1" />
                      {isEditing ? "Update" : "Save"}
                    </Button>
                    <Button variant="outline" onClick={cancelEdit}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Code2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Select a preset or create a new one</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
