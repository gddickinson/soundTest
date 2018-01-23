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
	for (a=0;a<audiochannels.length;a++) {
		thistime = new Date();
		if (audiochannels[a]['finished'] < thistime.getTime()) {			// is this channel finished?
            audiochannels[a]['finished'] = thistime.getTime() + document.getElementById(s).duration*1000;
            audiochannels[a]['channel'].src = document.getElementById(s).src;
            audiochannels[a]['channel'].load();
            audiochannels[a]['channel'].play();
            break;
            }
        }
    }

function playSound() {
    playingFlag = true;
    
    if (playingFlag == true) {
        
        if(soundChoice == 'chimes'){
            chime = getRndInteger(0,19);
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
                chime = getRndInteger(0,19);
                play_multi_sound(chime);
            } 
            
            if(getRndInteger(0,100)<5){            
                chime = getRndInteger(0,19);
                play_multi_sound(chime);
                chime = getRndInteger(0,19);
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
    }
    
    if(loopFlag == true){
        loopFlag = false;
        document.getElementById('startLoop').style.display = 'inline-block';
        audioLoop['channel'].pause();
        audioLoop['channel'].currentTime = 0;     
    }
}

function setSound(s){
    soundChoice = s;
}
    

function getRndInteger(min, max) {
    return Math.floor(Math.random() * (max - min) ) + min;
}

function playLoop(){  
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


function analyserFunc() {
    
    analyserFlag = true;
    
    var audioCtx = new AudioContext();
    var analyser = audioCtx.createAnalyser();
    var source = audioCtx.createMediaElementSource(oceansounds);
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    analyser.fftSize = 32;

    var frequencyData = new Uint8Array(analyser.frequencyBinCount);

    function renderFrame() {
        analyser.getByteFrequencyData(frequencyData);
        P10.style.height = ((frequencyData[0] * 100) / 256) + "%";
        P20.style.height = ((frequencyData[1] * 100) / 256) + "%";
        P30.style.height = ((frequencyData[2] * 100) / 256) + "%";
        P40.style.height = ((frequencyData[3] * 100) / 256) + "%";
        P50.style.height = ((frequencyData[4] * 100) / 256) + "%";
        P60.style.height = ((frequencyData[5] * 100) / 256) + "%";
        P70.style.height = ((frequencyData[6] * 100) / 256) + "%";
        P80.style.height = ((frequencyData[7] * 100) / 256) + "%";
        P90.style.height = ((frequencyData[8] * 100) / 256) + "%";
        console.log(frequencyData)
        requestAnimationFrame(renderFrame);
    }
    oceansounds.pause();
    oceansounds.play();
    renderFrame();
}
