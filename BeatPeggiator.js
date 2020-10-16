/**
 * BeatPeggiator
 * @author Michael Caterisano
 * @license http://opensource.org/licenses/MIT MIT License
 * @copyright 2020 Michael Caterisano
 */

var NeedsTimingInfo = true;
var activeNotes = [];
var currentPosition = 0;
var beatMap = [];
var delays = [];
var beatPositions = [];
var newBeat = true;
var prevBeat = null;
var currentBeat = null;
var firstTime = true;
var prevDenominator = null;
var availableNotes = [];
var sentNotes = [];

asdf;

function HandleMIDI(event) {
    if (event instanceof NoteOn) {
        activeNotes.push(event);
    } else if (event instanceof NoteOff) {
        for (i = 0; i < activeNotes.length; i++) {
            if (activeNotes[i].pitch == event.pitch) {
                activeNotes.splice(i, 1);
                break;
            }
        }
    }
    if (activeNotes.length === 0) {
        Reset();
    }
    activeNotes.sort(sortByPitchAscending);
}

//-----------------------------------------------------------------------------
function sortByPitchAscending(a, b) {
    if (a.pitch < b.pitch) return -1;
    if (a.pitch > b.pitch) return 1;
    return 0;
}
//-----------------------------------------------------------------------------
var wasPlaying = false;
function ProcessMIDI() {
    var musicInfo = GetTimingInfo();

    if (activeNotes.length === 0) {
        prevBeat = null;
    }

    if (wasPlaying && !musicInfo.playing) {
        for (i = 0; i < activeNotes.length; i++) {
            var off = new NoteOff(activeNotes[i]);
            off.send();
        }
    }

    wasPlaying = musicInfo.playing;

    if (activeNotes.length != 0) {
        var beatDivision = GetParameter("Beat Division");
        var numNotes = GetParameter("Number Of Notes");
        var randomDelay =
            Math.random() *
            ((GetParameter("Random Delay") / 100) * (1 / beatDivision));
        var lookAheadEnd = musicInfo.blockEndBeat;

        if (firstTime) {
            beatMap = generateBeatMap(numNotes, beatDivision);
            delays = generateNoteDelays(beatMap, 1 / beatDivision);
            beatPositions = getBeatPositions();
            firstTime = false;
            prevDenominator = GetParameter("Beats");
        }

        var nextBeat = beatPositions[currentPosition];

        // when cycling, find the beats that wrap around the last buffer
        if (musicInfo.cycling && lookAheadEnd >= musicInfo.rightCycleBeat) {
            if (lookAheadEnd >= musicInfo.rightCycleBeat) {
                beatPositions = delays.map((delay) => {
                    return musicInfo.leftCycleBeat + delay;
                });
                var cycleBeats =
                    musicInfo.rightCycleBeat - musicInfo.leftCycleBeat;
                var cycleEnd = lookAheadEnd - cycleBeats;
            }
        }

        // loop through the beats that fall within this buffer
        while (
            (nextBeat >= musicInfo.blockStartBeat && nextBeat < lookAheadEnd) ||
            (musicInfo.cycling && nextBeat < cycleEnd)
        ) {
            if (musicInfo.cycling && nextBeat >= musicInfo.rightCycleBeat) {
                //nextBeat -= cycleBeats;
                beatPositions = delays.map((delay) => {
                    return musicInfo.leftCycleBeat + delay;
                });
            }

            sendNote(nextBeat, randomDelay);

            if (numNotes === 1) {
                newBeat = true;
            }

            if (currentPosition >= beatPositions.length - 1) {
                currentPosition = 0;
                beatMap = generateBeatMap(numNotes, beatDivision);
                delays = generateNoteDelays(beatMap, 1 / beatDivision);
                beatPositions = getBeatPositions();
                prevDenominator = GetParameter("Beats");
                nextBeat = beatPositions[currentPosition];
            } else {
                currentPosition += 1;
                nextBeat = beatPositions[currentPosition];
            }
        }
    }
}

