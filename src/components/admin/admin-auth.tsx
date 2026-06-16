"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Building2, Check, Copy, Download, ShieldCheck } from "lucide-react";

const STORAGE_KEY = "singleton_credential";
const LEGACY_TOKEN_KEY = "singleton_admin_token"; // pre-tenancy bare admin token

/**
 * Who the console is acting as.
 *  - platform: the master ADMIN_TOKEN (judges) — super-admin over everything.
 *  - provider: an operator authenticated by their secret api key — scoped to
 *    the releases they own.
 */
export type Credential =
  | { kind: "platform"; token: string }
  | { kind: "provider"; key: string; providerId: string; providerName: string };

function loadCredential(): Credential | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as Credential;
    } catch {
      /* corrupt — fall through */
    }
  }
  const legacy = localStorage.getItem(LEGACY_TOKEN_KEY);
  if (legacy) return { kind: "platform", token: legacy };
  return null;
}

function saveCredential(cred: Credential | null) {
  if (!cred) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cred));
  localStorage.removeItem(LEGACY_TOKEN_KEY);
}

export function useCredential() {
  const [cred, setCredState] = useState<Credential | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Magic link for judges/reviewers. Prefer the URL FRAGMENT (/admin#token=...):
    // a fragment is never sent to the server, so the master token never lands in
    // access logs or a Referer header. The legacy ?token= query form is still
    // accepted for older links. Either way the secret is scrubbed from the URL.
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const queryParams = new URLSearchParams(window.location.search);
    const fromUrl = hashParams.get("token") ?? queryParams.get("token");
    if (fromUrl) {
      const c: Credential = { kind: "platform", token: fromUrl };
      saveCredential(c);
      queryParams.delete("token");
      const rest = queryParams.toString();
      // Rebuild without the fragment and without the token query param.
      window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
      setCredState(c);
      setLoaded(true);
      return;
    }
    setCredState(loadCredential());
    setLoaded(true);
  }, []);

  function setCredential(c: Credential | null) {
    saveCredential(c);
    setCredState(c);
  }

  return { cred, setCredential, loaded };
}

/** The auth header for a credential: master token vs. operator key. */
export function authHeaders(cred: Credential): Record<string, string> {
  return cred.kind === "platform"
    ? { "x-admin-token": cred.token }
    : { "x-provider-key": cred.key };
}

/** fetch() with the right auth header + JSON content-type attached. */
export function apiFetch(cred: Credential, url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...authHeaders(cred),
      ...(init?.headers ?? {}),
    },
  });
}

export function SignOutButton() {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        saveCredential(null);
        window.location.reload();
      }}
    >
      Sign out
    </Button>
  );
}

/** Shown once after registration so the operator can save their key. */
function NewKeyPanel({
  providerName,
  apiKey,
  onContinue,
}: {
  providerName: string;
  apiKey: string;
  onContinue: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function downloadKey() {
    // CSV mirroring the familiar cloud access-key download. Fields are quoted and
    // a leading formula character on the (user-supplied) name is neutralized, so
    // the file can't trigger spreadsheet formula injection.
    const cell = (s: string) => `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
    const rows = [
      ["Operator", "Operator key", "Sign-in URL"],
      [providerName, apiKey, `${window.location.origin}/admin`],
    ];
    const csv = rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
    const slug =
      providerName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "operator";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `singleton-${slug}-operator-key.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Operator key downloaded.");
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
        <p className="text-sm font-medium">Account created for {providerName}.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          This is your operator key. Save it now: it is shown only once and lets you manage your
          releases from any device.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 break-all rounded-md border border-dashed bg-background p-2 font-mono text-xs">
            {apiKey}
          </code>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            aria-label="Copy operator key"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(apiKey);
                setCopied(true);
                toast.success("Operator key copied.");
              } catch {
                toast.error("Copy failed. Select and copy it manually.");
              }
            }}
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </Button>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-2 w-full"
          onClick={downloadKey}
        >
          <Download className="size-4" /> Download key (.csv)
        </Button>
      </div>
      <Button className="w-full" onClick={onContinue}>
        Continue to dashboard
      </Button>
    </div>
  );
}

/**
 * Gates the admin console. Resolves to either a platform or provider credential
 * and hands it to `children`. Two ways in: register/sign in as an operator
 * (the B2B path) or paste the platform admin token (judges).
 */
