# Cloudflare DNS Migration — kuasa.tech

Migrating DNS for **kuasa.tech** from Namecheap BasicDNS to Cloudflare (nameserver-based).

## Current state (pre-migration)

Registrar / DNS: **Namecheap** (`dns1/dns2.registrar-servers.com`)

| Record | Value | Notes |
|---|---|---|
| `api.kuasa.tech` A | `178.105.130.105` | **the live app** (served on `:8443`) — preserve exactly |
| `kuasa.tech` (root) A | `185.158.133.1` | different server |
| `www.kuasa.tech` | — | not set |
| MX / TXT | none | nothing to migrate |

Origin cert on `api.kuasa.tech:8443`: valid **Let's Encrypt** cert (`CN=api.kuasa.tech`), good through **Sep 28, 2026**.

## Key principle

Switching nameservers hands Cloudflare authority over **all** DNS for kuasa.tech. Any record not imported into Cloudflare **stops resolving**. Verify the import before flipping.

## Target Cloudflare DNS config

| Record | Value | Cloudflare setting | Why |
|---|---|---|---|
| `api.kuasa.tech` A | `178.105.130.105` | **Proxied (orange)** | Our app / our VPS. Proxying hides origin IP + adds DDoS/edge. Works on 8443 (a supported proxied HTTPS port). |
| `kuasa.tech` root A | `185.158.133.1` | **DNS-only (grey)** | Different server we don't fully control — don't proxy it. |
| `www.kuasa.tech` | (if added) | **DNS-only (grey)** | Same reasoning. |

SSL/TLS mode in Cloudflare: **Full (strict)** — safe because the origin cert on 8443 is valid.
Note: once `api` is proxied, Cloudflare auto-issues its own edge cert for `api.kuasa.tech`; the Let's Encrypt cert stays on the origin leg. Both are expected.

## Migration steps

### 1. Verify records in Cloudflare (before touching nameservers)
Cloudflare dashboard → **DNS → Records**. Confirm both A records exist with the exact IPs above, `api` set to proxied, root/www set to DNS-only.

### 2. Flip nameservers at Namecheap
1. Log in to Namecheap → **Domain List**.
2. **kuasa.tech** → **Manage**.
3. **Domain** tab → **Nameservers** section.
4. Change dropdown from **Namecheap BasicDNS** → **Custom DNS**.
5. Enter both (delete old `dns1/dns2.registrar-servers.com`):
   - `marty.ns.cloudflare.com`
   - `yolanda.ns.cloudflare.com`
6. Click the **green ✓ checkmark** to save (not saved until clicked).

### 3. Confirm in Cloudflare
Click **"Check nameservers now"** in the Cloudflare dashboard. Propagation: minutes to ~24h. Cloudflare emails when active.

## Verification commands

```bash
# Nameservers — should return marty/yolanda.ns.cloudflare.com once propagated
dig +short NS kuasa.tech

# App resolution + reachability
dig +short A api.kuasa.tech

# Origin cert on 8443
echo | openssl s_client -connect api.kuasa.tech:8443 -servername api.kuasa.tech 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
```

## Clean URL (no :8443) — Origin Rule

Problem: browsers hitting `https://api.kuasa.tech` default to port 443, which on the shared VPS
belongs to thesissifu (not our app) → Cloudflare returned **HTTP 525** (origin SSL handshake failed).
Our app only listens on **8443**.

Fix: a Cloudflare **Origin Rule** rewrites the destination port to 8443 for our hostname.
- Cloudflare → **Rules → Origin Rules → Create rule**
- Name: `api-8443`
- Match: `Hostname` **equals** `api.kuasa.tech`
- Action: **Destination Port** = `8443`
- Deploy.

Result: visitors use standard `https://api.kuasa.tech` (443 at edge), Cloudflare forwards to
origin `:8443` where the app runs. Both clean URL and `:8443` work.

## Status: COMPLETE (2026-07-17)

- Nameservers: `marty` / `yolanda.ns.cloudflare.com` (active)
- `api.kuasa.tech`: proxied, SSL Automatic (resolves to Full/strict against valid origin cert)
- Clean URL verified: `https://api.kuasa.tech/docs`, `/`, `/openapi.json` all return HTTP 200
- Legacy `https://api.kuasa.tech:8443/docs` still returns 200

## Rollback

Revert nameservers at Namecheap back to `dns1.registrar-servers.com` / `dns2.registrar-servers.com` (Namecheap BasicDNS). Propagation applies to the rollback too.
