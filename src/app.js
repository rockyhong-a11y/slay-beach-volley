import { ROSTER, COURTS, characterFor, normalizeSelection } from './roster.js';
import { createMatch, step, beginCharge, releaseSpike, requestBlock, playerCue, drainEvents } from './engine.js';
import { Renderer, drawPortrait, loadCourtImages } from './render.js';
import { GameAudio } from './audio.js';
import { loadAnimationAssets, loadAnimationManifest } from './sprite-animation.js';

const $ = selector => document.querySelector(selector);
// Native editing stays available; holding any other part of the game has no callout.
for (const type of ['contextmenu', 'selectstart', 'dragstart']) document.addEventListener(type, event => {
  if (!(event.target instanceof Element) || !event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) event.preventDefault();
}, { capture: true });
const STORAGE_KEY = 'slay-beach-volley-v1';
const defaults = { character: 'nova', partner: 'seraph', wins: 0, tourWins: 0, bestTraining: 0, settings: { sfx: true, music: true, haptics: true, shake: true, difficulty: 1, muted: false } };
let saved;
try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { saved = null; }
saved = { ...defaults, ...saved, settings: { ...defaults.settings, ...saved?.settings } };
const hadMovementAssist = 'assist' in saved.settings;
delete saved.settings.assist;
const previousSelection = { character: saved.character, partner: saved.partner };
saved = normalizeSelection(saved);
const hadSelectionMigration = previousSelection.character !== saved.character || previousSelection.partner !== saved.partner;
for (const key of ['wins', 'tourWins', 'bestTraining']) saved[key] = Math.max(0, Number(saved[key]) || 0);

