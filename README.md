# TravelStar

A React Native (Expo Router) + Express + Prisma + PostgreSQL travel application.

See [docs/REMEDIATION.md](docs/REMEDIATION.md) for the production-readiness program this codebase is being taken through, and [docs/CONVENTIONS.md](docs/CONVENTIONS.md) for the conventions enforced across the codebase.

## Project layout

- `/` — the Expo Router app (iOS, Android, web)
- `backend/` — the Express + Prisma API and Socket.io server

## Get started

1. Install dependencies (installs both the app and, if you `cd backend`, the API):

   ```bash
   npm install
   cd backend && npm install
   ```

2. Configure the backend environment: copy `backend/.env.example` to `backend/.env` and fill in real values.

3. Start the backend API:

   ```bash
   npm run backend
   ```

4. Start the app:

   ```bash
   npm run start
   ```

   In the output, you'll find options to open the app in a development build, an Android emulator, an iOS simulator, or Expo Go.

## Quality gates

Run from the root, and again from `backend/`:

```bash
npm run typecheck
npm run lint
npm run format
```

`backend/` additionally has `npm run build` (compiles to `dist/`) and `npm test`.

## Learn more

- [Expo documentation](https://docs.expo.dev/versions/v57.0.0/) — this project is pinned to Expo SDK 57; always check the versioned docs before making Expo-related changes, per [AGENTS.md](AGENTS.md).
- [Expo Router](https://docs.expo.dev/router/introduction)
- [Prisma](https://www.prisma.io/docs)
