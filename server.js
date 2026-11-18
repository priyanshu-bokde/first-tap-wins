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

/* Phase 7: lightweight persistent account and match store.
   Set DATA_DIR to a persistent mounted directory on hosting platforms. */
const crypto = require("crypto");
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");
const sessions = new Map();
const authAttempts = new Map();
let store = { users: [], matches: [] };
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(STORE_FILE)) store = Object.assign(store, JSON.parse(fs.readFileSync(STORE_FILE, "utf8")));
} catch (error) { console.error("Account store could not be loaded:", error.message); }
let saveQueue = Promise.resolve();
function saveStore() {
  saveQueue = saveQueue.then(async () => {
    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    const temp = STORE_FILE + ".tmp";
    await fs.promises.writeFile(temp, JSON.stringify(store, null, 2), { mode: 0o600 });
    await fs.promises.rename(temp, STORE_FILE);
  }).catch(error => console.error("Account store save failed:", error.message));
  return saveQueue;
}
function cleanName(value) { return String(value || "").trim().replace(/[<>]/g, "").slice(0, 20); }
function hashPassword(password, salt) {
  return new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (err, key) => err ? reject(err) : resolve(key.toString("hex"))));
}
function authUser(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const userId = sessions.get(crypto.createHash("sha256").update(token).digest("hex"));
  return store.users.find(user => user.id === userId) || null;
}
function publicUser(user) {
  return { id:user.id, name:user.name, avatar:user.avatar, xp:user.xp, matches:user.matches, wins:user.wins, badges:user.badges, history:user.history };
}
function accountRateLimit(req,res,next) {
  const key=req.ip, now=Date.now(), recent=(authAttempts.get(key)||[]).filter(t=>now-t<60000);
  if(recent.length>=12)return res.status(429).json({error:"Too many attempts. Please wait a minute."});
  recent.push(now);authAttempts.set(key,recent);next();
}
app.use(express.json({limit:"12kb"}));
app.post("/api/register",accountRateLimit,async(req,res)=>{
  try{
    const name=cleanName(req.body.name),password=String(req.body.password||"");
    if(name.length<3||password.length<8||password.length>128)return res.status(400).json({error:"Choose a name of 3–20 characters and a password of at least 8 characters."});
    if(store.users.some(u=>u.name.toLowerCase()===name.toLowerCase()))return res.status(409).json({error:"That player name is already taken."});
    const salt=crypto.randomBytes(16).toString("hex"),passwordHash=await hashPassword(password,salt);
    const user={id:crypto.randomUUID(),name,avatar:"🎮",salt,passwordHash,xp:0,matches:0,wins:0,badges:[],history:[],createdAt:new Date().toISOString()};
    store.users.push(user);const token=crypto.randomBytes(32).toString("hex");
    sessions.set(crypto.createHash("sha256").update(token).digest("hex"),user.id);
    await saveStore();res.status(201).json({token,user:publicUser(user)});
  }catch(error){res.status(500).json({error:"Could not create the account."});}
});
app.post("/api/login",accountRateLimit,async(req,res)=>{
  try{
    const name=cleanName(req.body.name),password=String(req.body.password||"");
    const user=store.users.find(u=>u.name.toLowerCase()===name.toLowerCase());
    if(!user||!await hashPassword(password,user.salt).then(hash=>crypto.timingSafeEqual(Buffer.from(hash,"hex"),Buffer.from(user.passwordHash,"hex"))).catch(()=>false))return res.status(401).json({error:"Player name or password is incorrect."});
    const token=crypto.randomBytes(32).toString("hex");
    sessions.set(crypto.createHash("sha256").update(token).digest("hex"),user.id);
    res.json({token,user:publicUser(user)});
  }catch(error){res.status(500).json({error:"Could not sign in."});}
});
app.get("/api/me",(req,res)=>{const user=authUser(req);if(!user)return res.status(401).json({error:"Please sign in."});res.json({user:publicUser(user)});});
app.patch("/api/profile",async(req,res)=>{
  const user=authUser(req);if(!user)return res.status(401).json({error:"Please sign in."});
  const name=cleanName(req.body.name),avatar=String(req.body.avatar||"🎮").slice(0,8);
  if(name.length<3)return res.status(400).json({error:"Player name must be at least 3 characters."});
  if(store.users.some(u=>u.id!==user.id&&u.name.toLowerCase()===name.toLowerCase()))return res.status(409).json({error:"That player name is already taken."});
  user.name=name;user.avatar=avatar;await saveStore();res.json({user:publicUser(user)});
});
app.get("/api/leaderboard",(req,res)=>{
  const leaders=[...store.users].sort((a,b)=>b.xp-a.xp||b.wins-a.wins).slice(0,50).map((u,i)=>({rank:i+1,name:u.name,avatar:u.avatar,xp:u.xp,level:Math.floor(u.xp/250)+1,wins:u.wins,matches:u.matches}));
  res.json({leaderboard:leaders});
});
async function recordPersistentMatch(room) {
  const ranked=publicScores(room);
  const matchId=crypto.randomUUID();
  for(let index=0;index<ranked.length;index++){
    const player=room.players.get(ranked[index].id);
    if(!player||!player.userId)continue;
    const user=store.users.find(u=>u.id===player.userId);if(!user)continue;
    const won=index===0,earned=50+(won?25:0);
    user.xp+=earned;user.matches++;if(won)user.wins++;
    if(!user.badges.includes("First Match"))user.badges.push("First Match");
    if(user.wins&&!user.badges.includes("First Win"))user.badges.push("First Win");
    if(user.matches>=5&&!user.badges.includes("5 Matches"))user.badges.push("5 Matches");
    if(user.xp>=500&&!user.badges.includes("500 XP"))user.badges.push("500 XP");
    user.history.unshift({matchId,date:new Date().toISOString(),result:won?"1st place":"Played",score:ranked[index].score});
    user.history=user.history.slice(0,20);
  }
  store.matches.unshift({id:matchId,roomCode:room.code,category:room.category,difficulty:room.difficulty,rounds:room.rounds,finishedAt:new Date().toISOString(),leaderboard:ranked.map(p=>({name:p.name,score:p.score}))});
  store.matches=store.matches.slice(0,500);
  await saveStore();
}


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
  ],
  india: [
    { q: "What is the capital of Rajasthan?", options: ["Jaipur", "Jodhpur", "Udaipur", "Ajmer"], answer: 0 },
    { q: "Which Indian state is famous for the dance form Kathakali?", options: ["Punjab", "Kerala", "Gujarat", "Assam"], answer: 1 },
    { q: "Which river is often called the Ganga's largest tributary?", options: ["Yamuna", "Narmada", "Godavari", "Kaveri"], answer: 0 },
    { q: "Who was the first President of India?", options: ["S. Radhakrishnan", "Rajendra Prasad", "Zakir Husain", "V. V. Giri"], answer: 1 },
    { q: "Which Indian city is known as the Pink City?", options: ["Jaisalmer", "Jaipur", "Bhopal", "Lucknow"], answer: 1 },
    { q: "Which is the largest Indian state by area?", options: ["Madhya Pradesh", "Maharashtra", "Rajasthan", "Uttar Pradesh"], answer: 2 },
    { q: "The Ajanta caves are located in which state?", options: ["Maharashtra", "Bihar", "Odisha", "Karnataka"], answer: 0 },
    { q: "Which movement began with the Dandi March in 1930?", options: ["Quit India", "Non-Cooperation", "Civil Disobedience", "Swadeshi"], answer: 2 },
    { q: "Which schedule of the Indian Constitution lists recognized languages?", options: ["Fifth", "Seventh", "Eighth", "Tenth"], answer: 2 },
    { q: "Which Indian space mission entered Mars orbit in 2014?", options: ["Chandrayaan-1", "Mangalyaan", "Astrosat", "Aditya-L1"], answer: 1 },
    { q: "Who was the first woman to become a state chief minister in India?", options: ["Sucheta Kriplani", "Indira Gandhi", "Sarojini Naidu", "Vijaya Raje Scindia"], answer: 0 },
    { q: "Which article of the Indian Constitution deals with the abolition of untouchability?", options: ["Article 14", "Article 17", "Article 19", "Article 21"], answer: 1 }
  ],
  geography: [
    { q: "Which is the largest continent?", options: ["Africa", "Asia", "Europe", "South America"], answer: 1 },
    { q: "Which ocean is the smallest?", options: ["Arctic", "Indian", "Atlantic", "Southern"], answer: 0 },
    { q: "The Andes mountains are mainly in which continent?", options: ["Asia", "Europe", "South America", "Africa"], answer: 2 },
    { q: "Which country has the city of Istanbul?", options: ["Greece", "Turkey", "Bulgaria", "Egypt"], answer: 1 },
    { q: "Which river flows through Egypt?", options: ["Amazon", "Danube", "Nile", "Mekong"], answer: 2 },
    { q: "Which is the world's largest island, excluding continental landmasses?", options: ["Madagascar", "Borneo", "Greenland", "New Guinea"], answer: 2 },
    { q: "The Equator passes through which of these countries?", options: ["India", "Ecuador", "Japan", "Italy"], answer: 1 },
    { q: "Which strait separates Asia and North America?", options: ["Gibraltar", "Bering", "Malacca", "Hormuz"], answer: 1 },
    { q: "Which country is completely surrounded by South Africa?", options: ["Eswatini", "Lesotho", "Botswana", "Namibia"], answer: 1 },
    { q: "The Atacama Desert is primarily located in which country?", options: ["Chile", "Peru", "Mexico", "Argentina"], answer: 0 },
    { q: "Which sea has the lowest exposed land elevation on Earth at its shore?", options: ["Black Sea", "Dead Sea", "Caspian Sea", "Red Sea"], answer: 1 },
    { q: "Which mountain range traditionally marks part of the boundary between Europe and Asia?", options: ["Alps", "Andes", "Urals", "Rockies"], answer: 2 }
  ],
  history: [
    { q: "Who was the first emperor of the Maurya Empire?", options: ["Ashoka", "Bindusara", "Chandragupta Maurya", "Harsha"], answer: 2 },
    { q: "The ancient Olympic Games began in which country?", options: ["Italy", "Greece", "Egypt", "Persia"], answer: 1 },
    { q: "Who was known as the Iron Man of India?", options: ["Jawaharlal Nehru", "Sardar Vallabhbhai Patel", "Subhas Chandra Bose", "B. R. Ambedkar"], answer: 1 },
    { q: "In which year did India become independent?", options: ["1945", "1946", "1947", "1950"], answer: 2 },
    { q: "Which Mughal emperor commissioned the Taj Mahal?", options: ["Akbar", "Babur", "Shah Jahan", "Aurangzeb"], answer: 2 },
    { q: "The Renaissance began in which European country?", options: ["France", "Italy", "Germany", "Spain"], answer: 1 },
    { q: "Who led the Salt March in 1930?", options: ["Mahatma Gandhi", "Bhagat Singh", "Bal Gangadhar Tilak", "Lala Lajpat Rai"], answer: 0 },
    { q: "Which civilization developed cuneiform writing?", options: ["Roman", "Sumerian", "Mayan", "Inca"], answer: 1 },
    { q: "The Treaty of Versailles was signed in which year?", options: ["1914", "1918", "1919", "1925"], answer: 2 },
    { q: "Who was the last ruler of the Ptolemaic Kingdom of Egypt?", options: ["Nefertiti", "Cleopatra VII", "Hatshepsut", "Ankhesenamun"], answer: 1 },
    { q: "Which event is generally considered the immediate trigger of World War I?", options: ["Invasion of Poland", "Assassination of Archduke Franz Ferdinand", "Russian Revolution", "Treaty of Versailles"], answer: 1 },
    { q: "The Meiji Restoration began in which year?", options: ["1603", "1750", "1868", "1912"], answer: 2 }
  ],
  technology: [
    { q: "What does CPU stand for?", options: ["Central Processing Unit", "Computer Power Utility", "Core Program Unit", "Central Program User"], answer: 0 },
    { q: "Which language is primarily used to structure web pages?", options: ["HTML", "SQL", "C++", "Python"], answer: 0 },
    { q: "What does URL stand for?", options: ["Universal Record Link", "Uniform Resource Locator", "Unified Reference Line", "User Route Link"], answer: 1 },
    { q: "Which device is used to connect different networks?", options: ["Keyboard", "Router", "Monitor", "Printer"], answer: 1 },
    { q: "What does RAM mainly provide to a computer?", options: ["Long-term storage", "Temporary working memory", "Internet access", "Power backup"], answer: 1 },
    { q: "Which company created the Android operating system originally?", options: ["Apple", "Google", "Microsoft", "IBM"], answer: 1 },
    { q: "Which protocol is commonly used to load secure websites?", options: ["FTP", "HTTP", "HTTPS", "SMTP"], answer: 2 },
    { q: "What does CSS control in a web page?", options: ["Structure", "Styling and layout", "Database storage", "Server hosting"], answer: 1 },
    { q: "What is the main purpose of a database index?", options: ["Encrypt every row", "Speed up data lookup", "Replace backups", "Create user accounts"], answer: 1 },
    { q: "Which data structure follows the last-in, first-out principle?", options: ["Queue", "Stack", "Tree", "Graph"], answer: 1 },
    { q: "What does API commonly stand for?", options: ["Application Programming Interface", "Applied Program Internet", "Automated Process Input", "Application Protocol Index"], answer: 0 },
    { q: "Which number system is used internally by digital computers?", options: ["Decimal", "Binary", "Roman", "Hexadecimal only"], answer: 1 }
  ],
  sports: [
    { q: "How many players from one cricket team are on the field during play?", options: ["9", "10", "11", "12"], answer: 2 },
    { q: "Which sport uses a shuttlecock?", options: ["Tennis", "Badminton", "Squash", "Table tennis"], answer: 1 },
    { q: "How many rings are on the Olympic symbol?", options: ["4", "5", "6", "7"], answer: 1 },
    { q: "In football, what is the usual term for scoring three goals by one player in a match?", options: ["Triple", "Hat-trick", "Treble save", "Clean sheet"], answer: 1 },
    { q: "Which country won the first men's Cricket World Cup in 1975?", options: ["India", "Australia", "West Indies", "England"], answer: 2 },
    { q: "How many points is a free throw worth in basketball?", options: ["1", "2", "3", "4"], answer: 0 },
    { q: "The term 'love' is used for a score of zero in which sport?", options: ["Hockey", "Tennis", "Golf", "Boxing"], answer: 1 },
    { q: "Which Indian athlete is known as the Flying Sikh?", options: ["Neeraj Chopra", "Milkha Singh", "P. T. Usha", "Dhanraj Pillay"], answer: 1 },
    { q: "In chess, which piece moves in an L-shape?", options: ["Bishop", "Knight", "Rook", "Queen"], answer: 1 },
    { q: "Which country hosted the first modern Olympic Games in 1896?", options: ["France", "Greece", "United Kingdom", "Italy"], answer: 1 },
    { q: "In Formula One, what flag signals the end of a race?", options: ["Red", "Yellow", "Chequered", "Blue"], answer: 2 },
    { q: "Which athletics event combines ten track-and-field disciplines?", options: ["Heptathlon", "Decathlon", "Pentathlon", "Triathlon"], answer: 1 }
  ]
};