//-----------------------------------------------------------------------------
function sendNote(nextBeat, randomDelay) {
    var musicInfo = GetTimingInfo();
    var beatDivision = GetParameter("Beat Division");
    var noteOrder = GetParameter("Note Order");
    var noteLength = (GetParameter("Note Length") / 100) * (1 / beatDivision);
    var minimumVelocity = GetParameter("Minimum Velocity");
    var maximumVelocity = GetParameter("Maximum Velocity");
    var randomLength =
        Math.random() *
        ((GetParameter("Random Length") / 100) * (1 / beatDivision));
    sentNotes = [];

    if (availableNotes.length === 0) {
        availableNotes = [...activeNotes];
    }

    // send notes
    if (availableNotes.length !== 0) {
        var simultaneousNotes = GetParameter("Simultaneous Notes");
        var iterations =
            simultaneousNotes > activeNotes.length
                ? activeNotes.length
                : simultaneousNotes;

        // loop for simultaneous notes
        for (var i = 0; i < iterations; i++) {
            var selectedNote = chooseNote(noteOrder);

            // make sure note has note already been sent
            while (sentNotes.includes(selectedNote.note.pitch)) {
                selectedNote = chooseNote(noteOrder);
            }

            // remove sent note from available notes
            availableNotes.splice(selectedNote.index, 1);

            // send noteOn
            var noteToSend = new NoteOn();
            noteToSend.pitch = selectedNote.note.pitch;
            noteToSend.velocity = getRandomInRange(
                minimumVelocity,
                maximumVelocity
            );
            sentNotes.push(noteToSend.pitch);
            noteToSend.sendAtBeat(nextBeat + randomDelay);

            // send noteOff
            var noteOffToSend = new NoteOff(noteToSend);
            var noteOffBeat =
                nextBeat + noteLength + randomLength + randomDelay;
            if (musicInfo.cycling && noteOffBeat >= musicInfo.rightCycleBeat) {
                noteOffToSend.sendAtBeat(musicInfo.rightCycleBeat);
            } else {
                noteOffToSend.sendAtBeat(noteOffBeat);
            }
        }
    }
}

//-----------------------------------------------------------------------------
function getBeatPositions() {
    var musicInfo = GetTimingInfo();
    var positions = [];
    var denominator = getDenominator();
    var firstBeat = true;
    positions = delays.map((delay) => {
        if (firstTime) {
            prevBeat = getPrevBeat();
            return prevBeat + delay;
        } else if (!firstTime) {
            if (firstBeat) {
                prevBeat = prevBeat + denominator;
                currentBeat = prevBeat;
                firstBeat = false;
            }
            return currentBeat + delay;
        }
        if (musicInfo.blockStartBeat < musicInfo.leftCycleBeat) {
            return Math.ceil(musicInfo.blockStartBeat) + delay;
        }
    });
    return positions;
}
//-----------------------------------------------------------------------------
function getDenominator() {
    var currentDenominator = GetParameter("Beats");
    if (currentDenominator !== prevDenominator) {
        return prevDenominator;
    } else {
        return currentDenominator;
    }
}
//-----------------------------------------------------------------------------
function getPrevBeat() {
    var musicInfo = GetTimingInfo();
    if (
        musicInfo.cycling &&
        Math.round(musicInfo.blockStartBeat) === musicInfo.rightCycleBeat
    ) {
        return musicInfo.leftCycleBeat;
    } else {
        return Math.ceil(musicInfo.blockStartBeat);
    }
}
//-----------------------------------------------------------------------------
function getAndRemoveRandomItem(arr, noteOrder, currentPosition) {
    if (arr.length !== 0) {
        var index = Math.floor(Math.random() * arr.length);
        return arr.splice(index, 1)[0];
    }
}
//-----------------------------------------------------------------------------
function getRandomInRange(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}
//-----------------------------------------------------------------------------
var noteOrders = ["up", "down", "random"];
function chooseNote(noteOrder) {
    if (availableNotes.length === 0) {
        availableNotes = [...activeNotes];
    }

    var order = noteOrders[noteOrder];
    var length = availableNotes.length;

    if (order === "up") {
        return { note: availableNotes[0], index: 0 };
    }
    if (order === "down") {
        return {
            note: availableNotes[availableNotes.length - 1],
            index: availableNotes.length - 1,
        };
    }
    if (order === "random") {
        var index = Math.floor(Math.random() * length);
        return { note: availableNotes[index], index: index };
    } else {
        return 0;
    }
}
//-----------------------------------------------------------------------------
function generateBeatMap(numNotes, beatDivision) {
    // create array of size beatDivision and fill with index numbers
    var arr = new Array(beatDivision);
    for (var i = 0; i < beatDivision; i++) {
        arr[i] = i;
    }
    // randomly choose numNotes number of indices from array
    // these will be the beatDivisions that have a note
    var indices = [];
    for (var i = 0; i < numNotes; i++) {
        var index = getAndRemoveRandomItem(arr);
        indices.push(index);
    }
    // create output array like [1, 0, 1, 1] where 1 represents a note
    // 0 represents a rest, and the array length represents the number of
    // beat divisions
    var output = new Array(beatDivision).fill(0);
    for (var i = 0; i < indices.length; i++) {
        var index = indices[i];
        output[index] = 1;
    }
    return output;
}
//-----------------------------------------------------------------------------
function generateNoteDelays(beatMap, offsetAmount) {
    var output = [];

    for (var i = 0; i < beatMap.length; i++) {
        if (beatMap[i] === 1) {
            output.push(offsetAmount * (i * GetParameter("Beats")));
        }
    }
    return output;
}
//-----------------------------------------------------------------------------
function ParameterChanged(param, value) {
    var musicInfo = GetTimingInfo();

    // Enforce Beat Division >= Number Of Notes
    if (param === 0) {
        // Beat Division
        if (value < GetParameter("Number Of Notes")) {
            SetParameter(1, value);
        } else {
        }
    }
    if (param === 1) {
        // Number Of Notes
        if (value === 1) {
            beatPositions = delays.map((delay) => {
                return Math.ceil(musicInfo.blockStartBeat) + delay;
            });
            currentPosition = 0;
            nextBeat = beatPositions[currentPosition];
        }
        if (value > GetParameter("Beat Division")) {
            SetParameter("Beat Division", value);
        }
    }

    // Enforce Maximum Velocity >= Minimum Velocity
    if (param === 5) {
        if (value > GetParameter("Maximum Velocity")) {
            SetParameter(6, value);
        }
    }

    if (param === 6) {
        if (value < GetParameter("Minimum Velocity")) {
            SetParameter(5, value);
        }
    }
}

