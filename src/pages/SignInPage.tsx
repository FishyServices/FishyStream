import { useEffect, useMemo, useState } from "react";
import { ClerkFailed, ClerkLoaded, ClerkLoading, SignIn, useAuth, useSignIn } from "@clerk/react";
import { dark } from "@clerk/themes";
import { Link, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { AlertCircle, Loader2, Mail, Lock, ShieldCheck } from "lucide-react";
import { Button, Input } from "@fishy/ui";

type NativeSignInMode = "password" | "email-code";

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

function NativeSignInCard() {
  const navigate = useNavigate();
  const { isSignedIn } = useAuth();
  const { signIn } = useSignIn();
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<NativeSignInMode>("password");
  const [requiresVerification, setRequiresVerification] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isSignedIn) navigate("/", { replace: true });
  }, [isSignedIn, navigate]);

  const description = useMemo(
    () =>
      requiresVerification
        ? "Clerk requires an email verification code for this device before finishing sign in."
        : mode === "email-code"
          ? "Use a one-time email code. This works for accounts created on desktop, including Google-based accounts."
          : "Sign in directly inside the Android app. Social/browser redirect login is disabled here.",
    [mode, requiresVerification]
  );

  const finalizeSignIn = async () => {
    await signIn.finalize({
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
      const { error } = await signIn.password({ emailAddress, password });
      if (error) {
        setErrorMessage(getClerkErrorMessage(error));
        return;
      }

      if (signIn.status === "complete") {
        await finalizeSignIn();
        return;
      }

      if (signIn.status === "needs_client_trust") {
        const emailCodeFactor = signIn.supportedSecondFactors.find(
          (factor) => factor.strategy === "email_code"
        );

        if (!emailCodeFactor) {
          setErrorMessage("This sign-in requires a second factor the app does not support yet.");
          return;
        }

        const { error: sendError } = await signIn.mfa.sendEmailCode();

        if (sendError) {
          setErrorMessage(getClerkErrorMessage(sendError));
          return;
        }

        setRequiresVerification(true);
        return;
      }

      if (signIn.status === "needs_second_factor") {
        setErrorMessage("This account requires a second factor the app does not support yet.");
        return;
      }

      setErrorMessage(`Sign-in is not complete yet: ${signIn.status}`);
    } catch (error) {
      setErrorMessage(getClerkErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendEmailCode = async (event: React.FormEvent) => {
    event.preventDefault();

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const { error } = await signIn.emailCode.sendCode({ emailAddress });
      if (error) {
        setErrorMessage(getClerkErrorMessage(error));
        return;
      }

      setRequiresVerification(true);
    } catch (error) {
      setErrorMessage(getClerkErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyEmailCode = async (event: React.FormEvent) => {
    event.preventDefault();

    setVerifying(true);
    setErrorMessage(null);

    try {
      const { error } = await signIn.emailCode.verifyCode({ code });
      if (error) {
        setErrorMessage(getClerkErrorMessage(error));
        return;
      }

      if (signIn.status === "complete") {
        await finalizeSignIn();
        return;
      }

      setErrorMessage(`Verification is not complete yet: ${signIn.status}`);
    } catch (error) {
      setErrorMessage(getClerkErrorMessage(error));
    } finally {
      setVerifying(false);
    }
  };

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();

    setVerifying(true);
    setErrorMessage(null);

    try {
      const { error } = await signIn.mfa.verifyEmailCode({ code });
      if (error) {
        setErrorMessage(getClerkErrorMessage(error));
        return;
      }

      if (signIn.status === "complete") {
        await finalizeSignIn();
        return;
      }

      setErrorMessage(`Verification is not complete yet: ${signIn.status}`);
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
          Android Sign In
        </p>
        <h1 className="mt-2 font-display text-3xl font-black text-white">FishyStream</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/60">{description}</p>
      </div>

      {errorMessage && (
        <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </div>
      )}

      {!requiresVerification && (
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-white/8 bg-black/20 p-1">
          <Button
            type="button"
            variant={mode === "password" ? "default" : "ghost"}
            size="sm"
            className={`rounded-xl ${mode === "password" ? "bg-white text-black hover:bg-white/90" : "text-white/65 hover:text-white"}`}
            onClick={() => {
              setMode("password");
              setErrorMessage(null);
            }}
          >
            Password
          </Button>
          <Button
            type="button"
            variant={mode === "email-code" ? "default" : "ghost"}
            size="sm"
            className={`rounded-xl ${mode === "email-code" ? "bg-white text-black hover:bg-white/90" : "text-white/65 hover:text-white"}`}
            onClick={() => {
              setMode("email-code");
              setErrorMessage(null);
            }}
          >
            Email Code
          </Button>
        </div>
      )}

      {!requiresVerification ? (
        <form
          className="space-y-3"
          onSubmit={mode === "password" ? handleSubmit : handleSendEmailCode}
        >
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

          {mode === "password" && (
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-sm text-white/70">
                <Lock className="h-4 w-4" />
                Password
              </span>
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-12 border-white/10 bg-white/4 text-white placeholder:text-white/30"
                placeholder="Your password"
                required
              />
            </label>
          )}

          <Button type="submit" className="h-12 w-full text-sm font-semibold" disabled={submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {mode === "password" ? "Sign In" : "Send Sign-In Code"}
          </Button>
        </form>
      ) : (
        <form
          className="space-y-3"
          onSubmit={mode === "email-code" ? handleVerifyEmailCode : handleVerify}
        >
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
            Verify And Continue
          </Button>
        </form>
      )}

      <p className="mt-5 text-center text-sm text-white/45">
        Need an account?{" "}
        <Link to="/sign-up" className="font-medium text-primary hover:text-primary/80">
          Create one
        </Link>
      </p>
    </div>
  );
}

export function SignInPage() {
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
          <NativeSignInCard />
        ) : (
          <SignIn
            path="/sign-in"
            routing="path"
            signUpUrl="/sign-up"
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
