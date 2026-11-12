// Static definitions: hand seals, jutsu, dōjutsu (eye) types, presets and abilities.

export const SEALS = [
  { id: 'rat',    name: 'Rat',    jp: 'Ne',      kanji: '子', key: '1', easy: ['✌️↑', '✊'],   hint: 'One hand: two fingers up. Other hand: a fist touching it.' },
  { id: 'ox',     name: 'Ox',     jp: 'Ushi',    kanji: '丑', key: '2', easy: ['✌️→', '✌️←'], hint: 'Both hands: two fingers pointing sideways, hands together.' },
  { id: 'tiger',  name: 'Tiger',  jp: 'Tora',    kanji: '寅', key: '3', easy: ['✌️↑', '✌️↑'], hint: 'Both hands: index + middle fingers up, hands side by side.' },
  { id: 'hare',   name: 'Hare',   jp: 'U',       kanji: '卯', key: '4', easy: ['✌️↑', '🖐️'],  hint: 'One hand: two fingers up. Other hand: open palm.' },
  { id: 'dragon', name: 'Dragon', jp: 'Tatsu',   kanji: '辰', key: '5', easy: ['🖐️↑', '🖐️↑'], hint: 'Both hands open, fingers pointing up, side by side.' },
  { id: 'snake',  name: 'Snake',  jp: 'Mi',      kanji: '巳', key: '6', easy: ['✊', '✊'],     hint: 'Both hands closed into fists, held together.' },
  { id: 'horse',  name: 'Horse',  jp: 'Uma',     kanji: '午', key: '7', easy: ['☝️↑', '☝️↑'], hint: 'Both hands: only the index finger up, tips close.' },
  { id: 'ram',    name: 'Ram',    jp: 'Hitsuji', kanji: '未', key: '8', easy: ['✌️↑', '☝️↑'], hint: 'One hand: two fingers up. Other hand: one finger up.' },
  { id: 'monkey', name: 'Monkey', jp: 'Saru',    kanji: '申', key: '9', easy: ['🖐️→', '🖐️←'], hint: 'Both hands open and flat, fingers pointing sideways.' },
  { id: 'bird',   name: 'Bird',   jp: 'Tori',    kanji: '酉', key: '0', easy: ['🖐️↑', '🖐️↓'], hint: 'Both hands open: one pointing up, the other pointing down.' },
  { id: 'dog',    name: 'Dog',    jp: 'Inu',     kanji: '戌', key: '-', easy: ['🖐️→', '✊'],   hint: 'One hand flat & sideways laid over a fist.' },
  { id: 'boar',   name: 'Boar',   jp: 'I',       kanji: '亥', key: '=', easy: ['🖐️↓', '🖐️↓'], hint: 'Both hands open, fingers pointing down.' },
  { id: 'clone',  name: 'Clone',  jp: 'Bunshin', kanji: '十', key: 'c', easy: ['✌️↑', '✌️→'], hint: 'Cross seal: one hand two fingers up, the other two fingers sideways.' },
];
export const SEAL_MAP = Object.fromEntries(SEALS.map(s => [s.id, s]));

// "Easy seal" rule table. Hand token = shape + direction.
// Shapes: F fist, 1 index only, 2 index+middle, O open. Directions: U up, S sideways, D down.
export const SEAL_RULES = {
  '2U+F': 'rat',
  '2S+2S': 'ox',
  '2U+2U': 'tiger',
  '2U+OU': 'hare', '2U+OS': 'hare', '2U+OD': 'hare',
  'OU+OU': 'dragon',
  'F+F': 'snake',
  '1U+1U': 'horse',
  '1U+2U': 'ram',
  'OS+OS': 'monkey',
  'OD+OU': 'bird',
  'F+OS': 'dog',
  'OD+OD': 'boar',
  '2S+2U': 'clone',
};

