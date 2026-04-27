"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsLoading(true);
    setError(null);

    const result = await signIn(formData);

    if (result?.error) {
      setError(result.error);
      setIsLoading(false);
    }
    // If successful, the action redirects to /dashboard
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <h1 className="font-serif text-[32px] font-semibold text-ink mb-2">
            Welcome back
          </h1>
          <p className="text-base text-stone">
            Sign in to your account
          </p>
        </div>

        <form action={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-ink mb-1.5">
              Email
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              placeholder="jane@school.edu"
              className="w-full"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-ink mb-1.5">
              Password
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              placeholder="Your password"
              className="w-full"
            />
          </div>

          {error && (
            <p className="text-sm text-alert">{error}</p>
          )}

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full bg-accent-blue text-paper py-3 h-auto text-base rounded-lg hover:bg-accent-blue/90 disabled:opacity-50"
          >
            {isLoading ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <p className="text-center text-sm text-stone mt-6">
          Don&apos;t have an account?{" "}
          <Link href="/auth/signup" className="text-accent-blue hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
