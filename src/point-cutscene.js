import { characterFor } from './roster.js';

// Fits inside the existing 1.65s between rallies; simulation keeps its own clock.
export const POINT_CARD_DURATION = 1.48;
export const POINT_CARD_EXIT_AT = 1.24;

export function pointCardFor(event, { training = false } = {}) {
  const won = event.team === 0;
  const actor = won ? event.scorer : event.conceded;
  if (event.type !== 'point' || !actor?.id) return null;
  const character = characterFor(actor.id);
  const title = won ? 'POINT!' : 'POINT LOST';
  const contactLabels = { spike: '스파이크 득점', block: '블로킹 득점', serve: '서비스 에이스', receive: '리시브 득점', set: '토스 득점' };
  const contactLabel = actor.contactKind === 'serve' && event.rally > 0 ? '우리 팀 득점' : contactLabels[actor.contactKind];
  const detail = won
    ? event.reason === 'net' ? '상대 네트 실수' : event.reason === 'out' ? '상대 아웃' : contactLabel || '우리 팀 득점'
    : event.reason === 'net' ? '네트에 걸렸어요' : event.reason === 'out' ? '코트 밖으로 나갔어요' : '다음 공은 받아내요!';
  return {
    character, actor: { ...actor }, outcome: won ? 'won' : 'lost', title, detail,
    score: [...(event.score || [0, 0])], reason: event.reason,
    // Both poses are original whole figures, scaled equally in X and Y.
    pose: won ? 1 : 2, training,
    caption: won ? character.skill : '다음 랠리에서 만회해요',
  };
}

export class PointCardTimeline {
  constructor() { this.clear(); }
  get active() { return Boolean(this.card); }
  get remaining() { return this.active ? Math.max(0, POINT_CARD_DURATION - this.elapsed) : 0; }
  get stage() { return !this.active ? 'idle' : this.elapsed < .24 ? 'enter' : this.elapsed < POINT_CARD_EXIT_AT ? 'hold' : 'exit'; }
  show(event, options) {
    const card = pointCardFor(event, options);
    if (!card) return false;
    this.card = card; this.elapsed = 0; return true;
  }
  advance(seconds, { paused = false } = {}) {
    if (!this.active || paused || !Number.isFinite(seconds) || seconds <= 0) return;
    this.elapsed += seconds;
    if (this.elapsed >= POINT_CARD_DURATION - 1e-9) this.clear();
  }
  clear() { this.card = null; this.elapsed = 0; }
}

export function drawPointCardArt(canvas, card, images, manifest) {
  const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);
  const image = images[card.character.id], meta = manifest[card.character.id];
  if (!image?.naturalWidth || !meta) return false;
  const frame = meta.frames[card.pose], sourceScale = image.naturalWidth / meta.width;
  const scale = Math.min(canvas.width * .88 / frame.width, canvas.height * .94 / frame.height);
  const width = frame.width * scale, height = frame.height * scale;
  ctx.drawImage(image, frame.x * sourceScale, frame.y * sourceScale, frame.width * sourceScale, frame.height * sourceScale,
    (canvas.width - width) / 2, canvas.height - height, width, height);
  return true;
}

export class PointCutscene {
  constructor(element, { images, manifest }) {
    this.element = element; this.images = images; this.manifest = manifest;
    this.timeline = new PointCardTimeline(); this.clear();
  }
  get active() { return this.timeline.active; }
  get remaining() { return this.timeline.remaining; }
  show(event, options) {
    if (!this.timeline.show(event, options)) return false;
    const { card } = this.timeline, root = this.element;
    root.dataset.outcome = card.outcome; root.dataset.character = card.character.id;
    root.dataset.reason = card.reason; root.dataset.pose = String(card.pose);
    root.style.setProperty('--card-color', card.character.color);
    root.querySelector('[data-card-title]').textContent = card.title;
    root.querySelector('[data-card-detail]').textContent = card.detail;
    root.querySelector('[data-card-name]').textContent = card.character.name;
    root.querySelector('[data-card-role]').textContent = `${card.character.ko} · ${card.character.role}`;
    root.querySelector('[data-card-caption]').textContent = card.caption;
    root.querySelector('[data-card-eyebrow]').textContent = card.training ? 'PRACTICE RALLY' : card.outcome === 'won' ? 'YOUR TEAM' : 'NEXT RALLY';
    root.querySelector('[data-card-score]').hidden = card.training;
    root.querySelector('[data-card-ours]').textContent = card.score[0];
    root.querySelector('[data-card-theirs]').textContent = card.score[1];
    root.dataset.artReady = String(drawPointCardArt(root.querySelector('canvas'), card, this.images, this.manifest));
    root.hidden = false; this.sync(); return true;
  }
  advance(seconds, options) { this.timeline.advance(seconds, options); this.sync(); }
  sync() { this.element.dataset.stage = this.timeline.stage; this.element.hidden = !this.active; }
  clear() { this.timeline.clear(); this.sync(); delete this.element.dataset.character; }
}
