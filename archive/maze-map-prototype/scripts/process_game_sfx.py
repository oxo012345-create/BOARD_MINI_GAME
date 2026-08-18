from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import soundfile as sf


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "standalone" / "assets" / "audio" / "sfx"
OUTPUT_DIR = SOURCE_DIR / "processed"

# Gameplay SFX should react immediately and finish before the next action.
# Frequently repeated sounds are deliberately quieter than disruption skills.
SFX_SETTINGS = {
    "item-pickup": {"max_seconds": 0.75, "target_dbfs": -19.0},
    "item-drop": {"max_seconds": 0.85, "target_dbfs": -19.0},
    "push": {"max_seconds": 0.75, "target_dbfs": -17.0},
    "power-push": {"max_seconds": 1.00, "target_dbfs": -15.5},
    "sprint": {"max_seconds": 0.45, "target_dbfs": -21.0},
    "jump": {"max_seconds": 0.85, "target_dbfs": -19.0},
    "freeze": {"max_seconds": 1.20, "target_dbfs": -17.0},
    "swap": {"max_seconds": 0.80, "target_dbfs": -18.0},
    "oil": {"max_seconds": 1.00, "target_dbfs": -19.0},
    "fluidize": {"max_seconds": 1.10, "target_dbfs": -18.5},
    "immunity": {"max_seconds": 0.75, "target_dbfs": -17.5},
}


def dbfs(value: float) -> float:
    return 20 * math.log10(max(value, 1e-9))


def smoothed_rms_envelope(mono: np.ndarray, sample_rate: int) -> np.ndarray:
    window_size = max(1, round(sample_rate * 0.008))
    kernel = np.ones(window_size, dtype=np.float32) / window_size
    return np.sqrt(np.convolve(np.square(mono), kernel, mode="same"))


def trim_and_normalize(
    samples: np.ndarray,
    sample_rate: int,
    *,
    max_seconds: float,
    target_dbfs: float,
) -> tuple[np.ndarray, dict[str, float]]:
    if samples.ndim == 1:
        samples = samples[:, np.newaxis]

    mono = np.max(np.abs(samples), axis=1)
    envelope = smoothed_rms_envelope(mono, sample_rate)
    threshold = max(0.002, float(envelope.max()) * 0.016)
    active = np.flatnonzero(envelope >= threshold)
    if active.size == 0:
        raise ValueError("No audible signal found")

    padding_before = round(sample_rate * 0.012)
    padding_after = round(sample_rate * 0.030)
    start = max(0, int(active[0]) - padding_before)
    detected_end = min(len(samples), int(active[-1]) + padding_after)
    maximum_end = min(len(samples), start + round(sample_rate * max_seconds))
    end = min(detected_end, maximum_end)
    trimmed = samples[start:end].astype(np.float32, copy=True)

    local_mono = np.max(np.abs(trimmed), axis=1)
    local_envelope = smoothed_rms_envelope(local_mono, sample_rate)
    loud_samples = trimmed[local_envelope >= max(0.002, float(local_envelope.max()) * 0.04)]
    if loud_samples.size == 0:
        loud_samples = trimmed

    rms_before = float(np.sqrt(np.mean(np.square(loud_samples))))
    peak_before = float(np.max(np.abs(trimmed)))
    target_rms = 10 ** (target_dbfs / 20)
    peak_limit = 10 ** (-1.0 / 20)
    gain = target_rms / max(rms_before, 1e-9)
    trimmed = np.tanh((trimmed * gain) / peak_limit) * peak_limit

    fade_in_frames = min(len(trimmed), round(sample_rate * 0.004))
    fade_out_frames = min(len(trimmed), round(sample_rate * 0.024))
    if fade_in_frames:
        trimmed[:fade_in_frames] *= np.linspace(0, 1, fade_in_frames, dtype=np.float32)[:, None]
    if fade_out_frames:
        trimmed[-fade_out_frames:] *= np.linspace(1, 0, fade_out_frames, dtype=np.float32)[:, None]

    normalized_envelope = smoothed_rms_envelope(np.max(np.abs(trimmed), axis=1), sample_rate)
    normalized_loud_samples = trimmed[
        normalized_envelope >= max(0.002, float(normalized_envelope.max()) * 0.04)
    ]
    rms_after = float(np.sqrt(np.mean(np.square(normalized_loud_samples))))

    return trimmed, {
        "source_seconds": len(samples) / sample_rate,
        "start_seconds": start / sample_rate,
        "output_seconds": len(trimmed) / sample_rate,
        "rms_before_dbfs": dbfs(rms_before),
        "gain_db": dbfs(gain),
        "rms_after_dbfs": dbfs(rms_after),
        "peak_after_dbfs": dbfs(float(np.max(np.abs(trimmed)))),
    }


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print("name                source  start  output  rms-in   gain  rms-out  peak-out")
    for name, settings in SFX_SETTINGS.items():
        source_path = SOURCE_DIR / f"{name}.mp3"
        output_path = OUTPUT_DIR / f"{name}.wav"
        samples, sample_rate = sf.read(source_path, dtype="float32", always_2d=True)
        processed, report = trim_and_normalize(samples, sample_rate, **settings)
        sf.write(output_path, processed, sample_rate, subtype="PCM_16")
        print(
            f"{name:<19}"
            f"{report['source_seconds']:>6.2f}s "
            f"{report['start_seconds']:>5.2f}s "
            f"{report['output_seconds']:>6.2f}s "
            f"{report['rms_before_dbfs']:>6.1f} "
            f"{report['gain_db']:>6.1f} "
            f"{report['rms_after_dbfs']:>7.1f} "
            f"{report['peak_after_dbfs']:>8.1f}"
        )


if __name__ == "__main__":
    main()
