const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const publicFolder = path.join(__dirname, "public");
const websiteFolder = fs.existsSync(publicFolder) ? publicFolder : __dirname;
app.use(express.static(websiteFolder));

const rooms = new Map();

// Original question bank. Every question has four options and one correct answer.
const QUESTION_BANK = {
  gk: [
    { q: "Which is the largest ocean on Earth?", options: ["Atlantic", "Indian", "Pacific", "Arctic"], answer: 2 },
    { q: "What is the capital of Japan?", options: ["Seoul", "Tokyo", "Beijing", "Bangkok"], answer: 1 },
    { q: "How many continents are there?", options: ["5", "6", "7", "8"], answer: 2 },
    { q: "Which planet is known as the Red Planet?", options: ["Venus", "Mars", "Jupiter", "Mercury"], answer: 1 },
    { q: "Which is the largest mammal?", options: ["Elephant", "Blue whale", "Giraffe", "Hippopotamus"], answer: 1 },
    { q: "The currency of the United Kingdom is the...", options: ["Euro", "Dollar", "Pound sterling", "Franc"], answer: 2 },
    { q: "Which country is famous for the pyramids of Giza?", options: ["Greece", "Egypt", "Mexico", "Peru"], answer: 1 },
    { q: "How many sides does a hexagon have?", options: ["5", "6", "7", "8"], answer: 1 },
    { q: "Which instrument measures temperature?", options: ["Barometer", "Thermometer", "Compass", "Hygrometer"], answer: 1 },
    { q: "Which is the smallest continent by land area?", options: ["Europe", "Australia", "South America", "Antarctica"], answer: 1 },
    { q: "What is the national animal of India?", options: ["Lion", "Bengal tiger", "Elephant", "Leopard"], answer: 1 },
    { q: "Which ocean lies between Africa and Australia?", options: ["Pacific", "Atlantic", "Indian", "Arctic"], answer: 2 },
    { q: "How many colours are traditionally named in a rainbow?", options: ["5", "6", "7", "8"], answer: 2 },
    { q: "Which city is known as the Big Apple?", options: ["London", "New York", "Toronto", "Sydney"], answer: 1 },
    { q: "Which gas do plants absorb from the atmosphere?", options: ["Oxygen", "Nitrogen", "Carbon dioxide", "Hydrogen"], answer: 2 },
    { q: "Which is the tallest mountain above sea level?", options: ["K2", "Kangchenjunga", "Mount Everest", "Makalu"], answer: 2 },
    { q: "How many players are on the field for one football team during play?", options: ["9", "10", "11", "12"], answer: 2 },
    { q: "Which animal is known as the ship of the desert?", options: ["Horse", "Camel", "Donkey", "Yak"], answer: 1 },
    { q: "Which is the largest hot desert?", options: ["Gobi", "Sahara", "Kalahari", "Thar"], answer: 1 },
    { q: "Which language has the most native speakers worldwide?", options: ["English", "Spanish", "Mandarin Chinese", "Hindi"], answer: 2 }
  ],
  maths: [
    { q: "What is 12 × 8?", options: ["86", "92", "96", "108"], answer: 2 },
    { q: "What is the square root of 144?", options: ["10", "11", "12", "14"], answer: 2 },
    { q: "What is 25% of 200?", options: ["25", "40", "50", "75"], answer: 2 },
    { q: "How many degrees are in a right angle?", options: ["45°", "90°", "180°", "360°"], answer: 1 },
    { q: "What is 7 squared?", options: ["14", "42", "49", "56"], answer: 2 },
    { q: "What is the next prime number after 7?", options: ["8", "9", "10", "11"], answer: 3 },
    { q: "What is 3/4 written as a percentage?", options: ["25%", "50%", "75%", "80%"], answer: 2 },
    { q: "What is the perimeter of a square with side 5 cm?", options: ["10 cm", "15 cm", "20 cm", "25 cm"], answer: 2 },
    { q: "What is 15 + 27?", options: ["32", "40", "42", "52"], answer: 2 },
    { q: "What is 1000 divided by 10?", options: ["10", "50", "100", "1000"], answer: 2 },
    { q: "If x + 9 = 16, what is x?", options: ["5", "6", "7", "8"], answer: 2 },
    { q: "What is 2 to the power of 5?", options: ["10", "16", "25", "32"], answer: 3 },
    { q: "How many faces does a cube have?", options: ["4", "6", "8", "12"], answer: 1 },
    { q: "What is 1.5 + 2.5?", options: ["3", "3.5", "4", "4.5"], answer: 2 },
    { q: "What is the value of 9 × 9?", options: ["72", "81", "89", "99"], answer: 1 },
    { q: "What is half of 3/4?", options: ["1/8", "1/4", "3/8", "2/3"], answer: 2 },
    { q: "How many minutes are in 2.5 hours?", options: ["120", "130", "150", "180"], answer: 2 },
    { q: "What is the average of 4, 6 and 8?", options: ["5", "6", "7", "8"], answer: 1 },
    { q: "What is 20% of 90?", options: ["9", "18", "20", "27"], answer: 1 },
    { q: "A triangle's angles add up to...", options: ["90°", "180°", "270°", "360°"], answer: 1 }
  ],
  science: [
    { q: "Which part of a plant mainly absorbs water?", options: ["Leaves", "Flowers", "Roots", "Stem"], answer: 2 },
    { q: "What is the chemical symbol for water?", options: ["CO₂", "H₂O", "O₂", "NaCl"], answer: 1 },
    { q: "Which organ pumps blood around the body?", options: ["Lungs", "Brain", "Heart", "Kidney"], answer: 2 },
    { q: "What force pulls objects toward Earth?", options: ["Friction", "Gravity", "Magnetism", "Pressure"], answer: 1 },
    { q: "Which star is closest to Earth?", options: ["Sirius", "Polaris", "The Sun", "Vega"], answer: 2 },
    { q: "What is the boiling point of water at sea level?", options: ["50°C", "80°C", "100°C", "120°C"], answer: 2 },
    { q: "Which gas do humans need to breathe?", options: ["Oxygen", "Carbon dioxide", "Helium", "Methane"], answer: 0 },
    { q: "What is the centre of an atom called?", options: ["Electron", "Nucleus", "Cell", "Molecule"], answer: 1 },
    { q: "Which vitamin can the body make with sunlight exposure?", options: ["Vitamin A", "Vitamin B12", "Vitamin C", "Vitamin D"], answer: 3 },
    { q: "Which state of matter has a fixed shape and volume?", options: ["Gas", "Liquid", "Solid", "Plasma"], answer: 2 },
    { q: "Which planet has the most prominent ring system?", options: ["Mars", "Saturn", "Venus", "Mercury"], answer: 1 },
    { q: "What is the process by which plants make food?", options: ["Respiration", "Digestion", "Photosynthesis", "Fermentation"], answer: 2 },
    { q: "Which blood cells help fight infection?", options: ["Red cells", "White cells", "Platelets", "Plasma"], answer: 1 },
    { q: "What is the hardest naturally occurring mineral?", options: ["Quartz", "Iron", "Diamond", "Granite"], answer: 2 },
    { q: "Which instrument is used to see very small objects?", options: ["Telescope", "Microscope", "Periscope", "Binoculars"], answer: 1 },
    { q: "What is the SI unit of force?", options: ["Joule", "Watt", "Newton", "Pascal"], answer: 2 },
    { q: "Which part of the cell contains most of its genetic material?", options: ["Nucleus", "Cell wall", "Cytoplasm", "Membrane"], answer: 0 },
    { q: "Sound travels fastest through which of these?", options: ["Vacuum", "Air", "Water", "Steel"], answer: 3 },
    { q: "Which organ helps humans breathe?", options: ["Liver", "Lungs", "Stomach", "Pancreas"], answer: 1 },
    { q: "What is the pH of pure water at room temperature, approximately?", options: ["3", "5", "7", "9"], answer: 2 }
  ],
  alphabet: [
    { q: "Which letter comes immediately after M?", options: ["L", "N", "O", "P"], answer: 1 },
    { q: "How many letters are in the English alphabet?", options: ["24", "25", "26", "27"], answer: 2 },
    { q: "Which is the first vowel in the alphabet?", options: ["A", "E", "I", "O"], answer: 0 },
    { q: "Which letter is 5th from the end?", options: ["U", "V", "W", "X"], answer: 1 },
    { q: "Which letter comes three places after C?", options: ["E", "F", "G", "H"], answer: 1 },
    { q: "Which word comes first alphabetically?", options: ["Banana", "Apple", "Cherry", "Date"], answer: 1 },
    { q: "Which letter is between Q and S?", options: ["P", "R", "T", "U"], answer: 1 },
    { q: "What is the 10th letter of the alphabet?", options: ["H", "I", "J", "K"], answer: 2 },
    { q: "Which of these is not a vowel?", options: ["A", "E", "G", "O"], answer: 2 },
    { q: "How many letters are there from A to F, inclusive?", options: ["5", "6", "7", "8"], answer: 1 },
    { q: "Which letter is directly before Z?", options: ["W", "X", "Y", "V"], answer: 2 },
    { q: "Which pair is in correct alphabetical order?", options: ["D, C", "F, G", "K, J", "P, O"], answer: 1 },
    { q: "What is the 3rd letter after T?", options: ["V", "W", "X", "Y"], answer: 1 },
    { q: "Which letter has the same position number as the number of sides in a pentagon?", options: ["D", "E", "F", "G"], answer: 1 },
    { q: "Which letter is 13th in the alphabet?", options: ["L", "M", "N", "O"], answer: 1 },
    { q: "Which word comes last alphabetically?", options: ["Ant", "Bee", "Yak", "Dog"], answer: 2 },
    { q: "Which letter is two places before H?", options: ["E", "F", "G", "I"], answer: 1 },
    { q: "What letter begins the English alphabet?", options: ["A", "B", "C", "D"], answer: 0 },
    { q: "Which letter is 4th after P?", options: ["S", "T", "U", "V"], answer: 1 },
    { q: "Which letter comes immediately before G?", options: ["D", "E", "F", "H"], answer: 2 }
  ],
  riddles: [
    { q: "What has keys but cannot open locks?", options: ["A map", "A piano", "A door", "A clock"], answer: 1 },
    { q: "What gets wetter as it dries?", options: ["A towel", "The sun", "A sponge", "A cloud"], answer: 0 },
    { q: "What has a face and two hands but no arms or legs?", options: ["A robot", "A clock", "A statue", "A doll"], answer: 1 },
    { q: "What has one eye but cannot see?", options: ["A needle", "A storm", "A potato", "A fish"], answer: 0 },
    { q: "What can travel around the world while staying in one corner?", options: ["A stamp", "A plane", "A map", "A compass"], answer: 0 },
    { q: "What has many teeth but cannot bite?", options: ["A shark", "A comb", "A zipper", "A saw"], answer: 1 },
    { q: "What goes up but never comes down?", options: ["A balloon", "Your age", "Smoke", "A lift"], answer: 1 },
    { q: "What has a neck but no head?", options: ["A bottle", "A shirt", "A guitar", "All of these"], answer: 3 },
    { q: "What has words but never speaks?", options: ["A book", "A radio", "A person", "A bird"], answer: 0 },
    { q: "What has a ring but no finger?", options: ["A phone", "A tree", "A bell", "All of these"], answer: 3 },
    { q: "What is full of holes but still holds water?", options: ["A net", "A sponge", "A basket", "A sieve"], answer: 1 },
    { q: "What has cities but no houses, rivers but no water?", options: ["A painting", "A map", "A dream", "A book"], answer: 1 },
    { q: "What begins with T, ends with T, and has T inside?", options: ["Teapot", "Tent", "Toast", "Ticket"], answer: 0 },
    { q: "What can you catch but not throw?", options: ["A ball", "A cold", "A fish", "A leaf"], answer: 1 },
    { q: "What has four legs but cannot walk?", options: ["A dog", "A table", "A horse", "A cat"], answer: 1 },
    { q: "What has a thumb and four fingers but is not alive?", options: ["A glove", "A hand", "A puppet", "A toy"], answer: 0 },
    { q: "What has to be broken before you can use it?", options: ["A promise", "An egg", "A glass", "A lock"], answer: 1 },
    { q: "What has a bottom at the top?", options: ["A leg", "A hill", "A bottle", "A shoe"], answer: 2 },
    { q: "What can fill a room but takes up no space?", options: ["Furniture", "Light", "Water", "Air"], answer: 1 },
    { q: "What has branches but no fruit, trunk or leaves?", options: ["A bank", "A river", "A road", "A family"], answer: 0 }
  ]
};

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function generateRoomCode() {
  let code;
  do { code = Math.floor(100000 + Math.random() * 900000).toString(); }
  while (rooms.has(code));
  return code;
}
function publicScores(room) {
  return [...room.players.values()].map(p => ({ id: p.id, name: p.name, score: p.score || 0, isHost: p.isHost }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
function sendPlayers(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  io.to(roomCode).emit("players-update", {
    players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, isHost: p.isHost })),
    maxPlayers: room.maxPlayers
  });
}
function clearGameTimers(room) {
  ["countdownTimer", "questionTimer", "answerTimer", "nextTimer"].forEach(key => {
    if (room[key]) clearTimeout(room[key]);
    room[key] = null;
  });
}
function leaveRoom(socket, roomCode) {
  const room = rooms.get(roomCode);
  if (!room || !room.players.has(socket.id)) return;
  room.players.delete(socket.id);
  socket.leave(roomCode);
  if (room.gameStarting) {
    clearGameTimers(room);
    room.gameStarting = false;
    io.to(roomCode).emit("game-countdown-cancelled", { message: "A player left. The countdown has been cancelled." });
  }
  if (room.players.size === 0) {
    clearGameTimers(room);
    rooms.delete(roomCode);
    return;
  }
  if (room.hostId === socket.id) {
    const nextHost = room.players.values().next().value;
    room.hostId = nextHost.id;
    nextHost.isHost = true;
    io.to(roomCode).emit("room-notice", "The host left. A new host has been selected.");
  }
  if (room.inGame && room.players.size < 2) {
    clearGameTimers(room);
    room.inGame = false;
    io.to(roomCode).emit("game-paused", "A player left. At least two players are needed to continue.");
  }
  sendPlayers(roomCode);
}
function sendQuestion(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || !room.inGame) return;
  if (room.roundIndex >= room.questions.length) return finishGame(roomCode);
  room.roundIndex++;
  room.phase = "buzz";
  room.buzzedBy = null;
  room.currentQuestion = room.questions[room.roundIndex - 1];
  const q = room.currentQuestion;
  io.to(roomCode).emit("question-start", {
    round: room.roundIndex, totalRounds: room.rounds,
    question: q.q, options: q.options, buzzSeconds: 15
  });
  room.questionTimer = setTimeout(() => {
    const active = rooms.get(roomCode);
    if (!active || !active.inGame || active.phase !== "buzz") return;
    active.phase = "reveal";
    io.to(roomCode).emit("question-unanswered", { correctAnswer: active.currentQuestion.options[active.currentQuestion.answer], scores: publicScores(active) });
    active.nextTimer = setTimeout(() => sendQuestion(roomCode), 3000);
  }, 15000);
}
function finishGame(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  clearGameTimers(room);
  room.inGame = false;
  room.phase = "finished";
  io.to(roomCode).emit("game-over", { leaderboard: publicScores(room), totalRounds: room.rounds });
}

