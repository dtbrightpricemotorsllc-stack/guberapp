import { Link } from "wouter";

interface Props {
  userId: number | null | undefined;
  label?: string | null;
  className?: string;
}

/** Renders a clickable link to /admin/users/:id. Anywhere in the admin
 *  surface a user appears, wrap the name with this so admins can jump
 *  straight to the full user profile. */
export function UserLink({ userId, label, className }: Props) {
  if (!userId) return <span className={className}>{label || "—"}</span>;
  return (
    <Link
      href={`/admin/users/${userId}`}
      className={className || "underline decoration-dotted underline-offset-2 hover:text-primary"}
      data-testid={`link-user-${userId}`}
    >
      {label || `#${userId}`}
    </Link>
  );
}
