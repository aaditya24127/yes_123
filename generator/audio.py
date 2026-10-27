"""Edge-TTS classroom audio with exact segment timestamps (voices: Indian English)."""
import asyncio, subprocess, tempfile, shutil
from pathlib import Path
import edge_tts, imageio_ffmpeg
from mutagen.mp3 import MP3

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
FEM, MAL = 'en-IN-NeerjaNeural', 'en-IN-PrabhatNeural'


def voice_for(spk, teacher_female):
    if spk == 'T':
        return (FEM if teacher_female else MAL), '+10%', '+0Hz'
    if spk == 'SC':
        return FEM, '-4%', '+38Hz'
    if spk == 'S1':
        return MAL, '+6%', '+42Hz'
    return FEM, '+8%', '+36Hz'          # S2


async def _synth(items, tmp):
    sem = asyncio.Semaphore(4)

    async def one(i, spk, text, female):
        v, rate, pitch = voice_for(spk, female)
        async with sem:
            for attempt in range(3):
                try:
                    await edge_tts.Communicate(text, v, rate=rate, pitch=pitch).save(str(tmp / f'u{i:03d}.mp3')); return
                except Exception:
                    await asyncio.sleep(1.5)
            raise RuntimeError(f'TTS failed for line {i}')
    await asyncio.gather(*[one(i, s, t, f) for i, (s, t, f) in enumerate(items)])


def build_audio(script, teacher_female, out_path):
    """Returns (duration_seconds, segments[{start,end,speaker,text,tag}])."""
    tmp = Path(tempfile.mkdtemp(prefix='crp_tts_'))
    try:
        lines = [(s, t, g) for s, t, g in script if s != 'P']
        asyncio.run(_synth([(s, t, teacher_female) for s, t, g in lines], tmp))
        sil = {}

        def silence(sec):
            if sec not in sil:
                p = tmp / f'sil_{sec}.mp3'
                subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', str(sec),
                                '-c:a', 'libmp3lame', '-b:a', '48k', str(p)], check=True)
                sil[sec] = p
            return sil[sec]
        order, segs, t, i = [], [], 0.0, 0
        for s, text, tag in script:
            if s == 'P':
                sec = float(text); order.append(silence(sec)); t += sec; continue
            f = tmp / f'u{i:03d}.mp3'; i += 1
            d = MP3(str(f)).info.length
            segs.append(dict(start=round(t, 2), end=round(t + d, 2), speaker=s, text=text, tag=tag))
            order.append(f); t += d
            order.append(silence(0.45)); t += 0.45
        # normalise every piece to the same codec parameters before concat
        norm = []
        for k, f in enumerate(order):
            n = tmp / f'n{k:03d}.mp3'
            subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-i', str(f), '-ar', '24000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '48k', str(n)], check=True)
            norm.append(n)
        lst = tmp / 'list.txt'
        lst.write_text('\n'.join(f"file '{n.as_posix()}'" for n in norm), encoding='utf-8')
        subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', str(lst), '-c', 'copy', str(out_path)], check=True)
        dur = MP3(str(out_path)).info.length
        # rescale timestamps to the measured duration (re-encode padding drift)
        k = dur / t if t else 1
        for sg in segs: sg['start'] = round(sg['start'] * k, 2); sg['end'] = round(sg['end'] * k, 2)
        return round(dur, 1), segs
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def mmss(x):
    x = int(x); return f'{x // 60:02d}:{x % 60:02d}'