const audio = new GameAudio(saved.settings);
audio.muted = saved.settings.muted;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const images = {}, animationImages = {};
let animationManifest = {}, assetsReady = false, assetsLoading = false, assetRequest = 0, assetPreparation, assetController, activeAssetKey = '';
let activeAssetIds = new Set();
let manifest = {}, renderer, game, mode = 'quick', courtIndex = 0, tourStage = 0;
let playing = false, paused = false, starting = false, finishTimer = null, toastTimer = null, calloutUntil = 0;
let accumulator = 0, previousFrame = performance.now(), hudAt = 0;
const input = { x: 0, y: 0 }, keys = new Set();
let stickPointer = null, spikePointer = null, stickX = 0, stickY = 0;
const dialogs = [...document.querySelectorAll('dialog')];
const modeNames = { quick: '빠른 경기', tour: '비치 투어', training: '타이밍 연습' };
const modeIcons = { quick: 'lightning', tour: 'trophy', training: 'game-controller' };

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch { toast('브라우저 저장 공간을 사용할 수 없어 이번 기록은 저장되지 않았어요.'); }
}
function toast(message) {
  clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.add('visible');
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2700);
}
function opponents() {
  const pool = ROSTER.filter(character => character.id !== saved.character && character.id !== saved.partner);
  const priorities = courtIndex === 0 ? ['raven', 'valkyrie'] : courtIndex === 1 ? ['ember', 'tempest'] : ['onyx', 'atlas'];
  const chosen = priorities.map(id => pool.find(character => character.id === id)).filter(Boolean);
  for (const character of pool) if (chosen.length < 2 && !chosen.includes(character)) chosen.push(character);
  return chosen.map(character => character.id);
}
function makeGame(autoplay = false) {
  return createMatch({ character: saved.character, partner: saved.partner, opponents: opponents(), difficulty: mode === 'tour' ? tourStage : Number(saved.settings.difficulty), autoplay, training: mode === 'training', seed: autoplay ? 82901 : Date.now() });
}
function releaseImage(image) {
  if (!image) return;
  image.onload = image.onerror = null; image.removeAttribute('src');
}
function loadImage(id, signal) {
  if (images[id]?.complete && images[id].naturalWidth) return Promise.resolve(images[id]);
  return new Promise((resolve, reject) => {
    const image = new Image(); image.decoding = 'async';
    const cancel = () => { releaseImage(image); reject(new DOMException('Portrait loading cancelled', 'AbortError')); };
    const finish = error => {
      signal?.removeEventListener('abort', cancel); image.onload = image.onerror = null;
      if (error) { releaseImage(image); reject(error); }
      else { images[id] = image; redrawPortraits(); resolve(image); }
    };
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) { cancel(); return; }
    image.onload = async () => {
      try { await image.decode(); if (signal?.aborted) throw new DOMException('Portrait loading cancelled', 'AbortError'); finish(); }
      catch (error) { finish(error); }
    };
    image.onerror = () => finish(new Error(`Could not load ${id}`));
    image.src = new URL(`../assets/sprites/${id}.webp`, import.meta.url).href;
  });
}
function updateStartButtons() {
  for (const selector of ['#desktop-start', '#mobile-start']) $(selector).disabled = starting || assetsLoading || !renderer;
}
function prepareMatchAssets(match) {
  if (!renderer) return Promise.resolve();
  const ids = [...new Set(match.actors.map(actor => actor.id))], key = [...ids].sort().join(',');
  if (key === activeAssetKey && (assetsReady || assetPreparation)) return assetPreparation || Promise.resolve();
  const request = ++assetRequest;
  assetController?.abort(); assetController = new AbortController();
  const signal = assetController.signal;
  activeAssetKey = key; activeAssetIds = new Set(ids); assetsReady = false; assetsLoading = true;
  document.body.dataset.playersReady = 'false';
  // Drop old decoded sheets before allocating the replacement team. The
  // unchanged dictionaries are shared with Renderer and keep at most four IDs.
  for (const id of Object.keys(animationImages)) if (!activeAssetIds.has(id)) {
    Object.values(animationImages[id]).forEach(releaseImage); delete animationImages[id];
  }
  for (const id of Object.keys(images)) if (!activeAssetIds.has(id)) { releaseImage(images[id]); delete images[id]; }
  updateStartButtons(); $('#load-status').hidden = false;
  const missing = ids.filter(id => !animationImages[id]);
  let preparedSheets;
  assetPreparation = Promise.all([
    Promise.all(ids.map(id => loadImage(id, signal))),
    loadAnimationAssets({ ids: missing, manifest: animationManifest, signal }).then(animation => { preparedSheets = animation.images; return animation; }),
  ]).then(([, animation]) => {
    if (request !== assetRequest) { for (const sheets of Object.values(animation.images)) Object.values(sheets).forEach(releaseImage); return; }
    Object.assign(animationImages, animation.images); assetsReady = true; assetsLoading = false;
    document.body.dataset.playersReady = 'true'; document.body.dataset.animationPlayers = ids.join(',');
    document.body.dataset.animationSheets = String(Object.values(animationImages).reduce((count, sheets) => count + Object.keys(sheets).length, 0));
    $('#load-status').hidden = true; redrawPortraits();
    renderer.resize(); renderer.draw(game, performance.now() / 1000);
  }).catch(error => {
    for (const sheets of Object.values(preparedSheets || {})) Object.values(sheets).forEach(releaseImage);
    if (request === assetRequest) { assetsLoading = false; assetController.abort(); }
    throw error;
  }).finally(() => { if (request === assetRequest) { assetPreparation = null; updateStartButtons(); } });
  return assetPreparation;
}
function preparePreview() {
  prepareMatchAssets(game).catch(error => { if (error.name !== 'AbortError') toast('선수 이미지를 불러오지 못했어요. 다시 선택해주세요.'); });
}
async function waitForCurrentAssets() {
  while (!assetsReady) {
    try { await prepareMatchAssets(game); }
    catch (error) { if (error.name !== 'AbortError') throw error; }
  }
}
function redrawPortraits() {
  if (!Object.keys(manifest).length) return;
  drawPortrait($('#selected-art'), saved.character, images, manifest, { full: true });
  drawPortrait($('#partner-avatar'), saved.partner, images, manifest);
}
function updateSelection() {
  const selected = characterFor(saved.character), partner = characterFor(saved.partner);
  $('#selected-role').textContent = selected.role;
  $('.roster-heading h2').innerHTML = `나의 선수 <span class="mobile-selected-name">${selected.ko}</span>`;
  $('#selected-name').innerHTML = `${selected.name} <span>${selected.ko}</span>`;
  $('.selected-art-word').textContent = selected.name;
  $('#selected-art').setAttribute('aria-label', `선택한 ${selected.ko} 선수`);
  $('#selected-skill').textContent = selected.skill;
  $('#selected-description').textContent = selected.description;
  $('#partner-name').textContent = partner.ko;
  $('#partner-button').setAttribute('aria-label', `함께 뛸 파트너: ${partner.ko}. 눌러서 변경`);
  document.querySelectorAll('.roster-item').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.character === saved.character)));
  for (const stat of ['power', 'speed', 'jump']) $(`#stat-${stat}`).innerHTML = Array.from({ length: 5 }, (_, index) => `<b class="${index < selected[stat] ? 'filled' : ''}"></b>`).join('');
  for (const stat of ['power', 'speed', 'jump']) $(`#stat-${stat}`).setAttribute('aria-label', `${selected[stat]} / 5`);
  $('#wins-label').textContent = saved.wins ? `${saved.wins}승${saved.tourWins ? ` / 투어 ${saved.tourWins}회 우승` : ''}` : '첫 승을 기다리는 중';
  redrawPortraits();
  if (!playing) {
    game = makeGame(true); updateHUD();
    if (renderer) preparePreview();
  }
}
function setMode(next) {
  if (playing || starting) return;
  mode = next; document.body.dataset.mode = mode;
  document.querySelectorAll('.mode-button[data-mode]').forEach(button => {
    const active = button.dataset.mode === mode; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
  $('#mobile-mode-label').textContent = modeNames[mode];
  $('#mobile-mode>img').src = `./assets/icons/${modeIcons[mode]}.svg`;
  $('#court-badge').textContent = mode === 'tour' ? 'BEACH TOUR' : mode === 'training' ? '60 SEC' : '2 VS 2';
  if (mode === 'tour') { tourStage = 0; setCourt(0); }
  game = makeGame(true); updateHUD();
  if (renderer) preparePreview();
  if ($('#mode-dialog').open) $('#mode-dialog').close();
}
function setCourt(index) {
  if (starting) return;
  courtIndex = (index + COURTS.length) % COURTS.length;
  const court = COURTS[courtIndex];
  $('#court-name').textContent = court.en; $('#court-tag').textContent = court.tag; $('#court-index').textContent = `${courtIndex + 1} / 3`;
  $('.court-heading img').src = `./assets/icons/${court.night ? 'moon' : 'sun'}.svg`;
  renderer?.setCourt(courtIndex);
  if (!playing) {
    game = makeGame(true); updateHUD();
    if (renderer) preparePreview();
  }
}
function clearControls() {
  keys.clear(); input.x = input.y = stickX = stickY = 0; stickPointer = spikePointer = null;
  $('#joystick-thumb').style.transform = ''; document.querySelectorAll('.action').forEach(button => button.classList.remove('held'));
  if (game) { game.charging = false; game.charge = 0; game.swingBuffer = game.blockBuffer = 0; }
}
function openDialog(dialog) {
  if (dialog.open) return;
  if (playing) { paused = true; clearControls(); }
  dialog.showModal(); audio.suspend();
}
function showCallout(title, caption, duration = 950) {
  $('#game-callout strong').textContent = title; $('#game-callout small').textContent = caption;
  $('#game-callout').classList.add('show'); calloutUntil = performance.now() + duration;
}
async function startMatch() {
  if (starting) return;
  starting = true;
  audio.unlock().catch(() => {});
  const startButtons = [$('#desktop-start'), $('#mobile-start')]; startButtons.forEach(button => button.disabled = true);
  try {
    if (!renderer) throw new Error('not ready');
    await waitForCurrentAssets();
    clearTimeout(finishTimer);
    dialogs.forEach(dialog => { if (dialog.open) dialog.close(); });
    clearControls(); playing = true; paused = false; game = makeGame(); game.phaseTimer = 2.5;
    document.body.classList.add('playing'); $('#lobby-dock').hidden = true; $('#game-controls').hidden = false; $('#pause-button').hidden = false;
    $('#load-status').hidden = true; $('#game-callout').classList.remove('show'); renderer.trail.length = 0;
    $('#previous-court').disabled = $('#next-court').disabled = true;
    $('#announcer').textContent = `${modeNames[mode]} 시작. ${characterFor(saved.character).ko}와 ${characterFor(saved.partner).ko} 팀입니다.`;
    renderer.resize(); renderer.setCourt(courtIndex); updateHUD();
    $('#game-canvas').focus({ preventScroll: true }); audio.resume().catch(() => {});
  } catch { toast('선수 이미지가 준비되지 않았어요. 잠시 후 다시 시작해주세요.'); }
  finally { starting = false; updateStartButtons(); }
}
function goHome() {
  clearTimeout(finishTimer); playing = false; paused = false; clearControls();
  dialogs.forEach(dialog => { if (dialog.open) dialog.close(); });
  document.body.classList.remove('playing'); $('#lobby-dock').hidden = false; $('#game-controls').hidden = true; $('#pause-button').hidden = true;
  $('#previous-court').disabled = $('#next-court').disabled = false; $('#game-callout').classList.remove('show'); $('#countdown').textContent = '';
  game = makeGame(true); renderer.resize(); updateSelection(); $('#mobile-start').focus({ preventScroll: true });
}
function finish() {
  if (!playing || game.phase !== 'finished') return;
  paused = true; clearControls();
  const won = game.winner === 0;
  if (mode === 'training') {
    const previous = saved.bestTraining; saved.bestTraining = Math.max(previous, game.stats.perfects);
    $('#result-eyebrow').textContent = 'NICE PRACTICE!'; $('#result-title').textContent = '한 번 더, 더 정확하게.';
    $('#result-message').textContent = `60초 연습 완료! 퍼펙트 최고 기록 ${saved.bestTraining}회.`;
    $('#result-score').innerHTML = `${game.stats.perfects}<span> PERFECT</span>`;
    $('#result-play').innerHTML = '한 번 더 연습 <img width="24" height="24" src="./assets/icons/arrow-right.svg" alt="" />';
  } else {
    if (won) saved.wins++;
    const tourComplete = mode === 'tour' && won && tourStage === 2;
    if (tourComplete) saved.tourWins++;
    $('#result-eyebrow').textContent = tourComplete ? 'BEACH TOUR CHAMPION' : won ? 'WHAT A GAME!' : 'ONE MORE RALLY?';
    $('#result-title').textContent = tourComplete ? '세 해변을 모두 정복!' : won ? '해변의 승자는, 당신!' : '다음 한 방은, 당신 차례.';
    $('#result-message').textContent = tourComplete ? '코랄 비치부터 문라이트 베이까지. 완벽한 투어!' : won ? `${COURTS[courtIndex].name}에서 멋진 승리였어요.` : '공 근처로 이동하면 자동 토스! 자동으로 뛰어오를 때 스파이크를 눌러보세요.';
    $('#result-score').innerHTML = `${game.score[0]} <span>:</span> ${game.score[1]}`;
    $('#result-play').innerHTML = `${mode === 'tour' && won && !tourComplete ? '다음 해변으로' : won ? '한 게임 더' : '다시 도전'} <img width="24" height="24" src="./assets/icons/arrow-right.svg" alt="" />`;
  }
  $('#result-spikes').textContent = game.stats.spikes; $('#result-perfects').textContent = game.stats.perfects; $('#result-rally').textContent = game.stats.longestRally;
  persist(); $('#announcer').textContent = $('#result-title').textContent;
  $('#result-dialog').showModal();
}
function handleEvents(events) {
  for (const event of events) {
    renderer.burst(event);
    if (!playing) continue;
    audio.play(event);
    if (event.type === 'hit') {
      if (event.manual && (event.kind === 'spike' || event.kind === 'block')) {
        showCallout(event.kind === 'block' ? 'BLOCK!' : event.perfect ? 'PERFECT!' : 'SPIKE!', event.kind === 'block' ? '네트 앞에서 완벽한 수비!' : event.perfect ? '완벽한 타이밍!' : characterFor(saved.character).skill);
        if (saved.settings.haptics && navigator.vibrate) navigator.vibrate(event.perfect ? [18, 15, 25] : 20);
      } else if ((event.kind === 'set' || event.kind === 'receive') && event.actor === 1 && game.handler === 0) showCallout('YOUR TURN!', '점프는 자동 · 스파이크는 직접!', 1000);
    } else if (event.type === 'point') {
      showCallout(event.team === 0 ? 'POINT!' : event.reason === 'net' ? 'NET!' : event.reason === 'out' ? 'OUT!' : 'NEXT RALLY', event.team === 0 ? '우리 팀 득점!' : event.reason === 'net' ? '공을 조금 더 높게!' : event.reason === 'out' ? '코트 밖으로 나갔어요' : '다음 공을 준비해요', 1150);
      $('#announcer').textContent = `우리 팀 ${game.score[0]}점, 상대 팀 ${game.score[1]}점.`;
    } else if (event.type === 'finish') { finishTimer = setTimeout(finish, 650); }
  }
}
function updateHUD() {
  if (!game) return;
  document.body.dataset.facing = game.actors[0].facing;
  $('#team-name').textContent = `${characterFor(saved.character).name} & ${characterFor(saved.partner).name}`;
  $('#opponent-name').textContent = game.actors.slice(2).map(actor => characterFor(actor.id).name).join(' & ');
  $('#our-score').textContent = playing ? mode === 'training' ? game.stats.perfects : game.score[0] : '0';
  $('#their-score').textContent = playing ? mode === 'training' ? Math.ceil(game.remaining) : game.score[1] : '0';
  $('.ours small').textContent = mode === 'training' && playing ? 'PERFECT' : 'YOUR TEAM';
  $('.theirs small').textContent = mode === 'training' && playing ? 'SECONDS LEFT' : 'RIVAL TEAM';
  $('#countdown').textContent = playing && game.phase === 'ready' ? Math.ceil(game.phaseTimer) : '';
  let label = '몸 푸는 중. 준비되면 시작!';
  if (playing) label = mode === 'training' ? '60초 연습 / 퍼펙트 타이밍을 찾아요' : mode === 'tour' ? `비치 투어 ${tourStage + 1} / 3 · 7점 선승` : game.phase === 'serve' ? '스파이크 버튼으로 서브!' : `7점 선승 / ${game.rally > 0 ? `랠리 ${game.rally}회` : '다음 랠리를 준비해요'}`;
  $('#match-label').lastChild.textContent = label;
  $('#match-label').classList.toggle('play-label', playing);
  $('#power-meter').hidden = !playing || !game.charging;
  $('#power-fill').style.width = `${game.charge * 100}%`;
  const cue = playing ? playerCue(game) : 'idle';
  $('#spike-button').classList.toggle('ready', cue === 'spike');
  $('#block-button').classList.toggle('ready', cue === 'block');
  $('#spike-button small').textContent = game.charging ? 'RELEASE / J' : cue === 'spike' ? 'NOW! / J' : 'HOLD / J';
  $('#control-tip').innerHTML = game.charging ? '자동으로 뛰어올라요<br /><strong>놓으면 스파이크!</strong>' : cue === 'spike' ? '지금이 공격 타이밍!<br /><strong>스파이크를 누르세요!</strong>' : cue === 'approach' ? '공 아래로 이동<br /><strong>점프는 자동이에요!</strong>' : cue === 'block' || cue === 'blocking' ? '네트 앞에서 공 위치 맞추기<br /><strong>손 높이가 맞을 때 블로킹!</strong>' : '공 근처로 이동<br /><strong>가까우면 자동 토스!</strong>';
  document.body.dataset.cue = cue;
  document.body.dataset.phase = game.phase;
}

function frame(now) {
  if (!playing && now - previousFrame < 32) { requestAnimationFrame(frame); return; }
  const elapsed = Math.min((now - previousFrame) / 1000, .08); previousFrame = now;
  if (renderer && game && assetsReady && !document.hidden) {
    if (!paused && !dialogs.some(dialog => dialog.open)) {
      const keyX = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
      const keyY = (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0);
      input.x = stickX || keyX; input.y = stickY || keyY;
      accumulator += elapsed;
      while (accumulator >= 1 / 120) { step(game, 1 / 120, input); accumulator -= 1 / 120; }
      handleEvents(drainEvents(game));
      if (!playing && game.phase === 'finished') game = makeGame(true);
    } else accumulator = 0;
    const playerPosition = renderer.draw(game, now / 1000);
    $('#you-indicator').style.transform = `translate3d(${playerPosition.x}px, ${playerPosition.y}px, 0) translate(-50%, -100%)`;
    if (now - hudAt > 90) { updateHUD(); hudAt = now; }
    if (now > calloutUntil) $('#game-callout').classList.remove('show');
  }
  requestAnimationFrame(frame);
}

for (const character of ROSTER) {
  const button = document.createElement('button'); button.className = 'roster-item'; button.dataset.character = character.id;
  button.setAttribute('aria-label', `${character.ko} 선택`); button.setAttribute('aria-pressed', String(character.id === saved.character));
  button.innerHTML = `<span class="roster-portrait"><img width="144" height="144" src="./assets/portraits/${character.id}.webp" alt="" /></span><small>${character.ko}</small>`;
  button.addEventListener('click', () => {
    if (playing || starting) return;
    saved.character = character.id;
    if (saved.partner === character.id) saved.partner = ROSTER.find(other => other.id !== character.id).id;
    updateSelection(); persist(); audio.click();
    toast(`${character.ko} 선택! ${character.role}`);
  });
  $('#roster-grid').append(button);
}
$('#partner-button').addEventListener('click', () => {
  if (playing || starting) return;
  const pool = ROSTER.filter(character => character.id !== saved.character);
  const index = pool.findIndex(character => character.id === saved.partner);
  saved.partner = pool[(index + 1) % pool.length].id;
  updateSelection(); persist(); audio.click();
  toast(`${characterFor(saved.partner).ko}와 함께 뛰어요.`);
});
document.querySelectorAll('.mode-button[data-mode]').forEach(button => button.addEventListener('click', () => { setMode(button.dataset.mode); audio.click(); }));
$('#desktop-start').addEventListener('click', startMatch); $('#mobile-start').addEventListener('click', startMatch);
$('#mobile-mode').addEventListener('click', () => openDialog($('#mode-dialog')));
$('#previous-court').addEventListener('click', () => { if (!playing) setCourt(courtIndex - 1); });
$('#next-court').addEventListener('click', () => { if (!playing) setCourt(courtIndex + 1); });
$('#help-button').addEventListener('click', () => openDialog($('#help-dialog')));
$('#settings-button').addEventListener('click', () => openDialog($('#settings-dialog')));
$('#sound-toggle').addEventListener('click', () => {
  audio.muted = !audio.muted; saved.settings.muted = audio.muted;
  $('#sound-toggle img').src = `./assets/icons/${audio.muted ? 'speaker-slash' : 'speaker-high'}.svg`;
  $('#sound-toggle').setAttribute('aria-label', audio.muted ? '소리 켜기' : '소리 끄기'); $('#sound-toggle').setAttribute('aria-pressed', String(audio.muted));
  audio.unlock().catch(() => {}); persist();
});
for (const key of ['sfx', 'music', 'haptics', 'shake']) {
  const checkbox = $(`#${key}-setting`); checkbox.checked = saved.settings[key];
  checkbox.addEventListener('change', () => { saved.settings[key] = checkbox.checked; if (renderer) renderer.allowShake = saved.settings.shake; persist(); audio.update(); });
}
$('#difficulty-setting').value = saved.settings.difficulty;
$('#difficulty-setting').addEventListener('change', event => { saved.settings.difficulty = Number(event.target.value); persist(); });
$('#sound-toggle img').src = `./assets/icons/${audio.muted ? 'speaker-slash' : 'speaker-high'}.svg`;
$('#sound-toggle').setAttribute('aria-pressed', String(audio.muted)); $('#sound-toggle').setAttribute('aria-label', audio.muted ? '소리 켜기' : '소리 끄기');
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
for (const dialog of dialogs) dialog.addEventListener('close', () => {
  clearControls(); if (playing && game?.phase !== 'finished' && !dialogs.some(other => other.open)) { paused = false; audio.resume().catch(() => {}); }
});
$('#pause-button').addEventListener('click', () => openDialog($('#pause-dialog')));
$('#resume-button').addEventListener('click', () => $('#pause-dialog').close());
$('#restart-button').addEventListener('click', startMatch); $('#home-button').addEventListener('click', goHome);
$('#result-home').addEventListener('click', goHome);
$('#result-dialog').addEventListener('cancel', event => event.preventDefault());
$('#result-play').addEventListener('click', () => {
  if (mode === 'tour' && game.winner === 0) { tourStage = tourStage < 2 ? tourStage + 1 : 0; setCourt(tourStage); }
  startMatch();
});

const joystick = $('#joystick'), thumb = $('#joystick-thumb');
function updateStick(event) {
  const rect = joystick.getBoundingClientRect(), dx = event.clientX - rect.left - rect.width / 2, dy = event.clientY - rect.top - rect.height / 2;
  const range = rect.width * .32, length = Math.hypot(dx, dy), ratio = Math.min(1, range / Math.max(1, length));
  stickX = dx * ratio / range; stickY = dy * ratio / range; thumb.style.transform = `translate(${dx * ratio}px, ${dy * ratio}px)`;
}
joystick.addEventListener('pointerdown', event => { if (!playing || paused) return; event.preventDefault(); stickPointer = event.pointerId; joystick.setPointerCapture(event.pointerId); updateStick(event); });
joystick.addEventListener('pointermove', event => { if (event.pointerId === stickPointer) updateStick(event); });
function resetStick(event) { if (event.pointerId !== stickPointer) return; stickPointer = null; stickX = stickY = 0; thumb.style.transform = ''; }
joystick.addEventListener('pointerup', resetStick); joystick.addEventListener('pointercancel', resetStick); joystick.addEventListener('lostpointercapture', resetStick);
$('#block-button').addEventListener('pointerdown', event => { event.preventDefault(); if (!playing || paused) return; requestBlock(game); $('#block-button').classList.add('held'); $('#block-button').setPointerCapture(event.pointerId); });
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) $('#block-button').addEventListener(name, () => $('#block-button').classList.remove('held'));
$('#block-button').addEventListener('click', event => { if (event.detail === 0 && playing && !paused) requestBlock(game); });
$('#spike-button').addEventListener('pointerdown', event => { event.preventDefault(); if (!playing || paused) return; spikePointer = event.pointerId; beginCharge(game); $('#spike-button').classList.add('held'); $('#spike-button').setPointerCapture(event.pointerId); });
$('#spike-button').addEventListener('pointerup', event => { if (event.pointerId !== spikePointer) return; spikePointer = null; if (!paused) releaseSpike(game); $('#spike-button').classList.remove('held'); });
for (const name of ['pointercancel', 'lostpointercapture']) $('#spike-button').addEventListener(name, () => { if (spikePointer !== null) { spikePointer = null; game.charging = false; game.charge = 0; } $('#spike-button').classList.remove('held'); });
$('#spike-button').addEventListener('click', event => { if (event.detail === 0 && playing && !paused) { beginCharge(game); releaseSpike(game); } });

const gameKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyK', 'KeyJ'];
document.addEventListener('keydown', event => {
  if (!playing || dialogs.some(dialog => dialog.open)) return;
  if (event.code === 'Escape') { event.preventDefault(); openDialog($('#pause-dialog')); return; }
  if (!gameKeys.includes(event.code)) return;
  event.preventDefault(); keys.add(event.code);
  if (event.repeat) return;
  if (event.code === 'Space' || event.code === 'KeyK') { requestBlock(game); $('#block-button').classList.add('held'); }
  if (event.code === 'KeyJ') { beginCharge(game); $('#spike-button').classList.add('held'); }
});
document.addEventListener('keyup', event => {
  keys.delete(event.code);
  if (event.code === 'Space' || event.code === 'KeyK') $('#block-button').classList.remove('held');
  if (event.code === 'KeyJ') { if (playing && !paused) releaseSpike(game); $('#spike-button').classList.remove('held'); }
});
window.addEventListener('blur', () => { clearControls(); if (playing && game.phase !== 'finished' && !dialogs.some(dialog => dialog.open)) openDialog($('#pause-dialog')); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearControls(); audio.suspend(); if (playing && game.phase !== 'finished' && !dialogs.some(dialog => dialog.open)) openDialog($('#pause-dialog')); } });
reducedMotion.addEventListener('change', () => { if (renderer) renderer.reducedMotion = reducedMotion.matches; });
const observer = new ResizeObserver(() => { if (assetsReady) renderer?.resize(); }); observer.observe($('#arena-wrap'));

async function initialize() {
  try {
    const [response, courtImages, allAnimations] = await Promise.all([fetch(new URL('./sprites.json', import.meta.url)), loadCourtImages(), loadAnimationManifest()]);
    if (!response.ok) throw new Error('manifest');
    manifest = await response.json(); animationManifest = allAnimations;
    renderer = new Renderer($('#game-canvas'), images, manifest, { reducedMotion: reducedMotion.matches, shake: saved.settings.shake, courtImages, animationImages, animationManifest });
    game = makeGame(true); setMode(mode); updateSelection();
    requestAnimationFrame(frame);
    await waitForCurrentAssets(); $('#load-status').hidden = true;
    document.body.dataset.ready = 'true';
  } catch {
    $('#load-status').innerHTML = '<small>해변을 불러오지 못했어요. <button id="retry-load">다시 시도</button></small>';
    $('#retry-load').addEventListener('click', () => location.reload());
  }
}
if (hadMovementAssist || hadSelectionMigration) persist();
updateStartButtons();
initialize();
if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).catch(() => {});
