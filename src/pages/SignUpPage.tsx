import { ClerkFailed, ClerkLoaded, ClerkLoading, SignUp } from "@clerk/react";
import { dark } from "@clerk/themes";
import { AlertCircle, Loader2 } from "lucide-react";

export function SignUpPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <ClerkLoading>
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </ClerkLoading>
      <ClerkFailed>
        <div className="max-w-md rounded-xl border border-red-500/20 bg-red-500/10 p-6 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
          <p className="font-medium text-white">Clerk failed to initialize</p>
          <p className="mt-2 text-sm text-white/70">
            Check your Clerk publishable key and allowed local development URLs.
          </p>
        </div>
      </ClerkFailed>
      <ClerkLoaded>
        <SignUp
          path="/sign-up"
          routing="path"
          signInUrl="/sign-in"
          appearance={{
            baseTheme: dark,
            variables: {
              colorPrimary: "hsl(2 71% 56%)",
              colorText: "white"
            }
          }}
        />
      </ClerkLoaded>
    </div>
  );
}
