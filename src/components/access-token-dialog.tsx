import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AccessTokenDialogProps {
  hasToken: boolean;
  saveToken: (token: string) => void;
  clearToken: () => void;
}

export function AccessTokenDialog({
  hasToken,
  saveToken,
  clearToken,
}: AccessTokenDialogProps) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");

  const resetState = () => {
    setToken("");
    setError("");
  };

  const handleClose = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetState();
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!token.trim()) {
      setError("Enter a token before saving.");
      return;
    }

    saveToken(token);
    resetState();
    setOpen(false);
  };

  const handleClear = () => {
    clearToken();
    resetState();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button variant={hasToken ? "secondary" : "default"}>
          {hasToken ? "Manage Access Token" : "Add Access Token"}
        </Button>
      </DialogTrigger>
      <DialogContent scrollable>
        <DialogHeader>
          <DialogTitle>GitHub Personal Access Token</DialogTitle>
          <DialogDescription>
            The token is stored locally in your browser. We never display it
            again once saved. Generate a new token with the required scopes and
            paste it here.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="github-token">Personal access token</Label>
            <Input
              id="github-token"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              type="password"
              placeholder="ghp_..."
              autoComplete="new-password"
              required
            />
            {hasToken ? (
              <p className="text-xs text-muted-foreground">
                A token is already stored locally. Saving will replace it.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Token values are never shown after saving. Store this securely.
              </p>
            )}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter className="gap-2">
            {hasToken ? (
              <Button type="button" variant="secondary" onClick={handleClear}>
                Clear stored token
              </Button>
            ) : null}
            <Button type="submit">Save token</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