// Give every category a balanced easy / medium / hard question pool.
Object.values(QUESTION_BANK).forEach(questions => {
  const easyEnd = Math.ceil(questions.length / 3);
  const mediumEnd = Math.ceil((questions.length * 2) / 3);
  questions.forEach((question, index) => {
    question.difficulty = index < easyEnd ? "easy" : index < mediumEnd ? "medium" : "hard";
  });
});

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
  if (room.inGame && room.players.size < 1) {
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
  recordPersistentMatch(room).catch(error => console.error("Match history save failed:", error.message));
}

io.on("connection", socket => {
  console.log("Player connected:", socket.id);
  socket.on("account-auth", (token, callback = () => {}) => {
    const raw = String(token || "");
    if (!/^[a-f0-9]{64}$/i.test(raw)) return callback({ success: false, message: "Invalid session." });
    const userId = sessions.get(crypto.createHash("sha256").update(raw).digest("hex"));
    const user = store.users.find(entry => entry.id === userId);
    if (!user) return callback({ success: false, message: "Session expired. Please sign in again." });
    socket.userId = user.id;
    callback({ success: true, user: publicUser(user) });
  });


  socket.on("create-room", (data, callback = () => {}) => {
    const name = cleanName(data?.name);
    const roomName = String(data?.roomName || "Quiz Battle").trim().slice(0, 32);
    const maxPlayers = Number(data?.maxPlayers);
    const rounds = Number(data?.rounds);
    const category = String(data?.category || "mixed");
    if (!name || !Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > 30)
      return callback({ success: false, message: "Invalid room settings." });
    const code = generateRoomCode();
    rooms.set(code, {
      hostId: socket.id, maxPlayers, roomName,
      rounds: Number.isInteger(rounds) ? Math.min(20, Math.max(1, rounds)) : 10,
      category: (category === "mixed" || QUESTION_BANK[category]) ? category : "mixed",
      difficulty: ["mixed", "easy", "medium", "hard"].includes(data?.difficulty) ? data.difficulty : "mixed",
      players: new Map([[socket.id, { id: socket.id, name, isHost: true, score: 0, userId: socket.userId || null }]]),
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
    const name = cleanName(data?.name);
    const room = rooms.get(code);
    if (!room || !name) return callback({ success: false, message: "Room not found or invalid name." });
    if (room.inGame || room.gameStarting) return callback({ success: false, message: "This game has already started." });
    if (room.players.size >= room.maxPlayers) return callback({ success: false, message: "Room is full." });
    if ([...room.players.values()].some(p => p.name.toLowerCase() === name.toLowerCase()))
      return callback({ success: false, message: "Username already taken." });
    room.players.set(socket.id, { id: socket.id, name, isHost: false, score: 0, userId: socket.userId || null });
    socket.join(code);
    callback({ success: true, code, settings: { roomName: room.roomName, rounds: room.rounds, category: room.category, difficulty: room.difficulty } });
    sendPlayers(code);
    console.log(name, "joined room:", code);
  });

  socket.on("start-game", (callback = () => {}) => {
    const entry = [...rooms.entries()].find(([, room]) => room.players.has(socket.id));
    if (!entry) return callback({ success: false, message: "You are not in a room." });
    const [code, room] = entry;
    if (room.hostId !== socket.id) return callback({ success: false, message: "Only the host can start the game." });
    if (room.players.size < 1) return callback({ success: false, message: "At least 1 player is needed." });
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
      const categoryPool = category === "mixed" ? Object.values(QUESTION_BANK).flat() : (QUESTION_BANK[category] || QUESTION_BANK.gk);
      const selectedPool = active.difficulty === "mixed"
        ? categoryPool
        : categoryPool.filter(question => question.difficulty === active.difficulty);
      const pool = selectedPool.length ? selectedPool : categoryPool;
      active.questions = shuffle(pool).slice(0, active.rounds);
      while (active.questions.length < active.rounds) {
        active.questions.push(...shuffle(pool).slice(0, active.rounds - active.questions.length));
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


/* Multiplayer arcade rooms: Tic-Tac-Toe and Bingo. Kept separate from quiz rooms. */
const arcadeRooms = new Map();
function arcadeCode(){let code;do{code=String(Math.floor(100000+Math.random()*900000));}while(arcadeRooms.has(code));return code;}
function bingoCard(){const cols=[];for(let c=0;c<5;c++){const start=c*15+1;const nums=shuffle(Array.from({length:15},(_,i)=>start+i)).slice(0,5);cols.push(nums);}const card=Array.from({length:5},(_,r)=>Array.from({length:5},(_,c)=>cols[c][r]));card[2][2]="FREE";return card;}
function arcadePublic(room, viewerId){return {code:room.code,game:room.game,hostId:room.hostId,players:[...room.players.values()].map(p=>({id:p.id,name:p.name,card:p.id===viewerId?p.card||null:null,marks:p.id===viewerId?p.marks||[]:[]})),started:room.started,turn:room.turn,board:room.board||Array(9).fill(""),drawn:room.drawn||[],lastNumber:room.lastNumber||null,status:room.status||"Waiting for players"};}
function arcadeBroadcast(room){for(const player of room.players.values())io.to(player.id).emit("arcade-state",arcadePublic(room,player.id));}
io.on("connection",socket=>{
 socket.on("arcade-create",({name,game},cb=()=>{})=>{
  name=String(name||"").trim().slice(0,20);game=String(game||"").toLowerCase();
  if(!name||!["bingo","ttt"].includes(game))return cb({success:false,message:"Enter a name and choose Bingo or Tic-Tac-Toe."});
  const code=arcadeCode(),player={id:socket.id,name,card:game==="bingo"?bingoCard():null,marks:[]};
  const room={code,game,hostId:socket.id,players:new Map([[socket.id,player]]),started:false,turn:socket.id,board:Array(9).fill(""),drawn:[],status:"Waiting for another player"};
  arcadeRooms.set(code,room);socket.join("arcade:"+code);cb({success:true,code});arcadeBroadcast(room);
 });
 socket.on("arcade-join",({name,code},cb=()=>{})=>{
  name=String(name||"").trim().slice(0,20);code=String(code||"").trim();const room=arcadeRooms.get(code);
  if(!room||!name)return cb({success:false,message:"Room not found. Check the code and name."});
  if(room.started||room.players.size>=2)return cb({success:false,message:"This room has already started or is full."});
  if([...room.players.values()].some(p=>p.name.toLowerCase()===name.toLowerCase()))return cb({success:false,message:"That name is already in this room."});
  room.players.set(socket.id,{id:socket.id,name,card:room.game==="bingo"?bingoCard():null,marks:[]});socket.join("arcade:"+code);cb({success:true,code});room.status="Ready to start";arcadeBroadcast(room);
 });
 socket.on("arcade-start",(cb=()=>{})=>{
  const room=[...arcadeRooms.values()].find(r=>r.players.has(socket.id));
  if(!room||room.hostId!==socket.id)return cb({success:false,message:"Only the room host can start."});
  if(room.players.size!==2)return cb({success:false,message:"Two players are required."});
  if(room.started)return cb({success:false,message:"The game has already started."});
  room.started=true;room.status=room.game==="bingo"?"Bingo is live! Host draws numbers.":"Player X's turn";arcadeBroadcast(room);cb({success:true});
 });
 socket.on("arcade-ttt-move",({index},cb=()=>{})=>{
  const room=[...arcadeRooms.values()].find(r=>r.players.has(socket.id));
  if(!room||room.game!=="ttt"||!room.started)return cb({success:false,message:"Tic-Tac-Toe is not active."});
  index=Number(index);if(room.turn!==socket.id||!Number.isInteger(index)||index<0||index>8||room.board[index])return cb({success:false,message:"That move is not available."});
  const mark=room.players.get(socket.id).id===room.hostId?"X":"O";room.board[index]=mark;
  const wins=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  const won=wins.some(line=>line.every(i=>room.board[i]===mark));
  if(won){room.status=room.players.get(socket.id).name+" wins!";room.started=false;}
  else if(room.board.every(Boolean)){room.status="It's a draw!";room.started=false;}
  else{room.turn=[...room.players.keys()].find(id=>id!==socket.id);room.status=room.players.get(room.turn).name+"'s turn";}
  arcadeBroadcast(room);cb({success:true});
 });
 socket.on("arcade-bingo-draw",(cb=()=>{})=>{
  const room=[...arcadeRooms.values()].find(r=>r.players.has(socket.id));
  if(!room||room.game!=="bingo"||!room.started||room.hostId!==socket.id)return cb({success:false,message:"Only the host can draw a number during Bingo."});
  const remaining=Array.from({length:75},(_,i)=>i+1).filter(n=>!room.drawn.includes(n));
  if(!remaining.length)return cb({success:false,message:"All numbers have been drawn."});
  room.lastNumber=remaining[Math.floor(Math.random()*remaining.length)];room.drawn.push(room.lastNumber);
  room.status="Number "+room.lastNumber+" called";arcadeBroadcast(room);cb({success:true});
 });
 socket.on("arcade-bingo-mark",({number},cb=()=>{})=>{
  const room=[...arcadeRooms.values()].find(r=>r.players.has(socket.id));
  if(!room||room.game!=="bingo"||!room.started)return cb({success:false,message:"Bingo is not active."});
  const player=room.players.get(socket.id);number=Number(number);
  if(!room.drawn.includes(number)||!player.card.flat().includes(number))return cb({success:false,message:"That number has not been called or is not on your card."});
  if(!player.marks.includes(number))player.marks.push(number);
  arcadeBroadcast(room);cb({success:true});
 });
 socket.on("arcade-bingo-claim",cb=>{
  const room=[...arcadeRooms.values()].find(r=>r.players.has(socket.id));
  if(!room||room.game!=="bingo"||!room.started)return cb({success:false,message:"Bingo is not active."});
  const p=room.players.get(socket.id),marked=(r,c)=>p.card[r][c]==="FREE"||p.marks.includes(p.card[r][c]);
  const lines=[[0,1,2,3,4].map(i=>[2,i]),[0,1,2,3,4].map(i=>[i,2]),[0,1,2,3,4].map(i=>[i,i]),[0,1,2,3,4].map(i=>[i,4-i]),...[0,1,2,3,4].map(r=>[0,1,2,3,4].map(c=>[r,c])),...[0,1,2,3,4].map(c=>[0,1,2,3,4].map(r=>[r,c]))];
  if(!lines.some(line=>line.every(([r,c])=>marked(r,c))))return cb({success:false,message:"No complete line yet. Keep playing!"});
  room.started=false;room.status=p.name+" called BINGO and wins!";arcadeBroadcast(room);cb({success:true});
 });
 socket.on("arcade-leave",cb=>{
  const entry=[...arcadeRooms.entries()].find(([,r])=>r.players.has(socket.id));
  if(entry){const [code,room]=entry;room.players.delete(socket.id);socket.leave("arcade:"+code);if(!room.players.size)arcadeRooms.delete(code);else{room.started=false;room.hostId=room.players.keys().next().value;room.status="Opponent left. Waiting for a new player.";arcadeBroadcast(room);}}
  cb?.({success:true});
 });
 socket.on("disconnect",()=>{for(const [code,room] of arcadeRooms){if(room.players.has(socket.id)){room.players.delete(socket.id);if(!room.players.size)arcadeRooms.delete(code);else{room.started=false;room.hostId=room.players.keys().next().value;room.status="Opponent disconnected.";arcadeBroadcast(room);}}}});
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`First Tap Wins running at http://localhost:${PORT}`));