export const JUTSUS = [
  {
    id: 'fireball', name: 'Fire Style: Fireball Jutsu', romaji: 'Katon: Gōkakyū no Jutsu', kanji: '火遁・豪火球の術',
    seals: ['snake', 'ram', 'monkey', 'boar', 'horse', 'tiger'], cost: 30, color: '#ff7a1f',
    voice: ['fireball', 'fire ball', 'katon', 'gokakyu', 'goka', 'great fire'],
  },
  {
    id: 'phoenix', name: 'Fire Style: Phoenix Flower Jutsu', romaji: 'Katon: Hōsenka no Jutsu', kanji: '火遁・鳳仙火の術',
    seals: ['rat', 'tiger', 'dog', 'ox', 'hare', 'tiger'], cost: 25, color: '#ff9a3c',
    voice: ['phoenix', 'housenka', 'hosenka', 'phoenix flower'],
  },
  {
    id: 'chidori', name: 'Chidori', romaji: 'Chidori — One Thousand Birds', kanji: '千鳥',
    seals: ['ox', 'hare', 'monkey'], cost: 30, color: '#7fd0ff',
    voice: ['chidori', 'chi dori', 'lightning blade', 'chidory'],
  },
  {
    id: 'rasengan', name: 'Rasengan', romaji: 'Spiralling Sphere', kanji: '螺旋丸',
    seals: [], gesture: 'Hold ONE open palm toward the camera (~1s). Raise it above your head to evolve it.', cost: 25, color: '#4aa8ff',
    voice: ['rasengan', 'rasen gan', 'rasingan'],
  },
  {
    id: 'clone', name: 'Shadow Clone Jutsu', romaji: 'Kage Bunshin no Jutsu', kanji: '影分身の術',
    seals: ['clone'], cost: 35, color: '#ffd166',
    voice: ['shadow clone', 'kage bunshin', 'clone jutsu', 'clones'],
  },
  {
    id: 'summon', name: 'Summoning Jutsu', romaji: 'Kuchiyose no Jutsu', kanji: '口寄せの術',
    seals: ['boar', 'dog', 'bird', 'monkey', 'ram'], cost: 40, color: '#e9e2d0',
    voice: ['summoning', 'kuchiyose', 'summon'],
  },
  {
    id: 'earthwall', name: 'Earth Style: Mud Wall', romaji: 'Doton: Doryūheki', kanji: '土遁・土流壁',
    seals: ['tiger', 'hare', 'boar', 'dog'], cost: 30, color: '#b08a5a',
    voice: ['earth wall', 'mud wall', 'doton', 'doryuheki', 'earth style'],
  },
  {
    id: 'waterdragon', name: 'Water Style: Water Dragon Jutsu', romaji: 'Suiton: Suiryūdan no Jutsu (abridged seals)', kanji: '水遁・水龍弾の術',
    seals: ['ox', 'monkey', 'hare', 'rat', 'boar', 'bird'], cost: 40, color: '#39b6ff',
    voice: ['water dragon', 'suiton', 'suiryudan', 'water style'],
  },
];
export const JUTSU_MAP = Object.fromEntries(JUTSUS.map(j => [j.id, j]));

// Eye families drive which abilities unlock.
export const EYES = {
  none:            { name: 'Natural',              short: 'Natural',      family: 'none' },
  sharingan1:      { name: 'Sharingan · 1 Tomoe',   short: '1 Tomoe',      family: 'sharingan', glow: '#ff2a2a' },
  sharingan2:      { name: 'Sharingan · 2 Tomoe',   short: '2 Tomoe',      family: 'sharingan', glow: '#ff2a2a' },
  sharingan3:      { name: 'Sharingan · 3 Tomoe',   short: '3 Tomoe',      family: 'sharingan', glow: '#ff2a2a' },
  ms_itachi:       { name: 'Mangekyō · Pinwheel',   short: 'MS Pinwheel',  family: 'mangekyo',  glow: '#ff3322', aura: '#ff4a2e', who: 'Itachi' },
  ms_kakashi:      { name: 'Mangekyō · Tri-Scythe', short: 'MS Scythe',    family: 'mangekyo',  glow: '#ff3322', aura: '#3ad0ff', who: 'Kakashi / Obito' },
  ms_sasuke:       { name: 'Mangekyō · Tri-Star',   short: 'MS Star',      family: 'mangekyo',  glow: '#ff3322', aura: '#a35cff', who: 'Sasuke' },
  ms_shisui:       { name: 'Mangekyō · Four Blade', short: 'MS 4-Blade',   family: 'mangekyo',  glow: '#ff3322', aura: '#3dff9a', who: 'Shisui' },
  ms_madara:       { name: 'Mangekyō · Triple Arc', short: 'MS Arc',       family: 'mangekyo',  glow: '#ff3322', aura: '#3a78ff', who: 'Madara' },
  ems_sasuke:      { name: 'Eternal Mangekyō · Star',  short: 'EMS Star',  family: 'eternal',   glow: '#ff3322', aura: '#a35cff', who: 'Sasuke' },
  ems_madara:      { name: 'Eternal Mangekyō · Arc',   short: 'EMS Arc',   family: 'eternal',   glow: '#ff3322', aura: '#3a78ff', who: 'Madara' },
  rinnegan:        { name: 'Rinnegan',              short: 'Rinnegan',     family: 'rinnegan',  glow: '#b48cff', aura: '#a35cff', fullEye: true, sclera: 'rgba(196,180,238,0.92)', scale: 1.5 },
  rinnegan_tomoe:  { name: 'Rinnegan · Six Tomoe',  short: 'Rinne 6-Tomoe', family: 'rinnegan', glow: '#b48cff', aura: '#a35cff', fullEye: true, sclera: 'rgba(196,180,238,0.92)', scale: 1.5 },
  rinne_sharingan: { name: 'Rinne-Sharingan',       short: 'Rinne-Shar.',  family: 'rinne',     glow: '#ff2244', aura: '#ff2a4a', fullEye: true, sclera: 'rgba(170,14,30,0.9)', scale: 1.5 },
  byakugan:        { name: 'Byakugan',              short: 'Byakugan',     family: 'byakugan',  glow: '#e6dcff', fullEye: true, sclera: 'rgba(240,236,252,0.85)', scale: 1.05, veins: true },
  tenseigan:       { name: 'Tenseigan',             short: 'Tenseigan',    family: 'tenseigan', glow: '#5fd8ff', aura: '#5fd8ff', scale: 1.1 },
};
export const EYE_ORDER = Object.keys(EYES);

