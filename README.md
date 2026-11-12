# Convo chat

Next.js chat client backed by MongoDB and a separate authenticated Socket.IO server.

## Local setup

1. Copy `.env.example` to `.env.local` in this directory and configure MongoDB, an `AUTH_SECRET` (at least 32 characters), and Resend.
2. Copy `Socket-Server/.env.example` to `Socket-Server/.env`. Use the **same** `AUTH_SECRET` in both files.
3. In `Socket-Server`, install dependencies if needed and run `npm run dev`.
4. In `nextjs-socketio-chat-app`, run `npm run dev`.
5. Open `http://localhost:3001`.

Generate a development session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Resend requires `RESEND_API_KEY` and a verified `EMAIL_FROM`. Email registration and password recovery deliberately return an error when delivery is not configured. OTPs expire after 10 minutes, can be resent once per minute, are limited to five sends per email per hour, and allow five verification attempts.

Authenticator-based 2FA can be enabled or disabled under Profile settings. Disabling it requires a current authenticator code. Session cookies are signed, `HttpOnly`, and `Secure` in production.

## Docker

Build and run the production Next.js image from this directory. `NEXT_PUBLIC_SOCKET_URL` is compiled into the browser bundle at build time, so use the Socket.IO URL that browsers will reach:

```bash
docker build \
  --build-arg NEXT_PUBLIC_SOCKET_URL=http://localhost:3002 \
  -t convo-chat-web .
docker run --name convo-chat-web \
  --env-file .env.local \
  -p 3001:3001 \
  convo-chat-web
```

For production, replace the local Socket.IO URL with its public HTTPS origin. If using Web Push, pass `NEXT_PUBLIC_VAPID_PUBLIC_KEY` as a build argument too; it is a public key, not a secret. The runtime environment file must contain the server-side settings from `.env.example`, including `MONGODB_URI` (or the supported DB triplet) and the shared `AUTH_SECRET`. Do not copy environment files or secrets into the image. When MongoDB runs on the Docker host, use a host-reachable address rather than `localhost` from inside the container.

The standalone image listens on port `3001`. Run the separately containerized Socket.IO server using the [Socket-Server Docker instructions](https://github.com/anwar7736/Socket-Server#docker).

## Chat features

- Responsive dark chat and sign-in screens.
- Installable PWA shell; API responses and private attachments are not cached offline.
- Opt-in Web Push message notifications, including ticket links that survive a sign-in redirect. Configure the VAPID keys in `.env.local` and the production host before enabling notifications; browser permission and HTTPS are required.
- Private and group messages with image, PDF, audio, video, and recorded voice-note attachments.
- WebRTC audio/video calling with Socket.IO signaling. Calls use browser peer-to-peer connections, support up to eight participants, and use short-lived TURN REST credentials when `TURN_URLS` and `TURN_SHARED_SECRET` are configured. Without TURN, some restrictive networks will not connect.

## Production and scale notes

- **Vercel frontend + VPS Socket.IO:** set `NEXT_PUBLIC_SOCKET_URL` in Vercel to the public HTTPS Socket.IO hostname (for example, `https://socket.example.com`). Set `AUTH_SECRET` in Vercel and the VPS `.env` to the exact same random value of at least 32 characters. On the VPS, set `CORS_ORIGINS` to the exact browser origins of the app, comma-separated (for example, `https://chat.example.com,https://preview.chat.example.com`). The browser requests a signed, 60-second socket ticket from the authenticated Next.js API for every connection/reconnection, so the VPS does not need access to the app's session cookie or database. Do not use wildcard origins; give Vercel preview deployments a stable custom domain and add that exact origin. Serve the VPS through HTTPS and a WebSocket-capable reverse proxy.
- Attachments, voice notes and profile photos are stored in MongoDB (GridFS bucket `files`), so every instance (including Vercel functions) serves the same files. Uploads are limited to 4 MB on Vercel (its request size limit); set `MAX_UPLOAD_MB` on other hosts. Files from the old `uploads/` folder are still served when present.
- For Web Push, run `npx web-push generate-vapid-keys` and set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` in the frontend environment. Keep the private key secret; use HTTPS in production.
- The Socket.IO server currently keeps presence and call state in process memory. Multi-instance deployments need the Socket.IO Redis adapter and shared presence/call coordination.
- Group calling is peer-to-peer mesh, capped at eight participants. Use an SFU for larger or high-traffic group calls.
- Configure a real TURN service for reliable calls across NATs/firewalls. TURN credentials are generated per signed-in user and expire after one hour.
- Use TLS, a unique production `AUTH_SECRET`, a verified email sender, and strict origin values in `CORS_ORIGINS`. Never use the development fallback secret in production.

## Run and check

```bash
npm run build
npm run start
```

Run the Socket.IO server separately from its directory with `npm start`.

See the [Socket-Server deployment guide](https://github.com/anwar7736/Socket-Server/blob/main/README.md) for VPS and reverse-proxy setup.
