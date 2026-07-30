# Connector runbook (ReClaw + Keep)

## Two clients, two paths

| Client | MCP | URL / transport |
|--------|-----|-----------------|
| **Grok Build (this laptop)** | reclaw-platform | `http://100.108.130.82:8100/mcp` (Tailscale) |
| **Grok Build** | ravenstack-keep | stdio local (`~/.grok/config.toml`) |
| **Grok chat / Claude (public)** | reclaw-platform only | contents of server `data/mcp_public_url.txt` — must end `/mcp` |
| **Keep** | never public v0 | Tailscale `:8110` or stdio only |

## After any tunnel restart

On Hetzner (`openclaw`):

```bash
systemctl restart reclaw-mcp-tunnel
# wait ~5s for sync script
cat /root/ReClaw-2.0/data/mcp_public_url.txt
curl -sS -m 10 "$(cat /root/ReClaw-2.0/data/mcp_public_url.txt | sed 's|/mcp$|/health|')"
```

Then **update every off-tailnet client** (Grok chat custom connector, Claude custom MCP) to the new URL.

Quick tunnels **rotate hostnames**. Old host will 1033 / DNS fail.

## Health checks

```bash
# Tailscale (from laptop)
curl -sS -m 5 http://100.108.130.82:8100/health
# Keep HTTP if deployed
curl -sS -m 5 http://100.108.130.82:8110/health

# Units on server
ssh openclaw 'systemctl is-active reclaw-mcp-bridge reclaw-mcp-tunnel ravenstack-keep-mcp'
```

## Bridge crash loop (`:8100 address already in use`)

```bash
ssh openclaw '
systemctl stop reclaw-mcp-bridge
fuser -k 8100/tcp || true
sleep 1
systemctl start reclaw-mcp-bridge
systemctl is-active reclaw-mcp-bridge
curl -sS http://127.0.0.1:8100/health
'
```

Do **not** restart `reclaw-mcp-tunnel` unless you want a new public hostname.

## Security

- Public URL = secret (no auth on quick tunnel).  
- Prefer Tailscale for daily ops.  
- Keep MCP: Tailscale-first; no cloudflared for Keep until auth exists.  
- Longer term: **named** Cloudflare tunnel + optional Access.
