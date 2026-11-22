# First Tap Wins

A real-time multiplayer quiz and mini-game website built with Node.js, Express and Socket.IO.

## Run locally

1. Install Node.js 18 or newer.
2. Open this project folder in Command Prompt.
3. Install dependencies: `npm install`
4. Check JavaScript syntax: `npm run check`
5. Start the server: `npm start`
6. Open `http://localhost:3000`.

For multiplayer testing, open a second browser window or use another device on the same network and join the same six-digit room code.

## Game modes

- Quiz Arena: 1–30 players, configurable rounds, categories and difficulty.
- Bingo Battle: configurable 2–30 player private rooms, individual cards, host number draws and line claims.
- Reaction Rush: synchronized signal and fastest tap wins.
- Memory Match: turn-based shared board for multiplayer rooms, pairs and score tracking.
- Quick Math: ten rounds; the first correct answer earns the point.
- Word Scramble: eight rounds; the first correct word earns the point.
- Tic-Tac-Toe: server-validated turns and in-room rematches.

All mini-games use private six-digit rooms. Most games support a host-selected room size of 2–30 players; Tic-Tac-Toe is limited to two. A player can create a room, share the code, and invite friends. The player profile, XP and achievements are stored locally in that browser; no account or sign-in is required.

## Hosting notes

Deploy as a Node web service with `npm start` as the start command. The server listens on the hosting provider's `PORT` environment variable.

The current room state is held in server memory and active games are lost if the service restarts. For reliable public hosting, use a persistent database and shared session/room infrastructure before scaling to multiple server instances. Use HTTPS in production.

## Checks

`npm run check` validates server JavaScript and inline browser JavaScript syntax. This is a syntax check, not a substitute for two-browser gameplay testing.
