import { SignUp } from "@clerk/react";
import { dark } from "@clerk/themes";

export function SignUpPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <SignUp
        appearance={{
          baseTheme: dark,
          variables: {
            colorPrimary: "#2563eb",
            colorText: "white"
          }
        }}
        routing="hash"
        signInUrl="/sign-in"
      />
    </div>
  );
}
