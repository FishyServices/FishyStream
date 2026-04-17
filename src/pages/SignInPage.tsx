import { SignIn } from "@clerk/react";
import { dark } from "@clerk/themes";

export function SignInPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <SignIn
        appearance={{
          baseTheme: dark,
          variables: {
            colorPrimary: "hsl(2 71% 56%)",
            colorText: "white"
          }
        }}
        routing="hash"
        signUpUrl="/sign-up"
      />
    </div>
  );
}
