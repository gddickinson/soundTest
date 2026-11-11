var channel_max = 10;										// number of channels
var audiochannels = new Array();

var playingFlag = false;

var soundChoice = '';

var chime = 0;

var loopFlag = false;

var timerID = '';
var chimesFlag = false;

var analyserFlag = false;

var audioLoop = new Array();

audioLoop['channel'] = new Audio();
audioLoop['finished'] = -1;

for (a=0;a<channel_max;a++) {									// prepare the channels
    audiochannels[a] = new Array();
    audiochannels[a]['channel'] = new Audio();						// create a new audio object
	audiochannels[a]['finished'] = -1;							// expected end time for this channel
	}

function play_multi_sound(s) {
    var el = document.getElementById(s);
    if (!el) return;                                        // no sound chosen yet
	for (var a=0;a<audiochannels.length;a++) {
        var ch = audiochannels[a]['channel'];
		if (ch.paused || ch.ended) {			// is this channel free? (duration may be unknown before loading)
            ch.src = el.src;
            ch.load();
            ch.play();
            break;
            }
        }
    }

function playSound() {
    if (soundChoice == '') {
        document.getElementById('message').textContent = 'Choose a sound first:';
        return;
    }
    playingFlag = true;
    
    if (playingFlag == true) {
        
        if(soundChoice == 'chimes'){
            chime = getRndInteger(0,20);
            play_multi_sound(chime);
        }
        else{
            play_multi_sound(soundChoice);
        }

    }  
}

function playRandSound() {
    playingFlag = true;
    
    if (playingFlag == true) {
        
        if(soundChoice == 'chimes'){
            
            if(getRndInteger(0,100)<40){            
                chime = getRndInteger(0,20);
                play_multi_sound(chime);
            } 
            
            if(getRndInteger(0,100)<5){            
                chime = getRndInteger(0,20);
                play_multi_sound(chime);
                chime = getRndInteger(0,20);
                play_multi_sound(chime);
            }
            
        }
        else{
            play_multi_sound(soundChoice);
        }

    }  
}



function stopPlaying(){
    playingFlag = false;
    
    for (a=0;a<audiochannels.length;a++) {
            audiochannels[a]['channel'].pause();
            audiochannels[a]['channel'].currentTime = 0;
            }
 
    if (chimesFlag == true){
        clearInterval(timerID);
        chimesFlag = false;
    }
    
    if(loopFlag == true){
        loopFlag = false;
        document.getElementById('startLoop').style.display = 'inline-block';
        audioLoop['channel'].pause();
        audioLoop['channel'].currentTime = 0;     
    }
    if(analyserFlag == true){
        stopAnalyser();
    }
}

function setSound(s){
    soundChoice = s;
}
    

function getRndInteger(min, max) {
    return Math.floor(Math.random() * (max - min) ) + min;
}

function playLoop(){  
    if (soundChoice == '') {
        document.getElementById('message').textContent = 'Choose a sound first:';
        return;
    }
    loopFlag = true;
    document.getElementById('startLoop').style.display = 'none';
    if(soundChoice == 'chimes'){
        loopChimes();        
    }
    else{
        loopSample(soundChoice);
    }
}

function loopSample(s){
    
    audioLoop['channel'].src = document.getElementById(s).src;
    audioLoop['channel'].load();
    audioLoop['channel'].loop = true;  
    audioLoop['channel'].play();
}

function loopChimes(){
    chimesFlag = true;
    // repeat with 2 sec interval
    timerID = setInterval(() => playRandSound(), 2000);
    
}


// The analyser graph is built once (a media element can only be connected to one source node) and reused.
var audioCtx = null;
var analyser = null;
var analyserSource = null;
var analyserFrame = 0;

function analyserFunc() {
    if (analyserFlag == true) return;                       // already running
    analyserFlag = true;

    if (audioCtx == null) {
        audioCtx = new AudioContext();
        analyser = audioCtx.createAnalyser();
        analyserSource = audioCtx.createMediaElementSource(oceansounds);
        analyserSource.connect(analyser);
        analyser.connect(audioCtx.destination);
        analyser.fftSize = 32;
    }
    audioCtx.resume();

    var frequencyData = new Uint8Array(analyser.frequencyBinCount);
    var bars = [P10, P20, P30, P40, P50, P60, P70, P80, P90];

    function renderFrame() {
        if (analyserFlag == false) return;
        analyser.getByteFrequencyData(frequencyData);
        for (var i = 0; i < bars.length; i++) {
            bars[i].style.height = ((frequencyData[i] * 100) / 256) + "%";
        }
        analyserFrame = requestAnimationFrame(renderFrame);
    }
    oceansounds.pause();
    oceansounds.play();
    renderFrame();
}

function stopAnalyser() {
    analyserFlag = false;
    cancelAnimationFrame(analyserFrame);
    oceansounds.pause();
    oceansounds.currentTime = 0;
    [P10, P20, P30, P40, P50, P60, P70, P80, P90].forEach(function (b) { b.style.height = "0%"; });
}
