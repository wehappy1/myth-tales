import { useEffect, useState } from 'react';
import {
  chooseVoice,
  chosenVoiceId,
  subscribeVoices,
  type SpeakVoice,
} from '@/lib/speech';

function voiceLabel(voice: SpeakVoice, voices: SpeakVoice[]): string {
  const twins = voices.filter((item) => item.name === voice.name);
  return twins.length > 1 ? `${voice.name} ${voice.lang}` : voice.name;
}

function VoicePick({ lang, label }: { lang: 'zh' | 'en'; label: string }) {
  const [voices, setVoices] = useState<SpeakVoice[]>([]);
  const [picked, setPicked] = useState(() => chosenVoiceId(lang));

  useEffect(
    () =>
      subscribeVoices(lang, (next) => {
        setVoices(next);
        setPicked(chosenVoiceId(lang));
      }),
    [lang],
  );

  if (voices.length === 0) return null;
  const value = voices.some((voice) => voice.id === picked) ? picked : '';

  return (
    <label className="header-voice">
      <span>{label}</span>
      <select
        aria-label={`${label}音色`}
        value={value}
        onChange={(event) => {
          chooseVoice(lang, event.target.value);
          setPicked(event.target.value);
        }}
      >
        <option value="">默认</option>
        {voices.map((voice) => (
          <option key={voice.id} value={voice.id}>
            {voiceLabel(voice, voices)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function VoiceSettings({ className }: { className?: string }) {
  return (
    <div className={className}>
      <VoicePick lang="zh" label="中文" />
      <VoicePick lang="en" label="英语" />
    </div>
  );
}
