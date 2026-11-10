# SoundTest

A web-based audio player and visualizer with various sound options and playback modes.

## Live Demo

Try it now: [https://gddickinson.github.io/soundTest/](https://gddickinson.github.io/soundTest/)

## Features

SoundTest is a simple yet powerful audio application that offers:

- Multiple sound categories (Chimes, White Noise, Ocean Sounds)
- Single-play and loop modes
- Multi-channel audio support for overlapping sounds
- Real-time audio visualization with frequency analyzer
- Randomized chime patterns with configurable intervals

## How to Use

### Sound Selection

Use the vertical menu to select a sound category:
- **Chimes**: A collection of 20 different bell/chime sounds
- **White Noise**: Continuous white noise for focus or relaxation
- **Ocean Sounds**: Calming ocean wave sounds

### Playback Controls

The application offers several playback options:

- **Play Sample**: Play a single instance of the selected sound
  - For chimes, this plays a random chime from the collection
  
- **Play Loop**: Start a continuous loop of the selected sound
  - For chimes, this creates a randomized pattern with 2-second intervals
  - For white noise and ocean sounds, this loops the audio continuously
  
- **Start Analyser**: Activates the frequency analyzer visualization (works best with ocean sounds)
  - Shows real-time frequency data as animated blue bars
  
- **Stop**: Stops all audio playback and resets the audio state

## Technical Details

### Audio Implementation

The application uses several key techniques for audio handling:

- Multiple audio channels for simultaneous sound playback
- Dynamic audio source selection based on user choice
- Randomized sound selection algorithm for chimes
- HTML5 Audio API for basic playback
- Web Audio API for analysis and visualization

### Audio Visualization

The frequency analyzer:
- Uses Web Audio API's `AnalyserNode`
- Samples audio at 32 FFT size
- Visualizes 9 frequency bands
- Updates in real-time using `requestAnimationFrame`

### Code Structure

- `index.html`: Main application structure and audio elements
- `style.css`: Styling for UI elements and visualizer
- `script.js`: Core functionality including:
  - Audio channel management
  - Playback control
  - Sound selection
  - Randomization functions
  - Frequency analysis and visualization

## Project Structure

```
soundTest/
├── index.html          # Main HTML document
├── style.css           # CSS styling
├── script.js           # JavaScript functionality
├── README.md           # Project documentation
└── audio/              # Audio files directory
    ├── bells_chimes/   # Chime sound files (0.wav through 19.wav)
    ├── whitenoise/     # White noise audio
    └── ocean_sounds/   # Ocean wave sounds
```

## Browser Compatibility

This application is built with standard Web APIs and should work in all modern browsers that support:
- HTML5 Audio
- Web Audio API
- ECMAScript 6 features

## Future Enhancements

Potential improvements for future versions:
- Additional sound categories
- Customizable playback parameters
- More advanced visualization options
- Customizable chime patterns
- Volume and EQ controls
- Save and load favorite settings

## Contributing

Contributions to SoundTest are welcome! Feel free to submit pull requests or open issues with suggestions for improvements.

## License

Released under the [MIT licence](LICENSE). The sound samples in `audio/` are third-party: see [THIRD_PARTY.md](THIRD_PARTY.md).

## Credits

Developed by G.D. Dickinson

---

*SoundTest - Audio loops and visualization for relaxation, focus, and sleep*
