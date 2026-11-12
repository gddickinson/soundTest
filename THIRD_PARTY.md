# Third-party material

This repository's own code is under the MIT licence in `LICENSE`.

## Sounds in `audio/`

- **Korg DS-8 Sci-Fi Sound Effects Pack** (`audio/Korg-DS-8-Sci-Fi-Sound-Effects-Pack/`, the 36 `glitch*.wav`):
  third-party, Copyright (c) 2008 Zeta Centauri, Inc., from freewavesamples.com; "may be used royalty-free in any film,
  music, or video game project" (see that folder's `Readme.txt`). Not covered by the MIT licence.
- **Everything else** (the other 52 WAVs: noise, ocean and water, wind and weather, bells and chimes, instruments):
  original sounds synthesised from scratch by `scripts/synth_sounds.py` (numpy, no recorded samples) for this
  repository, released under the same MIT licence as the code.
- The `.opus` and `.m4a` files are compressed copies of the WAV next to them (made by `scripts/compress_audio.py`) and
  carry the same terms as that WAV.
