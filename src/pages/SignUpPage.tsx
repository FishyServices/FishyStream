import { ClerkFailed, ClerkLoaded, ClerkLoading, SignUp } from "@clerk/react";
import { Link } from "react-router-dom";
import { AlertCircle, Loader2 } from "lucide-react";

import { NativeSignUpCard } from "@fishy/mobile/auth/SignUp";
import { isNativePlatform } from "@fishy/mobile";

export function SignUpPage() {
  const isNativeApp = isNativePlatform();

  return (
    <div className="auth-canvas flex items-center justify-center">
      <ClerkLoading>
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </ClerkLoading>
      <ClerkFailed>
        <div className="max-w-md rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive" />
          <p className="font-medium text-foreground">Clerk failed to initialize</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Check your Clerk publishable key and allowed local development URLs.
          </p>
        </div>
      </ClerkFailed>
      <ClerkLoaded>
        {isNativeApp ? (
          <NativeSignUpCard />
        ) : (
          <SignUp
            path="/sign-up"
            routing="path"
            signInUrl="/sign-in"
            appearance={{
              variables: {
                colorPrimary: "oklch(0.65 0.15 180)",
                colorBackground: "rgba(18, 24, 32, 0.96)",
                borderRadius: "0.875rem",
                fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
              }
            }}
          />
        )}
      </ClerkLoaded>
    </div>
  );
}
