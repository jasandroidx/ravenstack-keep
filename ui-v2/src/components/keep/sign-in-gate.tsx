import { Link } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export function SignInGate({ children, prompt }: { children: React.ReactNode; prompt: string }) {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return <div className="h-40 animate-pulse rounded-lg bg-elevated" />;
  }
  if (!user) {
    return (
      <div className="rounded-lg border border-line bg-surface p-6">
        <p className="text-muted">{prompt}</p>
        <Link
          to="/login"
          className="mt-4 inline-flex h-11 items-center rounded-sm bg-accent px-4 text-sm font-medium text-accent-fg"
        >
          Sign in to continue
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}