//-----------------------------------------------------------------------------
function Reset() {
    // Trace('RESET///////////');
    activeNotes = [];
    availableNotes = [];
    currentPosition = 0;
    beatMap = [];
    delays = [];
    beatPositions = [];
    newBeat = true;
    firstTime = true;
    prevBeat = null;
}
//-----------------------------------------------------------------------------
var PluginParameters = [
    {
        name: "Beat Division",
        type: "linear",
        minValue: 1,
        maxValue: 64,
        numberOfSteps: 63,
        defaultValue: 4,
    },
    {
        name: "Number Of Notes",
        type: "linear",
        minValue: 1,
        maxValue: 64,
        numberOfSteps: 63,
        defaultValue: 4,
    },
    {
        name: "Beats",
        type: "linear",
        minValue: 1,
        maxValue: 10,
        numberOfSteps: 9,
        defaultValue: 1,
    },

    {
        name: "Note Order",
        type: "menu",
        valueStrings: noteOrders,
        minValue: 0,
        maxValue: 2,
        numberOfSteps: 3,
        defaultValue: 0,
    },

    {
        name: "Simultaneous Notes",
        type: "lin",
        minValue: 1,
        maxValue: 16,
        numberOfSteps: 15,
        defaultValue: 1,
    },
    {
        name: "Minimum Velocity",
        type: "lin",
        minValue: 1,
        maxValue: 127,
        numberOfSteps: 126,
        defaultValue: 50,
    },
    {
        name: "Maximum Velocity",
        type: "lin",
        minValue: 1,
        maxValue: 127,
        numberOfSteps: 126,
        defaultValue: 100,
    },

    {
        name: "Note Length",
        unit: "%",
        type: "linear",
        minValue: 1,
        maxValue: 1000,
        defaultValue: 100.0,
        numberOfSteps: 1000,
    },

    {
        name: "Random Length",
        unit: "%",
        type: "linear",
        minValue: 0,
        maxValue: 1000,
        numberOfSteps: 1000,
        defaultValue: 0,
    },

    {
        name: "Random Delay",
        unit: "%",
        type: "linear",
        minValue: 0,
        maxValue: 200,
        numberOfSteps: 200,
        defaultValue: 0,
    },
];
