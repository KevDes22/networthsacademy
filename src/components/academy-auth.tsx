import { useState, useEffect, useCallback, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, ArrowRight, LoaderCircle, Mail, ShieldCheck } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { PublicLayout } from "./academy-public";
import { supabase } from "@/integrations/supabase/client";
import { getAccount } from "@/lib/academy.functions";
import { dashboardDestination, validateRegistration } from "@/lib/academy";
export function AuthPage({
  mode,
  enroll,
}: {
  enroll?: { courseId: string | undefined };
  mode: "login" | "signup" | "forgot" | "reset";
}) {
  const navigate = useNavigate();
  const account = useServerFn(getAccount);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [terms, setTerms] = useState(false);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const courseId = enroll?.courseId;
  const enrollment = courseId ? { enroll: courseId } : {};
  const continueAfterAuth = useCallback(async () => {
    const a = await account();
    if (courseId && !a.isAdmin && !a.isInstructor) {
      await navigate({ to: "/courses", search: { enroll: courseId } });
    } else {
      await navigate({ to: dashboardDestination(a.isAdmin, a.isInstructor) });
    }
  }, [account, courseId, navigate]);
  useEffect(() => {
    if (mode === "reset") {
      const hash = window.location.hash;
      setRecovery(hash.includes("type=recovery") || hash.includes("type=invite"));
      void supabase.auth.getUser().then(({ data }) => {
        if (data.user) setRecovery(true);
      });
    } else if (mode === "login") {
      void supabase.auth.getUser().then(async ({ data }) => {
        if (data.user) {
          try {
            await continueAfterAuth();
          } catch {
            setError("Unable to open your account. Please try signing in again.");
          }
        }
      });
    }
  }, [mode, continueAfterAuth]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (mode === "signup") {
      const issue = validateRegistration(name, password, confirm, terms);
      if (issue) {
        setError(issue);
        return;
      }
    }
    if (mode === "reset" && (password.length < 8 || password !== confirm)) {
      setError("Use matching passwords with at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const result = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name.trim(), terms_accepted_at: new Date().toISOString() },
            emailRedirectTo: new URL(
              courseId ? "/login?enroll=" + encodeURIComponent(courseId) : "/login",
              window.location.origin,
            ).href,
          },
        });
        if (result.error) throw result.error;
        if (!result.data.session) {
          setSent(true);
        } else {
          await continueAfterAuth();
        }
      }
      if (mode === "login") {
        const result = await supabase.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
        await continueAfterAuth();
      }
      if (mode === "forgot") {
        const result = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "/reset-password",
        });
        if (result.error) throw result.error;
        setSent(true);
      }
      if (mode === "reset") {
        const result = await supabase.auth.updateUser({ password });
        if (result.error) throw result.error;
        await continueAfterAuth();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }
  const title =
    mode === "signup"
      ? "Your future starts here"
      : mode === "forgot"
        ? "Forgot your password?"
        : mode === "reset"
          ? "Set your new password"
          : "Welcome back";
  return (
    <PublicLayout>
      <main className="min-h-[700px] bg-muted flex flex-col items-center justify-center py-14 px-5">
        <div className="auth-form">
          <span className="category-icon mx-auto mb-5">{sent ? <Mail /> : <ShieldCheck />}</span>
          <h1 className="text-2xl font-bold text-center">{sent ? "Check your inbox" : title}</h1>
          <p className="text-sm text-muted-foreground text-center mt-3 mb-7">
            {sent
              ? mode === "signup"
                ? "Confirm your email to activate your account, then sign in."
                : "If an account exists for this email, you’ll receive a password reset link."
              : mode === "signup"
                ? courseId
                  ? "Create an account to continue enrolling in your selected course."
                  : "Create your Networths Academy account."
                : mode === "forgot"
                  ? "We’ll send you a link to reset your password."
                  : mode === "reset"
                    ? "Choose a secure password for your account."
                    : "Sign in to continue your learning journey."}
          </p>
          {sent ? (
            <Button className="w-full" variant="outline" asChild>
              <Link to="/login" search={enrollment}>
                Back to Log In
              </Link>
            </Button>
          ) : mode === "reset" && !recovery ? (
            <div className="text-center">
              <p className="text-sm text-destructive">
                This link is missing or expired. Request a new reset link.
              </p>
              <Button className="mt-5" asChild>
                <Link to="/forgot-password">Request a New Link</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              {mode === "signup" && (
                <label className="block text-sm font-semibold">
                  Full name
                  <input
                    className="field mt-2"
                    autoComplete="name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your full name"
                  />
                </label>
              )}
              {mode !== "reset" && (
                <label className="block text-sm font-semibold">
                  Email address
                  <input
                    className="field mt-2"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </label>
              )}
              {mode !== "forgot" && (
                <label className="block text-sm font-semibold">
                  {mode === "reset" ? "New password" : "Password"}
                  <div className="relative mt-2">
                    <input
                      className="field pr-12"
                      type={show ? "text" : "password"}
                      required
                      minLength={mode === "login" ? 1 : 8}
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === "login" ? "Your password" : "At least 8 characters"}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1"
                      aria-label={show ? "Hide password" : "Show password"}
                      onClick={() => setShow(!show)}
                    >
                      {show ? <EyeOff /> : <Eye />}
                    </Button>
                  </div>
                </label>
              )}
              {(mode === "signup" || mode === "reset") && (
                <label className="block text-sm font-semibold">
                  Confirm password
                  <input
                    className="field mt-2"
                    type={show ? "text" : "password"}
                    required
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Enter your password again"
                  />
                </label>
              )}
              {mode === "signup" && (
                <label className="flex gap-3 items-start text-xs text-muted-foreground leading-6">
                  <input
                    type="checkbox"
                    className="mt-1.5 accent-primary"
                    checked={terms}
                    onChange={(e) => setTerms(e.target.checked)}
                  />
                  <span>
                    I agree to the{" "}
                    <Link to="/terms" className="text-primary underline">
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link to="/privacy" className="text-primary underline">
                      Privacy Policy
                    </Link>
                    .
                  </span>
                </label>
              )}
              {mode === "login" && (
                <div className="text-right">
                  <Link to="/forgot-password" className="text-primary text-xs font-semibold">
                    Forgot password?
                  </Link>
                </div>
              )}
              {error && (
                <p
                  role="alert"
                  className="text-sm text-destructive bg-destructive/5 p-3 rounded-md"
                >
                  {error}
                </p>
              )}
              <Button className="w-full h-12" type="submit" disabled={loading}>
                {loading ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <>
                    {mode === "signup"
                      ? "Create Account"
                      : mode === "forgot"
                        ? "Send Reset Link"
                        : mode === "reset"
                          ? "Save Password"
                          : "Log In"}
                    <ArrowRight />
                  </>
                )}
              </Button>
              {mode === "login" && (
                <p className="text-sm text-center text-muted-foreground">
                  New to the Academy?{" "}
                  <Link to="/signup" search={enrollment} className="text-primary font-semibold">
                    Sign Up
                  </Link>
                </p>
              )}
              {mode === "signup" && (
                <p className="text-sm text-center text-muted-foreground">
                  Already have an account?{" "}
                  <Link to="/login" search={enrollment} className="text-primary font-semibold">
                    Log In
                  </Link>
                </p>
              )}
            </form>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-7">Practical skills. New possibilities.</p>
      </main>
    </PublicLayout>
  );
}