export const PRESETS = [
  { id: 'natural',      name: 'Natural',           left: 'none',            right: 'none',        third: 'none' },
  { id: 'sharingan',    name: 'Sharingan',         left: 'sharingan3',      right: 'sharingan3',  third: 'none' },
  { id: 'itachi',       name: 'Itachi',            left: 'ms_itachi',       right: 'ms_itachi',   third: 'none' },
  { id: 'sasuke',       name: 'Sasuke · MS',       left: 'ms_sasuke',       right: 'ms_sasuke',   third: 'none' },
  { id: 'sasuke_ems',   name: 'Sasuke · EMS',      left: 'ems_sasuke',      right: 'ems_sasuke',  third: 'none' },
  { id: 'sasuke_rinne', name: 'Sasuke · Rinnegan', left: 'rinnegan_tomoe',  right: 'ems_sasuke',  third: 'none' },
  { id: 'kakashi',      name: 'Kakashi',           left: 'ms_kakashi',      right: 'none',        third: 'none' },
  { id: 'obito',        name: 'Obito',             left: 'rinnegan',        right: 'ms_kakashi',  third: 'none' },
  { id: 'shisui',       name: 'Shisui',            left: 'ms_shisui',       right: 'ms_shisui',   third: 'none' },
  { id: 'madara',       name: 'Madara · EMS',      left: 'ems_madara',      right: 'ems_madara',  third: 'none' },
  { id: 'madara_sp',    name: 'Madara · Six Paths', left: 'rinnegan_tomoe', right: 'rinnegan_tomoe', third: 'rinne_sharingan' },
  { id: 'pain',         name: 'Pain',              left: 'rinnegan',        right: 'rinnegan',    third: 'none' },
  { id: 'hyuga',        name: 'Hyūga',             left: 'byakugan',        right: 'byakugan',    third: 'none' },
  { id: 'kaguya',       name: 'Kaguya',            left: 'byakugan',        right: 'byakugan',    third: 'rinne_sharingan' },
  { id: 'toneri',       name: 'Toneri',            left: 'tenseigan',       right: 'tenseigan',   third: 'none' },
  { id: 'hybrid',       name: 'Hybrid',            left: 'byakugan',        right: 'sharingan3',  third: 'none' },
];

export const ABILITIES = [
  { id: 'tsukuyomi', name: 'Tsukuyomi', kanji: '月読', requires: ['mangekyo', 'eternal'], key: 't', cost: 40,
    how: 'genjutsu', voice: ['tsukuyomi', 'tsukiyomi'] },
  { id: 'amaterasu', name: 'Amaterasu', kanji: '天照', requires: ['mangekyo', 'eternal'], key: 'a', cost: 15,
    how: 'wink to aim', voice: ['amaterasu'] },
  { id: 'kamui', name: 'Kamui', kanji: '神威', requires: ['mangekyo', 'eternal'], key: 'k', cost: 30,
    how: 'point & hold', voice: ['kamui', 'kamoi'] },
  { id: 'susanoo', name: 'Susanoo', kanji: '須佐能乎', requires: ['mangekyo', 'eternal', 'rinnegan'], key: 'u', cost: 0, toggle: true,
    how: 'aura · toggle', voice: ['susanoo', 'susano', 'susanu'] },
  { id: 'shinra', name: 'Shinra Tensei', kanji: '神羅天征', requires: ['rinnegan', 'rinne'], key: 'n', cost: 35,
    how: 'push a palm', voice: ['shinra tensei', 'almighty push', 'shinra'] },
  { id: 'byakuganVision', name: 'All-Seeing Sight', kanji: '白眼', requires: ['byakugan'], key: 'b', cost: 0, toggle: true,
    how: 'chakra sight · toggle', voice: ['all seeing', 'chakra vision'] },
  { id: 'infinite', name: 'Infinite Tsukuyomi', kanji: '無限月読', requires: ['rinne'], key: 'i', cost: 60,
    how: 'red moon', voice: ['infinite tsukuyomi', 'infinite'] },
];
export const ABILITY_MAP = Object.fromEntries(ABILITIES.map(a => [a.id, a]));

export const FAMILY_LABEL = {
  sharingan: 'Sharingan', mangekyo: 'Mangekyō Sharingan', eternal: 'Eternal Mangekyō',
  rinnegan: 'Rinnegan', rinne: 'Rinne-Sharingan', byakugan: 'Byakugan', tenseigan: 'Tenseigan',
};

export const DEFAULT_SETTINGS = {
  mirror: true,
  fit: 'cover',
  showLandmarks: false,
  showHandDebug: true,
  sealMode: 'auto',        // auto | rules | trained
  lenient: true,
  holdMs: 220,
  gestures: true,
  voice: false,
  volume: 0.7,
  quality: 'high',         // low | medium | high
  unlimitedChakra: false,
  knnSensitivity: 1.0,
  cameraId: '',
};

export const MODEL_URLS = {
  bundle: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs',
  wasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
  face: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  hand: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  seg: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite',
};
