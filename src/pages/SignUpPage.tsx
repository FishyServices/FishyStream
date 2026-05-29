import { useEffect, useState } from "react";
import { ClerkFailed, ClerkLoaded, ClerkLoading, SignUp, useAuth, useSignUp } from "@clerk/react";
import { dark } from "@clerk/themes";
import { Link, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { AlertCircle, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { Button, Input } from "@FishyServices/ui";

function getClerkErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "errors" in error &&
    Array.isArray((error as { errors?: Array<{ longMessage?: string; message?: string }> }).errors)
  ) {
    const first = (error as { errors: Array<{ longMessage?: string; message?: string }> })
      .errors[0];
    return first?.longMessage || first?.message || "Authentication failed";
  }

  if (error instanceof Error) return error.message;
  return "Authentication failed";
}

function NativeSignUpCard() {
  const navigate = useNavigate();
  const { isSignedIn } = useAuth();
  const { signUp } = useSignUp();
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isSignedIn) navigate("/", { replace: true });
  }, [isSignedIn, navigate]);

  const finalizeSignUp = async () => {
    await signUp.finalize({
      navigate: ({ decorateUrl }) => {
        const url = decorateUrl("/");
        navigate(url.startsWith("http") ? "/" : url, { replace: true });
      }
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const { error } = await signUp.password({ emailAddress, password });
      if (error) {
        setErrorMessage(getClerkErrorMessage(error));
        return;
      }

      const { error: sendError } = await signUp.verifications.sendEmailCode();
      if (sendError) {
        setErrorMessage(getClerkErrorMessage(sendError));
        return;
      }

      setAwaitingCode(true);
    } catch (error) {
      setErrorMessage(getClerkErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();

    setVerifying(true);
    setErrorMessage(null);

    try {
      const { error } = await signUp.verifications.verifyEmailCode({ code });
      if (error) {
        setErrorMessage(getClerkErrorMessage(error));
        return;
      }

      if (signUp.status === "complete") {
        await finalizeSignUp();
        return;
      }

      setErrorMessage(`Sign-up is not complete yet: ${signUp.status}`);
    } catch (error) {
      setErrorMessage(getClerkErrorMessage(error));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-[1.75rem] border border-white/10 bg-white/4 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-7">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/85">
          Android Sign Up
        </p>
        <h1 className="mt-2 font-display text-3xl font-black text-white">Create Your Account</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/60">
          This native Android flow stays inside the app and verifies your email with a one-time
          code.
        </p>
      </div>

      {errorMessage && (
        <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </div>
      )}

      {!awaitingCode ? (
        <form className="space-y-3" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm text-white/70">
              <Mail className="h-4 w-4" />
              Email
            </span>
            <Input
              type="email"
              autoComplete="email"
              value={emailAddress}
              onChange={(event) => setEmailAddress(event.target.value)}
              className="h-12 border-white/10 bg-white/4 text-white placeholder:text-white/30"
              placeholder="you@example.com"
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm text-white/70">
              <Lock className="h-4 w-4" />
              Password
            </span>
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-12 border-white/10 bg-white/4 text-white placeholder:text-white/30"
              placeholder="Create a password"
              required
            />
          </label>

          <Button type="submit" className="h-12 w-full text-sm font-semibold" disabled={submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Create Account
          </Button>
        </form>
      ) : (
        <form className="space-y-3" onSubmit={handleVerify}>
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm text-white/70">
              <ShieldCheck className="h-4 w-4" />
              Email Verification Code
            </span>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="h-12 border-white/10 bg-white/4 text-white placeholder:text-white/30"
              placeholder="Enter the code from your email"
              required
            />
          </label>

          <Button type="submit" className="h-12 w-full text-sm font-semibold" disabled={verifying}>
            {verifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Verify And Finish
          </Button>
        </form>
      )}

      <p className="mt-5 text-center text-sm text-white/45">
        Already have an account?{" "}
        <Link to="/sign-in" className="font-medium text-primary hover:text-primary/80">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export function SignUpPage() {
  const isNativeApp = Capacitor.isNativePlatform();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <ClerkLoading>
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
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
        {isNativeApp ? (
          <NativeSignUpCard />
        ) : (
          <SignUp
            path="/sign-up"
            routing="path"
            signInUrl="/sign-in"
            appearance={{
              baseTheme: dark,
              variables: {
                colorPrimary: "oklch(0.65 0.15 180)",
                colorBackground: "rgba(18, 24, 32, 0.96)",
                colorInputBackground: "rgba(255,255,255,0.04)",
                colorInputText: "#f3f7fb",
                colorText: "#f3f7fb",
                colorTextSecondary: "rgba(243,247,251,0.72)",
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
