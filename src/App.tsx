import { Moon, Sun, HelpCircle } from "lucide-react";
import { AccessTokenDialog } from "@/components/access-token-dialog";
import { OrgRepoSelector } from "@/components/org-repo-selector";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTheme } from "@/components/theme-provider";
import { useGithubAccessToken } from "@/hooks/useGithubAccessToken";

function App() {
  const { hasToken, saveToken, clearToken } = useGithubAccessToken();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b">
        <div className="container flex items-center justify-between py-6">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-primary">
              GitHub Repositories Manager
            </p>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                Explore repositories across your organization
              </h1>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Dashboard overview information"
                    >
                      <HelpCircle className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm text-sm">
                    <p>
                      This dashboard helps you manage multiple GitHub
                      repositories in your organization. Save a personal access
                      token, select repositories, and explore insights below.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AccessTokenDialog
              hasToken={hasToken}
              saveToken={saveToken}
              clearToken={clearToken}
            />
            <Button asChild variant="outline">
              <a
                href="https://github.com/settings/tokens"
                target="_blank"
                rel="noreferrer"
              >
                Token creation guide
              </a>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label={`Switch to ${
                theme === "dark" ? "light" : "dark"
              } mode`}
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Moon className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>
      </header>
      <main className="flex flex-1 flex-col items-center gap-10 py-16 px-6">
        {hasToken ? (
          <section className="w-full max-w-[min(1600px,90vw)]">
            <OrgRepoSelector />
          </section>
        ) : null}
      </main>
      <footer className="border-t">
        <div className="container py-4 text-sm text-muted-foreground">
          Built by ILUSOFT INC. 2026 © All rights reserved.
        </div>
      </footer>
    </div>
  );
}

export default App;
