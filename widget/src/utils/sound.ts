/**
 * Sound notification utilities
 * Uses base64-encoded audio to avoid external file dependencies
 */

// Simple notification sound (base64-encoded short beep)
const NOTIFICATION_SOUND_BASE64 =
  "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2Onp+dnJiUkpOTlpiZmZiXlpWTko+OjImGgoJ+fn19fX19fX19fn5/gIGCg4SGh4iJiouMjY6Ojo+Pj4+Pjo6OjY2MjIuLioqJiYmIiIeHh4eHh4iIiImJiouLjIyNjY6Ojo+Pj4+Pj4+Pjo6OjY2MjIuLioqJiYiIh4eHhoaGhoaGhoaHh4eIiImJiouLjIyNjY2Ojo6Ojo6Ojo6OjY2NjIyMi4uKioqJiYmIiIiHh4eHh4eHh4eHh4iIiImJiYqKiouLjIyMjY2NjY6Ojo6Ojo6OjY2NjYyMjIuLi4qKioqJiYmJiIiIiIiIiIiIiIiIiImJiYmKioqLi4uMjIyMjY2NjY2NjY2NjY2NjIyMjIyLi4uLioqKioqJiYmJiYmJiYmJiYmJiYmJiYqKioqLi4uLjIyMjIyMjY2NjY2NjY2MjIyMjIyMi4uLi4uKioqKioqKiomJiYmJiYmJiYmKioqKioqLi4uLi4yMjIyMjIyMjIyMjIyMjIyMjIuLi4uLi4qKioqKioqKioqKioqKioqKioqKi4uLi4uLi4yMjIyMjIyMjIyMjIyMjIuLi4uLi4uLioqKioqKioqKioqKioqKioqKioqLi4uLi4uLjIyMjIyMjIyMjIyMjIyLi4uLi4uLi4uKioqKioqKioqKioqKioqKioqKiouLi4uLi4uMjIyMjIyMjIyMjIyMi4uLi4uLi4uLioqKioqK";

let audioContext: AudioContext | null = null;
let audioBuffer: AudioBuffer | null = null;
let soundEnabled = true;

async function initAudio(): Promise<void> {
  if (audioContext) return;

  try {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    // Decode base64 audio
    const response = await fetch(NOTIFICATION_SOUND_BASE64);
    const arrayBuffer = await response.arrayBuffer();
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  } catch {
    // Audio not supported or failed to initialize
    audioContext = null;
    audioBuffer = null;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled;
}

export async function playNotificationSound(): Promise<void> {
  if (!soundEnabled) return;

  try {
    if (!audioContext || !audioBuffer) {
      await initAudio();
    }

    if (audioContext && audioBuffer) {
      // Resume context if suspended (autoplay policy)
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;

      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0.3; // 30% volume

      source.connect(gainNode);
      gainNode.connect(audioContext.destination);

      source.start(0);
    }
  } catch {
    // Silently fail - sound should never break the widget
  }
}

// Alternative: Use Web Audio API to generate a simple beep
export function playSimpleBeep(): void {
  if (!soundEnabled) return;

  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.value = 800; // Hz
    oscillator.type = "sine";

    gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.1);
  } catch {
    // Silently fail
  }
}
