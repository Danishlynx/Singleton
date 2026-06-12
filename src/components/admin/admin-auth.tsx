"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const STORAGE_KEY = "singleton_admin_token";

export function useAdminToken() {
  const [token, setTokenState] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setTokenState(localStorage.getItem(STORAGE_KEY));
    setLoaded(true);
  }, []);

  function setToken(t: string | null) {
    if (t) localStorage.setItem(STORAGE_KEY, t);
    else localStorage.removeItem(STORAGE_KEY);
    setTokenState(t);
  }

  return { token, setToken, loaded };
}

/** fetch() with the admin token + JSON content-type attached. */
export function adminFetch(token: string, url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-admin-token": token,
      ...(init?.headers ?? {}),
    },
  });
}

export function TokenGate({ children }: { children: (token: string) => ReactNode }) {
  const { token, setToken, loaded } = useAdminToken();
  const [input, setInput] = useState("");

  if (!loaded) return null;

  if (!token) {
    return (
      <Card className="mx-auto max-w-sm">
        <CardHeader>
          <CardTitle>Admin access</CardTitle>
          <CardDescription>Enter the ADMIN_TOKEN to manage releases.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="admin-token">Admin token</Label>
            <Input
              id="admin-token"
              type="password"
              autoComplete="off"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && input.trim()) setToken(input.trim());
              }}
            />
          </div>
          <Button className="w-full" onClick={() => input.trim() && setToken(input.trim())}>
            Continue
          </Button>
        </CardContent>
      </Card>
    );
  }

  return <>{children(token)}</>;
}

export function SignOutButton() {
  // Each useAdminToken() call owns independent state, so mutating it here would
  // never reach TokenGate's copy. Clear the stored token and reload — the gate
  // re-reads localStorage on mount and shows the sign-in card.
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        localStorage.removeItem(STORAGE_KEY);
        window.location.reload();
      }}
    >
      Sign out
    </Button>
  );
}
