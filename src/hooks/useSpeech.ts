import { useCallback, useEffect, useState } from 'react';
import {
  playbackNow,
  speak as speakText,
  speechSupported,
  stopPlayback,
  subscribePlayback,
} from '@/lib/speech';

export type SpeechTarget = 'content' | 'translation';

function resolveLang(language?: string | null): string {
  if (!language) return 'zh-CN';
  if (language === 'zh' || language.startsWith('zh')) return 'zh-CN';
  if (language === 'en' || language.startsWith('en')) return 'en-US';
  if (language === 'ja' || language.startsWith('ja')) return 'ja-JP';
  return language;
}

function asTarget(id: string | null): SpeechTarget | null {
  if (id === 'content' || id === 'translation') return id;
  return null;
}

export function useSpeech() {
  const [speaking, setSpeaking] = useState<SpeechTarget | null>(null);
  const [supported] = useState(speechSupported);

  useEffect(() => {
    return subscribePlayback((next) => {
      setSpeaking(next.status === 'playing' ? asTarget(next.id) : null);
    });
  }, []);

  useEffect(() => stopPlayback, []);

  const cancel = useCallback(() => {
    stopPlayback();
  }, []);

  const speak = useCallback(
    (target: SpeechTarget, text: string, language?: string | null) => {
      if (!supported || !text.trim()) return;
      const current = playbackNow();
      if (current.id === target && current.status === 'playing') {
        stopPlayback();
        return;
      }
      void speakText(text, resolveLang(language), target).catch(() => undefined);
    },
    [supported],
  );

  return { supported, speaking, speak, cancel };
}
