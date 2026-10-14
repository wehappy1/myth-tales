export type PlaybackStatus = 'idle' | 'playing';

export type PlaybackSnapshot = {
  id: string | null;
  status: PlaybackStatus;
};

export type SpeakVoice = {
  id: string;
  name: string;
  lang: string;
};

const listeners = new Set<(snapshot: PlaybackSnapshot) => void>();
let snapshot: PlaybackSnapshot = { id: null, status: 'idle' };
let generation = 0;
let keepAlive = 0;
let held: SpeechSynthesisUtterance | null = null;

const voiceListeners = new Set<() => void>();

function fragileSynth(): boolean {
  return /Android|Harmony|OpenHarmony|HUAWEI|Huawei/i.test(navigator.userAgent);
}

function splitLong(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > maxLen) {
    let cut = rest.lastIndexOf('。', maxLen);
    if (cut < maxLen * 0.4) cut = rest.lastIndexOf('！', maxLen);
    if (cut < maxLen * 0.4) cut = rest.lastIndexOf('？', maxLen);
    if (cut < maxLen * 0.4) cut = rest.lastIndexOf('. ', maxLen);
    if (cut < maxLen * 0.4) cut = rest.lastIndexOf('，', maxLen);
    if (cut < maxLen * 0.4) cut = rest.lastIndexOf(' ', maxLen);
    if (cut < maxLen * 0.4) cut = maxLen;
    chunks.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function chunksOf(text: string, fragile: boolean): string[] {
  const parts = text
    .split(/(?<=[。！？.!?])\s*|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const source = parts.length > 0 ? parts : [text.trim()].filter(Boolean);
  return source.flatMap((part) => splitLong(part, fragile ? 80 : 220));
}

function voiceKey(voice: SpeechSynthesisVoice): string {
  return voice.voiceURI || `${voice.lang}:${voice.name}`;
}

function langTag(value: string): string {
  return value.toLowerCase().replace('_', '-');
}

function isChinese(voiceLang: string): boolean {
  const lang = langTag(voiceLang);
  return lang.startsWith('zh') || lang.startsWith('cmn') || lang.startsWith('yue');
}

function matchesLang(voiceLang: string, lang: string): boolean {
  const current = langTag(voiceLang);
  const wanted = langTag(lang);
  if (wanted.startsWith('zh')) return isChinese(current);
  return current.startsWith(wanted) || current.startsWith(wanted.slice(0, 2));
}

function voiceStorageKey(lang: string): string {
  const tag = langTag(lang);
  if (tag.startsWith('zh')) return 'myth-tales-voice-zh';
  if (tag.startsWith('ja')) return 'myth-tales-voice-ja';
  return 'myth-tales-voice-en';
}

function byPreference(a: SpeechSynthesisVoice, b: SpeechSynthesisVoice): number {
  const rank = (voice: SpeechSynthesisVoice) => {
    const lang = langTag(voice.lang);
    if (isChinese(lang)) {
      const mainland =
        lang.startsWith('zh-cn') ||
        lang.startsWith('zh-hans') ||
        lang.startsWith('cmn-hans') ||
        lang.startsWith('cmn-cn')
          ? 0
          : 1;
      return mainland * 2 + (voice.localService ? 0 : 1);
    }
    if (lang.startsWith('ja')) {
      const japan = lang.startsWith('ja-jp') ? 0 : 1;
      return japan * 2 + (voice.localService ? 0 : 1);
    }
    const american = lang.startsWith('en-us') ? 0 : 1;
    return american * 2 + (voice.localService ? 0 : 1);
  };
  return rank(a) - rank(b) || a.name.localeCompare(b.name, 'zh');
}

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function listSpeakVoices(lang = 'zh'): SpeakVoice[] {
  if (!speechSupported()) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((voice) => matchesLang(voice.lang, lang))
    .sort(byPreference)
    .map((voice) => ({ id: voiceKey(voice), name: voice.name, lang: voice.lang }));
}

export function chosenVoiceId(lang = 'zh'): string {
  try {
    return localStorage.getItem(voiceStorageKey(lang)) ?? '';
  } catch {
    return '';
  }
}

export function chooseVoice(lang: string, id: string) {
  try {
    const key = voiceStorageKey(lang);
    if (id) localStorage.setItem(key, id);
    else localStorage.removeItem(key);
  } catch {
    return;
  }
  publishVoices();
}

export function subscribeVoices(lang: string, listener: (voices: SpeakVoice[]) => void) {
  const wrapped = () => listener(listSpeakVoices(lang));
  voiceListeners.add(wrapped);
  wrapped();
  return () => {
    voiceListeners.delete(wrapped);
  };
}

function publishVoices() {
  for (const listener of voiceListeners) listener();
}

function voiceFor(lang: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis
    .getVoices()
    .filter((item) => matchesLang(item.lang, lang))
    .sort(byPreference);
  const chosen = chosenVoiceId(lang);
  if (!chosen) return voices[0];
  return voices.find((item) => voiceKey(item) === chosen) ?? voices[0];
}

function whenVoices(): Promise<void> {
  const synth = window.speechSynthesis;
  if (!synth || synth.getVoices().length > 0) return Promise.resolve();
  return new Promise((resolve) => {
    let timer = 0;
    const done = () => {
      window.clearTimeout(timer);
      synth.removeEventListener('voiceschanged', done);
      resolve();
    };
    timer = window.setTimeout(done, 500);
    synth.addEventListener('voiceschanged', done);
  });
}

function primeVoices() {
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.getVoices();
  synth.addEventListener('voiceschanged', () => {
    synth.getVoices();
    publishVoices();
  });
  publishVoices();
}

if (typeof window !== 'undefined') primeVoices();

function publish(next: PlaybackSnapshot) {
  snapshot = next;
  for (const listener of listeners) listener(snapshot);
}

export function playbackNow(): PlaybackSnapshot {
  return snapshot;
}

export function subscribePlayback(listener: (snapshot: PlaybackSnapshot) => void) {
  listeners.add(listener);
  listener(snapshot);
  return () => {
    listeners.delete(listener);
  };
}

function clearKeepAlive() {
  window.clearInterval(keepAlive);
  keepAlive = 0;
}

function armKeepAlive() {
  clearKeepAlive();
  keepAlive = window.setInterval(() => {
    const synth = window.speechSynthesis;
    if (!synth || snapshot.status !== 'playing' || !synth.speaking || synth.paused) return;
    synth.pause();
    synth.resume();
  }, 8000);
}

export function stopPlayback() {
  generation += 1;
  clearKeepAlive();
  held = null;
  window.speechSynthesis?.cancel();
  if (snapshot.status !== 'idle') publish({ id: null, status: 'idle' });
}

export function speak(text: string, lang?: string, id: string | null = null): Promise<void> {
  const synth = window.speechSynthesis;
  if (!synth) return Promise.reject(new Error('这个浏览器不能朗读'));
  const spoken = text.trim();
  if (!spoken) return Promise.resolve();
  const useLang = lang ?? (/[a-z]/i.test(spoken) && !/[\u4e00-\u9fff]/.test(spoken) ? 'en-US' : 'zh-CN');
  const token = generation + 1;
  generation = token;
  clearKeepAlive();
  const fragile = fragileSynth();
  if (!fragile || synth.speaking || synth.pending) synth.cancel();
  synth.resume();
  const pieces = chunksOf(spoken, fragile);
  publish({ id, status: 'playing' });

  return new Promise((resolve, reject) => {
    let index = 0;
    let settled = false;
    let attempt = 0;
    let retriedIndex = -1;
    let retrying = false;
    let skipVoice = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (token !== generation) {
        if (error) reject(error);
        else resolve();
        return;
      }
      clearKeepAlive();
      held = null;
      publish({ id: null, status: 'idle' });
      if (error) reject(error);
      else resolve();
    };
    const say = () => {
      if (settled || token !== generation) {
        if (!settled) resolve();
        return;
      }
      const piece = pieces[index];
      if (!piece) {
        finish();
        return;
      }
      const attemptToken = ++attempt;
      const utter = new SpeechSynthesisUtterance(piece);
      held = utter;
      utter.lang = useLang;
      utter.rate = 0.86;
      if (!skipVoice) {
        const voice = voiceFor(useLang);
        if (voice) utter.voice = voice;
      }
      const startedAt = performance.now();
      let opened = false;
      utter.onstart = () => {
        opened = true;
      };
      const retry = () => {
        if (attemptToken !== attempt || retrying) return;
        if (retriedIndex === index) {
          finish(new Error('朗读失败'));
          return;
        }
        retrying = true;
        retriedIndex = index;
        skipVoice = true;
        window.setTimeout(() => {
          retrying = false;
          say();
        }, 120);
      };
      utter.onend = () => {
        if (attemptToken !== attempt) return;
        if (token !== generation) {
          resolve();
          return;
        }
        if (fragile && !opened && piece.length > 2 && performance.now() - startedAt < 120) {
          retry();
          return;
        }
        index += 1;
        if (index >= pieces.length) finish();
        else say();
      };
      utter.onerror = (event) => {
        if (attemptToken !== attempt) return;
        const reason = (event as SpeechSynthesisErrorEvent).error;
        if (token !== generation) {
          resolve();
          return;
        }
        if (fragile && (reason === 'interrupted' || reason === 'canceled')) {
          retry();
          return;
        }
        finish(new Error('朗读失败'));
      };
      if (!fragile && pieces.length === 1 && index === 0) armKeepAlive();
      synth.resume();
      synth.speak(held ?? utter);
    };
    const start = () => {
      if (fragile) window.setTimeout(say, 80);
      else say();
    };
    if (fragile) void whenVoices().then(start);
    else start();
  });
}
