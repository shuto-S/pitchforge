import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <main className="container grid min-h-[calc(100vh-65px)] items-center py-10">
      <div className="mx-auto w-full max-w-md">
        <Link href="/" className="mb-5 inline-flex text-sm font-semibold text-muted hover:text-ink">
          PitchForge
        </Link>
        <LoginForm />
      </div>
    </main>
  );
}
