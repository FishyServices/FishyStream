import { useUser } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { Toaster, toast } from "sonner";

export function App() {
  const { isLoaded, isSignedIn, user } = useUser();

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isSignedIn || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-sm w-full space-y-4 text-center">
          <h1 className="text-2xl font-bold text-foreground">Welcome</h1>
          <p className="text-muted-foreground">Please sign in to continue</p>
          <Button
            onClick={() => {
              window.location.href = "/sign-in";
            }}
            className="w-full"
          >
            Sign In
          </Button>
        </div>
        <Toaster position="top-right" richColors />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <Toaster position="top-right" richColors />
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Hello, {user.firstName || user.username}!</h1>
            <p className="text-muted-foreground mt-1">
              Your app is ready with React, Vite, Tailwind, Clerk, and Convex.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              window.location.href = "/sign-out";
            }}
          >
            Sign Out
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-6 rounded-lg border bg-card">
            <h2 className="font-semibold mb-2">Authentication</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Powered by Clerk with dark theme integration.
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => toast.success("Clerk is working!")}
            >
              Test Toast
            </Button>
          </div>

          <div className="p-6 rounded-lg border bg-card">
            <h2 className="font-semibold mb-2">Backend</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Convex real-time database ready to use.
            </p>
            <Button variant="secondary" size="sm" onClick={() => {}}>
              View Schema
            </Button>
          </div>

          <div className="p-6 rounded-lg border bg-card">
            <h2 className="font-semibold mb-2">UI Components</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Radix UI primitives with Tailwind styling.
            </p>
            <div className="flex gap-2">
              <Button variant="default" size="sm">
                Default
              </Button>
              <Button variant="outline" size="sm">
                Outline
              </Button>
              <Button variant="ghost" size="sm">
                Ghost
              </Button>
            </div>
          </div>

          <div className="p-6 rounded-lg border bg-card">
            <h2 className="font-semibold mb-2">Styling</h2>
            <p className="text-sm text-muted-foreground mb-4">
              TailwindCSS v4 with custom theme configuration.
            </p>
            <div className="flex gap-2">
              <div className="w-6 h-6 rounded bg-primary" title="primary" />
              <div className="w-6 h-6 rounded bg-secondary" title="secondary" />
              <div className="w-6 h-6 rounded bg-destructive" title="destructive" />
              <div className="w-6 h-6 rounded bg-accent" title="accent" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
