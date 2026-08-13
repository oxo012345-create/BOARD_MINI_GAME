"use client";

import { useCallback, useEffect, useState } from "react";
import type { PlaceMafiaPhase } from "./place-mafia-shared";

export type PlaceMafiaCue = "tap" | "select" | "confirm" | "role-citizen" | "role-mafia" | "night" | "tick" | "attack" | "dawn" | "quiet" | "incident" | "evidence" | "vote" | "tie" | "citizen-out" | "mafia-out" | "citizen-win" | "mafia-win";

export type PlaceMafiaPreferences = {
  music: boolean;
  effects: boolean;
  haptics: boolean;
  reduceMotion: boolean;
};

const STORAGE_KEY = "hanpan-place-mafia-experience-v1";
const DEFAULTS: PlaceMafiaPreferences = { music: true, effects: true, haptics: true, reduceMotion: false };

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

class NoirAudioEngine {
  private context?: AudioContext;
  private musicGain?: GainNode;
  private effectsGain?: GainNode;
  private ambientNodes: AudioNode[] = [];
  private scene = "";
  private preferences = DEFAULTS;

  setPreferences(preferences: PlaceMafiaPreferences) {
    this.preferences = preferences;
    if (this.musicGain && this.context) {
      this.musicGain.gain.cancelScheduledValues(this.context.currentTime);
      this.musicGain.gain.linearRampToValueAtTime(preferences.music ? 0.11 : 0, this.context.currentTime + 0.35);
    }
  }

  async unlock() {
    if (typeof window === "undefined") return;
    const Context = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
    if (!Context) return;
    if (!this.context) {
      this.context = new Context();
      this.musicGain = this.context.createGain();
      this.effectsGain = this.context.createGain();
      this.musicGain.gain.value = this.preferences.music ? 0.11 : 0;
      this.effectsGain.gain.value = 0.24;
      this.musicGain.connect(this.context.destination);
      this.effectsGain.connect(this.context.destination);
    }
    if (this.context.state === "suspended") await this.context.resume().catch(() => undefined);
  }

  setScene(phase?: PlaceMafiaPhase | "briefing") {
    const scene = phase ?? "briefing";
    if (scene === this.scene && this.ambientNodes.length > 0) return;
    this.scene = scene;
    this.stopAmbient();
    if (!this.context || !this.musicGain || !this.preferences.music) return;

    const frequencies: Record<string, [number, number, number]> = {
      briefing: [55, 82.41, 110],
      role_reveal: [51.91, 77.78, 103.83],
      night: [43.65, 65.41, 87.31],
      day_reveal: [58.27, 87.31, 116.54],
      discussion: [58.27, 73.42, 110],
      vote: [49, 73.42, 98],
      execution: [46.25, 69.3, 92.5],
      game_over: [65.41, 98, 130.81],
    };
    const tones = frequencies[scene] ?? frequencies.briefing;
    const now = this.context.currentTime;
    tones.forEach((frequency, index) => {
      const oscillator = this.context!.createOscillator();
      const gain = this.context!.createGain();
      const lfo = this.context!.createOscillator();
      const lfoGain = this.context!.createGain();
      oscillator.type = index === 1 ? "triangle" : "sine";
      oscillator.frequency.value = frequency;
      oscillator.detune.value = index === 2 ? 5 : -3;
      gain.gain.value = index === 0 ? 0.16 : 0.08;
      lfo.frequency.value = 0.045 + index * 0.017;
      lfoGain.gain.value = 0.025;
      lfo.connect(lfoGain).connect(gain.gain);
      oscillator.connect(gain).connect(this.musicGain!);
      oscillator.start(now);
      lfo.start(now);
      this.ambientNodes.push(oscillator, gain, lfo, lfoGain);
    });
  }