export function AuthGate({ children }: { children: (cred: Credential) => ReactNode }) {
  const { cred, setCredential, loaded } = useCredential();
  const [mode, setMode] = useState<"operator" | "platform">("operator");
  const [companyName, setCompanyName] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState<{
    providerId: string;
    providerName: string;
    apiKey: string;
  } | null>(null);
  const [signInError, setSignInError] = useState<string | null>(null);
  // Platform tokens are verified before the dashboard renders, so a stale token
  // saved for a different environment (e.g. local vs production) is caught here
  // with a clear message instead of failing later as a misleading "session expired".
  const [platformOk, setPlatformOk] = useState(false);
  const platformToken = cred?.kind === "platform" ? cred.token : null;

  useEffect(() => {
    if (!loaded) return;
    if (!platformToken) {
      setPlatformOk(true); // provider or signed-out: nothing to verify here
      return;
    }
    setPlatformOk(false);
    let cancelled = false;
    fetch("/api/admin/session", { method: "POST", headers: { "x-admin-token": platformToken } })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setPlatformOk(true);
        } else {
          setMode("platform");
          setSignInError("That admin token isn't valid for this server. Sign in again.");
          setCredential(null);
        }
      })
      .catch(() => {
        if (!cancelled) setPlatformOk(true); // network blip: don't lock the operator out
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, platformToken]);

  async function signInPlatform(token: string) {
    const t = token.trim();
    if (!t) return;
    setBusy(true);
    setSignInError(null);
    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "x-admin-token": t },
      });
      if (!res.ok) {
        setSignInError("Invalid admin token.");
        return;
      }
      setCredential({ kind: "platform", token: t });
    } catch {
      setSignInError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;
  if (cred && (cred.kind === "provider" || platformOk)) return <>{children(cred)}</>;
  if (platformToken && !platformOk) return null; // verifying a stored platform token

  async function register() {
    if (!companyName.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: companyName.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        provider?: { id: string; name: string };
        apiKey?: string;
        error?: string;
      };
      if (!res.ok || !data.provider || !data.apiKey) {
        toast.error(data.error ?? "Could not create the operator account.");
        return;
      }
      setNewKey({
        providerId: data.provider.id,
        providerName: data.provider.name,
        apiKey: data.apiKey,
      });
    } finally {
      setBusy(false);
    }
  }

  async function signInOperator() {
    const key = keyInput.trim();
    if (!key) return;
    setBusy(true);
    try {
      const res = await fetch("/api/providers/session", {
        method: "POST",
        headers: { "content-type": "application/json", "x-provider-key": key },
      });
      const data = (await res.json().catch(() => ({}))) as {
        provider?: { id: string; name: string };
        error?: string;
      };
      if (!res.ok || !data.provider) {
        toast.error(data.error ?? "That operator key was not recognized.");
        return;
      }
      setCredential({
        kind: "provider",
        key,
        providerId: data.provider.id,
        providerName: data.provider.name,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Operator access</CardTitle>
        <CardDescription>
          Companies sign in to launch and manage their own releases. Reviewing for the hackathon?
          Use the one-click admin link in the testing instructions, or the platform tab below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex gap-2" aria-label="Sign-in mode">
          <Button
            type="button"
            size="sm"
            variant={mode === "operator" ? "default" : "outline"}
            aria-pressed={mode === "operator"}
            onClick={() => setMode("operator")}
          >
            <Building2 className="size-4" /> Operator
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "platform" ? "default" : "outline"}
            aria-pressed={mode === "platform"}
            onClick={() => setMode("platform")}
          >
            <ShieldCheck className="size-4" /> Platform admin
          </Button>
        </div>

        {mode === "operator" ? (
          newKey ? (
            <NewKeyPanel
              providerName={newKey.providerName}
              apiKey={newKey.apiKey}
              onContinue={() =>
                setCredential({
                  kind: "provider",
                  key: newKey.apiKey,
                  providerId: newKey.providerId,
                  providerName: newKey.providerName,
                })
              }
            />
          ) : (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="company">New here? Create an operator account</Label>
                <Input
                  id="company"
                  placeholder="Your company or organization"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && companyName.trim()) void register();
                  }}
                />
                <Button className="w-full" onClick={register} disabled={busy || !companyName.trim()}>
                  Create operator account
                </Button>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="opkey">Already have an operator key?</Label>
                <Input
                  id="opkey"
                  type="password"
                  autoComplete="off"
                  placeholder="op_…"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && keyInput.trim()) void signInOperator();
                  }}
                />
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={signInOperator}
                  disabled={busy || !keyInput.trim()}
                >
                  Sign in
                </Button>
              </div>
            </div>
          )
        ) : (
          <div className="space-y-2">
            <Label htmlFor="admin-token">Admin token</Label>
            <Input
              id="admin-token"
              type="password"
              autoComplete="off"
              value={tokenInput}
              onChange={(e) => {
                setTokenInput(e.target.value);
                if (signInError) setSignInError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void signInPlatform(tokenInput);
              }}
            />
            {signInError && <p className="text-xs text-destructive">{signInError}</p>}
            <Button
              className="w-full"
              onClick={() => void signInPlatform(tokenInput)}
              disabled={busy || !tokenInput.trim()}
            >
              Continue
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
