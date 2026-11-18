# First Tap Wins

A real-time multiplayer quiz and mini-game website built with Node.js, Express and Socket.IO.

## Run locally

1. Install Node.js (18 or newer recommended).
2. Clone this repository and open its folder in a terminal.
3. Install dependencies:

```bash
npm install
```

4. Check server JavaScript syntax:

```bash
npm run check
```

5. Start the server:

```bash
npm start
```

6. Open `http://localhost:3000`. For multiplayer testing, open a second browser or device and join the same room code.

## Hosting

Deploy this repository as a Node web service. Use `npm start` as the start command. The server listens on the hosting provider's `PORT` environment variable.

### Persistent account data

Account records are stored in `DATA_DIR/store.json`. On a host that supports persistent disks:

- Attach a persistent disk to the service.
- Mount it at a path such as `/var/data`.
- Set `DATA_DIR=/var/data` in the service environment.
- Redeploy and verify that a test account remains after a service restart.

Without persistent storage, account data may be erased during a restart or redeployment. Back up the data file before changing storage configuration.

## Architecture notes

- Quiz and arcade room state is held in server memory. Active rooms are not restored after a server restart.
- Login sessions are held in server memory. Users may need to sign in again after a restart; account records remain in the data file.
- The global leaderboard ranks registered accounts by earned XP.
- The current account store is a lightweight JSON-file implementation, not a managed database. For larger public usage, migrate to a database with backups and monitoring.
- Use HTTPS in production. Do not reuse an important personal password for testing.
- Keep secrets and persistent data out of Git; do not commit `data/store.json`.

## Main features

- Quiz rooms for 1–30 players.
- Question categories, difficulty settings and randomized rounds.
- Mini-game arcade including multiplayer Tic-Tac-Toe and Bingo.
- Player profiles, XP, levels, achievements and match history.
- Optional online accounts and global XP leaderboard.