  cue(cue: PlaceMafiaCue) {
    if (this.preferences.haptics && typeof navigator !== "undefined") {
      const vibration: Partial<Record<PlaceMafiaCue, number | number[]>> = {
        select: 12, confirm: 25, "role-mafia": [35, 45, 55], night: 30, tick: 8,
        attack: [35, 35, 70], incident: 100, vote: 30, tie: [25, 40, 25],
        "citizen-win": [30, 50, 30], "mafia-win": [50, 40, 90],
      };
      const pattern = vibration[cue];
      if (pattern) navigator.vibrate?.(pattern);
    }
    if (!this.preferences.effects || !this.context || !this.effectsGain) return;
    const patterns: Record<PlaceMafiaCue, Array<[number, number, number, OscillatorType]>> = {
      tap: [[420, 0, 0.045, "sine"]],
      select: [[620, 0, 0.08, "sine"], [820, 0.05, 0.08, "sine"]],
      confirm: [[440, 0, 0.1, "sine"], [660, 0.08, 0.16, "triangle"]],
      "role-citizen": [[330, 0, 0.24, "sine"], [494, 0.12, 0.3, "sine"]],
      "role-mafia": [[92, 0, 0.38, "sawtooth"], [73, 0.15, 0.5, "sine"]],
      night: [[196, 0, 0.5, "sine"], [98, 0.12, 0.75, "triangle"]],
      tick: [[880, 0, 0.055, "square"]],
      attack: [[76, 0, 0.24, "sawtooth"], [54, 0.16, 0.48, "sine"]],
      dawn: [[261.63, 0, 0.3, "sine"], [392, 0.16, 0.48, "sine"]],
      quiet: [[392, 0, 0.24, "sine"], [523.25, 0.14, 0.4, "sine"]],
      incident: [[155.56, 0, 0.28, "sawtooth"], [116.54, 0.18, 0.5, "triangle"]],
      evidence: [[740, 0, 0.05, "sine"], [988, 0.08, 0.12, "sine"]],
      vote: [[220, 0, 0.12, "triangle"], [330, 0.1, 0.2, "sine"]],
      tie: [[196, 0, 0.16, "triangle"], [174.61, 0.16, 0.28, "triangle"]],
      "citizen-out": [[293.66, 0, 0.2, "sine"], [220, 0.18, 0.42, "sine"]],
      "mafia-out": [[110, 0, 0.24, "sawtooth"], [220, 0.18, 0.34, "triangle"]],
      "citizen-win": [[261.63, 0, 0.22, "sine"], [329.63, 0.16, 0.22, "sine"], [392, 0.32, 0.5, "sine"]],
      "mafia-win": [[98, 0, 0.3, "sawtooth"], [73.42, 0.24, 0.55, "triangle"]],
    };
    for (const [frequency, delay, duration, type] of patterns[cue]) this.tone(frequency, delay, duration, type);
  }

  private tone(frequency: number, delay: number, duration: number, type: OscillatorType) {
    if (!this.context || !this.effectsGain) return;
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.19, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(this.effectsGain);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  private stopAmbient() {
    for (const node of this.ambientNodes) {
      if (node instanceof OscillatorNode) {
        try { node.stop(); } catch { /* already stopped */ }
      }
      try { node.disconnect(); } catch { /* already disconnected */ }
    }
    this.ambientNodes = [];
  }
}

const engine = new NoirAudioEngine();

function readPreferences(): PlaceMafiaPreferences {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<PlaceMafiaPreferences>;
    return { ...DEFAULTS, ...stored, reduceMotion: stored.reduceMotion ?? window.matchMedia("(prefers-reduced-motion: reduce)").matches };
  } catch {
    return { ...DEFAULTS, reduceMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches };
  }
}

export function usePlaceMafiaExperience(scene: PlaceMafiaPhase | "briefing") {
  const [preferences, setPreferences] = useState<PlaceMafiaPreferences>(DEFAULTS);

  useEffect(() => {
    const loaded = readPreferences();
    setPreferences(loaded);
    engine.setPreferences(loaded);
  }, []);

  useEffect(() => {
    engine.setPreferences(preferences);
    engine.setScene(scene);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences, scene]);

  const unlock = useCallback(async () => {
    await engine.unlock();
    engine.setScene(scene);
  }, [scene]);

  const cue = useCallback((name: PlaceMafiaCue) => engine.cue(name), []);

  const toggle = useCallback((key: keyof PlaceMafiaPreferences) => {
    setPreferences((current) => ({ ...current, [key]: !current[key] }));
    void engine.unlock();
  }, []);

  return { preferences, toggle, unlock, cue };
}
