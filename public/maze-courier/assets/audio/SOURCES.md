# Audio sources

All files in this directory were downloaded from Pixabay for use in the game.
They are subject to the Pixabay Content License:
https://pixabay.com/service/license-summary/

## BGM

- `bgm/ice-silly-pups-in-snow.mp3`
  - Silly Pups in Snow — GoldenSoundLabs
  - https://pixabay.com/music/happy-childrens-tunes-silly-pups-in-snow-222528/
- `bgm/lava-upbeat-rpg-battle.mp3`
  - Upbeat RPG Battle — vespidaze
  - https://pixabay.com/music/video-games-upbeat-rpg-battle-460971/
- `bgm/space-magical-technology.mp3`
  - Magical Technology Sci-Fi Science Futuristic Game Music — Denis-Pavlov-Music
  - https://pixabay.com/music/supernatural-magical-technology-sci-fi-science-futuristic-game-music-300607/

## Skill and interaction SFX

The original MP3 files are retained in `sfx/`. The game uses the trimmed and
level-matched PCM files in `sfx/processed/`. These remove leading/trailing
silence, cap long source clips to gameplay-friendly durations, add short fades,
and normalize perceived RMS levels. `scripts/process_game_sfx.py` reproduces
the processed files.

- `sfx/item-pickup.mp3`
  - https://pixabay.com/sound-effects/film-special-effects-item-pick-up-38258/
- `sfx/item-drop.mp3`
  - https://pixabay.com/sound-effects/drop-or-pickup-item-4-387913/
- `sfx/push.mp3`
  - https://pixabay.com/sound-effects/impact-whoosh-351956/
- `sfx/power-push.mp3`
  - https://pixabay.com/sound-effects/impact-whoosh-drum-314548/
- `sfx/sprint.mp3`
  - https://pixabay.com/sound-effects/film-special-effects-transition-sfx-2-whoosh-409074/
- `sfx/jump.mp3`
  - https://pixabay.com/sound-effects/film-special-effects-whoosh-gaming-jump-243507/
- `sfx/freeze.mp3`
  - https://pixabay.com/sound-effects/iced-magic-6-378606/
- `sfx/swap.mp3`
  - https://pixabay.com/sound-effects/game-teleport-90735/
- `sfx/oil.mp3`
  - https://pixabay.com/sound-effects/slipping-cartoon-411855/
- `sfx/fluidize.mp3`
  - https://pixabay.com/sound-effects/slime-water-4-381260/
- `sfx/immunity.mp3`
  - https://pixabay.com/sound-effects/film-special-effects-shielding-game-sound-effect-379733/
