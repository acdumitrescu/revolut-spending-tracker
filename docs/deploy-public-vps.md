# Deploying the public phone app to your own VPS

This publishes the public, client-only build (code only, no data) so an iPhone can install it
as a Home Screen app. The VPS never receives workspace data: money data moves from the Mac to
the phone as an encrypted `.ssbsnap` file over AirDrop (see `docs/snapshot-format.md`).

The private deployment (`deploy.sh`, its own subdomain, its own directory) is a separate thing
and is not touched by anything here. Never put a real hostname, IP, username or SSH detail in
this repository: use the environment variables and placeholders below.

## What runs where

- `docker-compose.public.yml`: one read-only nginx container serving the `client-only` build,
  bound to `127.0.0.1:3178`. It needs no `.env` file.
- `nginx.public.conf`: serves the app, sets `no-cache` on `/sw.js`, `/manifest.webmanifest` and
  `/index.html`, and long-lived caching on hashed assets.
- Caddy on the VPS: terminates HTTPS and proxies the new subdomain to `127.0.0.1:3178`.

## 1. DNS

Add an A record (and AAAA if the VPS has IPv6) for a new subdomain pointing at the VPS:

```
<phone-subdomain>.<your-domain>.   A   <vps-public-ip>
```

Use a new name. Leave the existing private subdomain alone. Wait until it resolves
(`dig +short <phone-subdomain>.<your-domain>`) before the first HTTPS request, so Caddy can get
its certificate.

## 2. Deploy the container

From a clean checkout of `main` or a `public/*` branch (the script refuses anything else):

```sh
export SSB_PUBLIC_REMOTE_HOST=<ssh-host-alias>        # required
export SSB_PUBLIC_REMOTE_PATH=/srv/docker/ssb-public  # optional, this is the default

scripts/deploy-public.sh --dry-run   # prints branch, host, path and file count; contacts nothing
scripts/deploy-public.sh
```

The script refuses uncommitted changes, local-only personal history and a failed privacy scan,
refuses the private deployment path (`/srv/docker/ssb`), copies only `git ls-files` content with
rsync, then runs `docker compose -f docker-compose.public.yml config` and
`up -d --build` on the remote. On the VPS, check it with:

```sh
curl -sI http://127.0.0.1:3178/ | head -n 5
```

## 3. Caddy site block

Add this to the Caddyfile (a separate block from the private site) and reload Caddy:

```caddy
<phone-subdomain>.<your-domain> {
    encode zstd gzip

    header {
        Strict-Transport-Security "max-age=31536000"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "no-referrer"
        X-Frame-Options "DENY"
        Permissions-Policy "camera=(), microphone=(), geolocation=()"
        Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://api.frankfurter.dev; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
        -Server
    }

    reverse_proxy 127.0.0.1:3178
}
```

HTTPS is automatic. Do not add `Cache-Control` headers in Caddy: nginx already sets them per
file, and overriding them on `/sw.js` would freeze installed phones on an old version.

Why no basic auth: iOS Home Screen apps handle HTTP basic auth badly (repeated prompts, and the
service worker cannot fetch behind it reliably), and the site holds nothing private. It is the
public build: code and a demo CSV only. Real data never touches the server.

Why this CSP: the built app loads only its own scripts and styles. `style-src 'unsafe-inline'`
is there because React components set inline `style` attributes. `img-src data: blob:` covers
generated and imported icons, and `blob:` is also what file downloads use. The one outside
host is `https://api.frankfurter.dev`, used for exchange rates. If you want to start stricter,
run the CSP as `Content-Security-Policy-Report-Only` first and watch the Safari or desktop
browser console for violations.

## 4. Verify

```sh
H=https://<phone-subdomain>.<your-domain>
curl -sI $H/sw.js | grep -i '^cache-control'                  # no-cache
curl -sI $H/manifest.webmanifest | grep -i '^content-type'    # application/manifest+json
curl -sI $H/index.html | grep -i '^cache-control'             # no-cache
curl -sI $H/ | grep -i 'strict-transport\|content-security\|x-content-type\|referrer'
curl -sI $H/assets/$(curl -s $H/ | grep -o 'index-[A-Za-z0-9_-]*\.js' | head -n 1) | grep -i '^cache-control'
# the last one should be: public, max-age=31536000, immutable
```

Then open the site once in a desktop browser with the console open and confirm there are no CSP
violations and that the service worker registers (Application, Service Workers).

## 5. Update

Commit on `main` or a `public/*` branch, then run `scripts/deploy-public.sh` again. Each build
gets a new service worker cache name, so installed phones pick up the new version the next time
the app is opened with a connection and then reload once.

## 6. Roll back

Check out the previous good commit (or `git revert` the bad one) on a `public/*` branch or
`main`, and run `scripts/deploy-public.sh` again. To stop serving entirely, on the VPS run
`docker compose -f docker-compose.public.yml down` in the public directory and remove the Caddy
block. The private deployment is unaffected either way.

## iPhone first install checklist

- [ ] The Mac has the latest synced data and you know the `.ssbsnap` password.
- [ ] On the iPhone, open `https://<phone-subdomain>.<your-domain>` in Safari (not an in-app browser).
- [ ] Share, then Add to Home Screen, then Add. Open it from the Home Screen icon.
- [ ] While still online, open the app once so the offline files are cached; switch to airplane
      mode and reopen it to confirm it still loads.
- [ ] On the Mac, use Send to iPhone and AirDrop the `.ssbsnap` file to the phone.
- [ ] On the iPhone, open the Receive from Mac screen, pick the file and enter the password.
- [ ] Check the dashboard shows the phone copy banner (the phone copy is read-only).
- [ ] Later, to refresh the phone: repeat the last three steps with a new `.ssbsnap`.
