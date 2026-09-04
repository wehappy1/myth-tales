import { useCallback, useEffect, useRef, useState } from 'react';

export type SpeechTarget = 'content' | 'translation';

function resolveLang(language?: string | null): string {
  if (!language) return 'zh-CN';
  if (language === 'zh' || language.startsWith('zh')) return 'zh-CN';
  if (language === 'en' || language.startsWith('en')) return 'en-US';
  if (language === 'ja' || language.startsWith('ja')) return 'ja-JP';
  return language;
}

/** Chrome 长文本易中断，按段落拆开顺序朗读 */
function chunkText(text: string, maxLen = 220): string[] {
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const para of paragraphs) {
    if (para.length <= maxLen) {
      chunks.push(para);
      continue;
    }
    let rest = para;
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
  }
  return chunks;
}

function pickVoice(lang: string): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const prefix = lang.slice(0, 2).toLowerCase();
  return (
    voices.find((v) => v.lang === lang) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(prefix)) ||
    null
  );
}

export function useSpeech() {
  const [speaking, setSpeaking] = useState<SpeechTarget | null>(null);
  const [supported] = useState(
    () => typeof window !== 'undefined' && 'speechSynthesis' in window,
  );
  const queueRef = useRef<SpeechSynthesisUtterance[]>([]);
  const targetRef = useRef<SpeechTarget | null>(null);

  const cancel = useCallback(() => {
    queueRef.current = [];
    targetRef.current = null;
    setSpeaking(null);
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  useEffect(() => {
    if (!supported) return;
    // 部分浏览器需触发一次 getVoices 才会填充列表
    const warm = () => window.speechSynthesis.getVoices();
    warm();
    window.speechSynthesis.addEventListener('voiceschanged', warm);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', warm);
      cancel();
    };
  }, [supported, cancel]);

  const speak = useCallback(
    (target: SpeechTarget, text: string, language?: string | null) => {
      if (!supported || !text.trim()) return;

      if (speaking === target) {
        cancel();
        return;
      }

      cancel();
      const lang = resolveLang(language);
      const chunks = chunkText(text);
      if (!chunks.length) return;

      targetRef.current = target;
      setSpeaking(target);

      const voice = pickVoice(lang);
      const utterances = chunks.map((chunk) => {
        const u = new SpeechSynthesisUtterance(chunk);
        u.lang = lang;
        if (voice) u.voice = voice;
        u.rate = lang.startsWith('zh') ? 0.95 : 1;
        return u;
      });

      queueRef.current = utterances;

      const playNext = () => {
        if (targetRef.current !== target) return;
        const next = queueRef.current.shift();
        if (!next) {
          targetRef.current = null;
          setSpeaking(null);
          return;
        }
        next.onend = playNext;
        next.onerror = () => {
          if (targetRef.current === target) {
            targetRef.current = null;
            setSpeaking(null);
          }
        };
        window.speechSynthesis.speak(next);
      };

      playNext();
    },
    [supported, speaking, cancel],
  );

  return { supported, speaking, speak, cancel };
}
