export const hasVoiceApi = typeof window !== 'undefined' && 'speechSynthesis' in window;
/**
 * voice broadcast
 */
export const voiceBroadcast = ({ text }: { text: string }) => {
  window.speechSynthesis?.cancel();
  const msg = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis?.getVoices?.(); // 获取语言包
  const voice = voices.find((item) => {
    return item.name === 'Microsoft Yaoyao - Chinese (Simplified, PRC)';
  });
  if (voice) {
    msg.voice = voice;
  }

  window.speechSynthesis?.speak(msg);

  msg.onerror = (e) => {
    console.log(e);
  };

  return {
    cancel: () => window.speechSynthesis?.cancel()
  };
};
export const cancelBroadcast = () => {
  window.speechSynthesis?.cancel();
};
