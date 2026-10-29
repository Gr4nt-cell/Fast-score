"""Synthesises the app's alert tones (no recordings, so no licensing questions).

  fs_kickoff   one referee whistle          fs_halftime  two short whistles
  fs_fulltime  two short + one long whistle fs_goal      crowd swell + rising fanfare
  fs_redcard   low two-tone buzzer          fs_lineups   soft two-note chime
Run: python3 scripts/make_tones.py  (writes assets/sounds/*.wav, 22.05 kHz mono 16-bit)
"""
import wave
import numpy as np

SR = 22050
rng = np.random.default_rng(7)


def env(n, attack=0.01, release=0.08):
    e = np.ones(n)
    a, r = int(attack * SR), int(release * SR)
    if a: e[:a] = np.linspace(0, 1, a)
    if r: e[-r:] *= np.linspace(1, 0, r)
    return e


def whistle(dur, pitch=3050):
    """A pea whistle: a high tone warbled ~25 times a second by the rolling pea, plus breath."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    roll = 1 + 0.035 * np.sin(2 * np.pi * 26 * t) + 0.01 * np.sin(2 * np.pi * 7 * t)
    phase = 2 * np.cumsum(np.pi * pitch * roll) / SR
    tone = np.sin(phase) + 0.25 * np.sin(2 * phase) + 0.08 * np.sin(3 * phase)
    am = 0.75 + 0.25 * np.sin(2 * np.pi * 26 * t + 1.0)
    breath = rng.normal(0, 1, n)
    breath = np.convolve(breath, np.ones(6) / 6, "same") * 0.06
    return (tone * am + breath) * env(n, 0.02, 0.06)


def silence(d):
    return np.zeros(int(d * SR))


def chord_fanfare():
    """Rising brass-like arpeggio (C-E-G-C) over a crowd swell."""
    notes = [523.25, 659.25, 783.99, 1046.5]
    out = np.zeros(int(1.9 * SR))
    for i, f in enumerate(notes):
        start = int(i * 0.12 * SR)
        n = int((1.9 - i * 0.12) * SR)
        t = np.arange(n) / SR
        vib = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * t)
        ph = 2 * np.pi * f * np.cumsum(vib) / SR
        brass = sum(np.sin(k * ph) / k ** 0.9 for k in range(1, 8))
        e = env(n, 0.03, 0.5) * np.exp(-t * 0.9)
        out[start:start + n] += brass * e * (0.55 if i < 3 else 0.75)
    # crowd: filtered noise swelling up then settling
    n = len(out)
    t = np.arange(n) / SR
    noise = rng.normal(0, 1, n)
    for w in (9, 5):
        noise = np.convolve(noise, np.ones(w) / w, 'same')
    swell = np.clip(t / 0.35, 0, 1) * np.exp(-np.clip(t - 0.6, 0, None) * 1.6)
    out += noise * swell * 1.4
    return out


def buzzer():
    def tone(f, d):
        n = int(d * SR)
        t = np.arange(n) / SR
        sq = np.sign(np.sin(2 * np.pi * f * t)) * 0.55 + np.sin(2 * np.pi * f * t) * 0.45
        return np.convolve(sq, np.ones(4) / 4, 'same') * env(n, 0.01, 0.05)
    return np.concatenate([tone(330, 0.28), silence(0.06), tone(220, 0.45)])


def chime():
    def bell(f, d):
        n = int(d * SR)
        t = np.arange(n) / SR
        b = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 6) + 0.2 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 10)
        return b * np.exp(-t * 3.2) * env(n, 0.003, 0.05)
    a = bell(1318.5, 1.1)
    b = bell(1975.5, 1.2)
    out = np.zeros(int(1.45 * SR))
    out[:len(a)] += a
    s = int(0.22 * SR)
    out[s:s + len(b)] += b * 0.9
    return out


def save(name, x, peak=0.85):
    x = x / (np.max(np.abs(x)) or 1) * peak
    data = (x * 32767).astype('<i2').tobytes()
    with wave.open(f'assets/sounds/{name}.wav', 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data)
    print(name, round(len(x) / SR, 2), 's')


save('fs_kickoff', whistle(0.95))
save('fs_halftime', np.concatenate([whistle(0.32), silence(0.12), whistle(0.38)]))
save('fs_fulltime', np.concatenate([whistle(0.28), silence(0.1), whistle(0.28), silence(0.12), whistle(1.0)]))
save('fs_goal', chord_fanfare(), 0.9)
save('fs_redcard', buzzer(), 0.8)
save('fs_lineups', chime(), 0.75)
