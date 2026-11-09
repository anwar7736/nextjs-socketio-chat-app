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

## Chat features

- Responsive dark chat and sign-in screens.
- Installable PWA shell; API responses and private attachments are not cached offline.
- Private and group messages with image, PDF, audio, video, and recorded voice-note attachments.
- WebRTC audio/video calling with Socket.IO signaling. Calls use browser peer-to-peer connections, support up to eight participants, and use short-lived TURN REST credentials when `TURN_URLS` and `TURN_SHARED_SECRET` are configured. Without TURN, some restrictive networks will not connect.

## Production and scale notes

- **Vercel frontend + VPS Socket.IO:** set `NEXT_PUBLIC_SOCKET_URL` in Vercel to the public HTTPS Socket.IO hostname (for example, `https://socket.example.com`). Set `AUTH_SECRET` in Vercel and the VPS `.env` to the exact same random value of at least 32 characters. On the VPS, set `CORS_ORIGINS` to the exact browser origins of the app, comma-separated (for example, `https://chat.example.com,https://preview.chat.example.com`). The browser requests a signed, 60-second socket ticket from the authenticated Next.js API for every connection/reconnection, so the VPS does not need access to the app's session cookie or database. Do not use wildcard origins; give Vercel preview deployments a stable custom domain and add that exact origin. Serve the VPS through HTTPS and a WebSocket-capable reverse proxy.
- Attachments are stored in the app's local `uploads/` directory and served only to message participants. This is suitable for local development or a single persistent host, not horizontally scaled deployments. Use shared object storage before running multiple app instances.
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