io.on("connection", socket => {
  console.log("Player connected:", socket.id);

  socket.on("create-room", (data, callback = () => {}) => {
    const name = String(data?.name || "").trim().slice(0, 20);
    const roomName = String(data?.roomName || "Quiz Battle").trim().slice(0, 32);
    const maxPlayers = Number(data?.maxPlayers);
    const rounds = Number(data?.rounds);
    const category = String(data?.category || "mixed");
    if (!name || !Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 15)
      return callback({ success: false, message: "Invalid room settings." });
    const code = generateRoomCode();
    rooms.set(code, {
      hostId: socket.id, maxPlayers, roomName,
      rounds: Number.isInteger(rounds) ? Math.min(20, Math.max(1, rounds)) : 10,
      category: (category === "mixed" || QUESTION_BANK[category]) ? category : "mixed",
      players: new Map([[socket.id, { id: socket.id, name, isHost: true, score: 0 }]]),
      gameStarting: false, countdownTimer: null, questionTimer: null, answerTimer: null, nextTimer: null,
      inGame: false, phase: "lobby", roundIndex: 0, questions: [], currentQuestion: null, buzzedBy: null
    });
    socket.join(code);
    callback({ success: true, code });
    sendPlayers(code);
    console.log("Room created:", code);
  });

  socket.on("join-room", (data, callback = () => {}) => {
    const code = String(data?.code || "").trim();
    const name = String(data?.name || "").trim().slice(0, 20);
    const room = rooms.get(code);
    if (!room || !name) return callback({ success: false, message: "Room not found or invalid name." });
    if (room.inGame || room.gameStarting) return callback({ success: false, message: "This game has already started." });
    if (room.players.size >= room.maxPlayers) return callback({ success: false, message: "Room is full." });
    if ([...room.players.values()].some(p => p.name.toLowerCase() === name.toLowerCase()))
      return callback({ success: false, message: "Username already taken." });
    room.players.set(socket.id, { id: socket.id, name, isHost: false, score: 0 });
    socket.join(code);
    callback({ success: true, code, settings: { roomName: room.roomName, rounds: room.rounds, category: room.category } });
    sendPlayers(code);
    console.log(name, "joined room:", code);
  });

  socket.on("start-game", (callback = () => {}) => {
    const entry = [...rooms.entries()].find(([, room]) => room.players.has(socket.id));
    if (!entry) return callback({ success: false, message: "You are not in a room." });
    const [code, room] = entry;
    if (room.hostId !== socket.id) return callback({ success: false, message: "Only the host can start the game." });
    if (room.players.size < 2) return callback({ success: false, message: "At least 2 players are needed." });
    if (room.gameStarting || room.inGame) return callback({ success: false, message: "The game is already starting or running." });
    room.gameStarting = true;
    const duration = 10;
    const startsAt = Date.now() + duration * 1000;
    io.to(code).emit("game-countdown", { duration, startsAt });
    callback({ success: true });
    room.countdownTimer = setTimeout(() => {
      const active = rooms.get(code);
      if (!active || !active.gameStarting) return;
      active.gameStarting = false;
      active.countdownTimer = null;
      active.inGame = true;
      active.phase = "buzz";
      const category = active.category;
      const pool = category === "mixed" ? Object.values(QUESTION_BANK).flat() : (QUESTION_BANK[category] || QUESTION_BANK.gk);
      active.questions = shuffle(pool).slice(0, active.rounds);
      if (active.questions.length < active.rounds) {
        const extra = shuffle(pool).slice(0, active.rounds - active.questions.length);
        active.questions.push(...extra);
      }
      active.roundIndex = 0;
      active.players.forEach(p => p.score = 0);
      io.to(code).emit("game-started", { code, rounds: active.rounds, category: active.category });
      sendQuestion(code);
    }, duration * 1000);
  });

  socket.on("buzz-in", callback => {
    const entry = [...rooms.entries()].find(([, room]) => room.players.has(socket.id));
    if (!entry) return callback?.({ success: false, message: "You are not in a room." });
    const [code, room] = entry;
    if (!room.inGame || room.phase !== "buzz") return callback?.({ success: false, message: "The buzzer is not open." });
    clearTimeout(room.questionTimer);
    room.questionTimer = null;
    room.phase = "answer";
    room.buzzedBy = socket.id;
    const player = room.players.get(socket.id);
    io.to(code).emit("buzz-locked", { playerId: socket.id, playerName: player.name, answerSeconds: 8 });
    room.answerTimer = setTimeout(() => {
      if (!room.inGame || room.phase !== "answer") return;
      room.phase = "reveal";
      io.to(code).emit("answer-timeout", {
        playerName: player.name,
        correctAnswer: room.currentQuestion.options[room.currentQuestion.answer],
        scores: publicScores(room)
      });
      room.nextTimer = setTimeout(() => sendQuestion(code), 3000);
    }, 8000);
    callback?.({ success: true });
  });

  socket.on("submit-answer", (choice, callback = () => {}) => {
    const entry = [...rooms.entries()].find(([, room]) => room.players.has(socket.id));
    if (!entry) return callback({ success: false, message: "You are not in a room." });
    const [code, room] = entry;
    if (!room.inGame || room.phase !== "answer" || room.buzzedBy !== socket.id)
      return callback({ success: false, message: "Only the player who buzzed in can answer." });
    const index = Number(choice);
    if (!Number.isInteger(index) || index < 0 || index > 3)
      return callback({ success: false, message: "Choose one of the four options." });
    clearTimeout(room.answerTimer);
    room.answerTimer = null;
    room.phase = "reveal";
    const correct = index === room.currentQuestion.answer;
    const player = room.players.get(socket.id);
    if (correct) player.score += 100;
    const result = {
      playerId: socket.id, playerName: player.name, correct,
      selectedIndex: index,
      correctAnswer: room.currentQuestion.options[room.currentQuestion.answer],
      points: correct ? 100 : 0,
      scores: publicScores(room)
    };
    callback({ success: true });
    io.to(code).emit("answer-result", result);
    room.nextTimer = setTimeout(() => sendQuestion(code), 3500);
  });

  socket.on("leave-room", callback => {
    const entry = [...rooms.entries()].find(([, room]) => room.players.has(socket.id));
    if (entry) leaveRoom(socket, entry[0]);
    callback?.({ success: true });
  });

  socket.on("disconnect", () => {
    for (const [code, room] of rooms) if (room.players.has(socket.id)) leaveRoom(socket, code);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`First Tap Wins running at http://localhost:${PORT}`));
