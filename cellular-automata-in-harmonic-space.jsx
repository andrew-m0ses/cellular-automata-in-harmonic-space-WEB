import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RefreshCw, ChevronRight } from 'lucide-react';

const calculateRatio = (numerator, denominator, position) => {
  return Math.pow(numerator / denominator, position);
};

const ratioToFrequency = (ratio, baseFrequency) => {
  return baseFrequency * ratio;
};

const RULE_PRESETS = {
  "conway": { 
    name: "Conway's Game of Life",
    birth: [3], 
    survival: [2, 3],
  },
  "fredkin": { 
    name: "Fredkin's Rule",
    birth: [1, 3, 5, 7], 
    survival: [1, 3, 5, 7],
  },
  "brain": { 
    name: "Brian's Brain",
    birth: [2], 
    survival: [],
    special: true,
    states: 3,
  },
  "seeds": { 
    name: "Seeds",
    birth: [2], 
    survival: [],
  },
  "daynight": { 
    name: "Day & Night",
    birth: [3, 6, 7, 8], 
    survival: [3, 4, 6, 7, 8],
  },
  "vonneumann": { 
    name: "Vote (Von Neumann)",
    birth: [4],
    survival: [4, 5, 6, 7, 8],
    useVonNeumann: true,
  },
  "custom": {
    name: "Custom Rule",
    birth: [3],
    survival: [2, 3],
  }
};

export default function CellularAutomataSynth() {
  const [dimensions, setDimensions] = useState(2);
  const [gridSize, setGridSize] = useState(8);
  const [running, setRunning] = useState(false);
  const [baseFrequency, setBaseFrequency] = useState(100);
  const [rule, setRule] = useState("conway");
  const [generation, setGeneration] = useState(0);
  const [generationTime, setGenerationTime] = useState(1000);
  
  const [ruleSets, setRuleSets] = useState(RULE_PRESETS);
  const [customBirth, setCustomBirth] = useState([3]);
  const [customSurvival, setCustomSurvival] = useState([2, 3]);
  
  const [arpeggiate, setArpeggiate] = useState('OFF');
  
  const [harmonicRatios, setHarmonicRatios] = useState({
    x: { numerator: 8, denominator: 7 },
    y: { numerator: 3, denominator: 2 },
    z: { numerator: 6, denominator: 5 },
    w: { numerator: 11, denominator: 12 }
  });
  
  const [grid, setGrid] = useState([]);
  
  const [canvasSize, setCanvasSize] = useState({
    width: 400,
    height: 400
  });
  
  const audioContextRef = useRef(null);
  const oscillatorsRef = useRef({});
  const arpSchedulerRef = useRef(null);
  
  const canvasRef = useRef(null);

  useEffect(() => {
    initializeGrid();
  }, [dimensions, gridSize]);
  
  useEffect(() => {
    if (rule === "custom") {
      return;
    }
    
    if (ruleSets[rule]) {
      setCustomBirth([...ruleSets[rule].birth]);
      setCustomSurvival([...ruleSets[rule].survival]);
    }
  }, [rule, ruleSets]);
  
  useEffect(() => {
    if (rule === "custom") {
      setRuleSets(prev => ({
        ...prev,
        custom: {
          ...prev.custom,
          birth: [...customBirth],
          survival: [...customSurvival]
        }
      }));
    }
  }, [customBirth, customSurvival]);
  
  const [isTransitioning, setIsTransitioning] = useState(false);
  const prevDimensionsRef = useRef(dimensions);
  
  useEffect(() => {
    const dimensionsChanged = prevDimensionsRef.current !== dimensions;
    prevDimensionsRef.current = dimensions;
    
    if (dimensionsChanged || gridSize !== prevDimensionsRef.current) {
      stopAllSounds();
      
      setIsTransitioning(true);
      
      if (running) {
        setRunning(false);
      }
      
      setTimeout(() => {
        initializeGrid();
        
        setIsTransitioning(false);
      }, 300);
    }
  }, [dimensions, gridSize]);
  
  useEffect(() => {
    const baseSize = 500;
    let width = baseSize;
    let height = baseSize;
    
    if (dimensions >= 3) {
      width = 800;
      height = 800;
    }
    
    setCanvasSize({ width, height });
    
    if (dimensions === 4 && gridSize > 8) {
      setGridSize(8);
    }
  }, [dimensions, gridSize]);
  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      
      return () => {
        if (audioContextRef.current) {
          audioContextRef.current.close();
        }
      };
    }
  }, []);
  
  useEffect(() => {
    if (running) {
      const updateInterval = setInterval(() => {
        updateGrid();
        setGeneration(prev => prev + 1);
      }, generationTime);
      
      return () => clearInterval(updateInterval);
    } else {
      stopAllSounds();
    }
  }, [running, grid, rule, generationTime, customBirth, customSurvival]);
  
  useEffect(() => {
    drawGrid();
    playSounds();
  }, [grid, dimensions, canvasSize, arpeggiate]);
  
  const cleanupSynthVoice = (voice) => {
    if (!voice) return;
    
    const now = audioContextRef.current.currentTime;
    
    if (voice.oscillator) {
      try {
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
        voice.gain.gain.linearRampToValueAtTime(0, now + 0.1);
        
        setTimeout(() => {
          try {
            voice.oscillator.stop();
            voice.oscillator.disconnect();
            voice.gain.disconnect();
          } catch (e) {
          }
        }, 150);
      } catch (e) {
      }
    } else if (voice.oscillators) {
      if (voice.gains) {
        voice.gains.forEach(gain => {
          try {
            gain.gain.cancelScheduledValues(now);
            gain.gain.setValueAtTime(gain.gain.value, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.1);
          } catch (e) {
          }
        });
      }
      
      if (voice.oscillators) {
        setTimeout(() => {
          voice.oscillators.forEach(osc => {
            try {
              osc.stop();
              osc.disconnect();
            } catch (e) {
            }
          });
        }, 150);
      }
      
      if (voice.filter) {
        setTimeout(() => {
          try {
            voice.filter.disconnect();
          } catch (e) {
          }
        }, 150);
      }
      
      if (voice.compressor) {
        setTimeout(() => {
          try {
            voice.compressor.disconnect();
          } catch (e) {
          }
        }, 150);
      }
    }
  };
  
  const createSynthySound = (frequency, context, destination, index = 0) => {
    const mainOsc = context.createOscillator();
    const subOsc = context.createOscillator();
    const fmModulator = context.createOscillator();
    
    const mainGain = context.createGain();
    const subGain = context.createGain();
    const fmGain = context.createGain();
    const mainFilter = context.createBiquadFilter();
    
    const voiceCompressor = context.createDynamicsCompressor();
    voiceCompressor.threshold.value = -24;
    voiceCompressor.knee.value = 10;
    voiceCompressor.ratio.value = 4;
    voiceCompressor.attack.value = 0.005;
    voiceCompressor.release.value = 0.1;
    
    let mainType, filterType, filterQ, mainLevel, subLevel, fmAmount;
    
    if (dimensions === 1) {
      mainType = 'sawtooth';
      filterType = 'lowpass';
      filterQ = 2;
      mainLevel = 0.7;
      subLevel = 0.3;
      fmAmount = 0.5;
    } else if (dimensions === 2) {
      mainType = 'triangle';
      filterType = 'lowpass';
      filterQ = 3;
      mainLevel = 0.6;
      subLevel = 0.4;
      fmAmount = 1.0;
    } else if (dimensions === 3) {
      mainType = 'square';
      filterType = 'bandpass';
      filterQ = 4;
      mainLevel = 0.5;
      subLevel = 0.5;
      fmAmount = 1.5;
    } else {
      mainType = 'sine';
      filterType = 'lowpass';
      filterQ = 2;
      mainLevel = 0.7;
      subLevel = 0.3;
      fmAmount = 0.7;
    }
    
    mainOsc.type = mainType;
    
    subOsc.type = 'sine';
    subOsc.frequency.value = frequency / 2;
    subGain.gain.value = subLevel;
    
    fmModulator.type = 'sine';
    fmModulator.frequency.value = frequency * 1.5;
    fmGain.gain.value = frequency * fmAmount * 0.5;
    
    mainFilter.type = filterType;
    mainFilter.frequency.value = Math.min(frequency * 3, 15000);
    mainFilter.Q.value = filterQ;
    
    const now = context.currentTime;
    mainFilter.frequency.setValueAtTime(mainFilter.frequency.value, now);
    
    for (let i = 0; i < 3; i++) {
      const timeOffset = i * 0.3;
      const freqMod = 1 + 0.1 * Math.sin(i);
      mainFilter.frequency.exponentialRampToValueAtTime(
        mainFilter.frequency.value * freqMod,
        now + timeOffset
      );
    }
    
    fmModulator.connect(fmGain);
    fmGain.connect(mainOsc.frequency);
    
    mainOsc.frequency.value = frequency;
    
    mainOsc.connect(mainGain);
    subOsc.connect(subGain);
    
    mainGain.connect(mainFilter);
    subGain.connect(mainFilter);
    
    mainFilter.connect(voiceCompressor);
    voiceCompressor.connect(destination);
    
    mainOsc.start();
    subOsc.start();
    fmModulator.start();
    
    return {
      oscillators: [mainOsc, subOsc, fmModulator],
      gains: [mainGain, subGain, fmGain],
      filter: mainFilter,
      compressor: voiceCompressor
    };
  };
  
  const playSounds = () => {
    if (!audioContextRef.current || isTransitioning || !validateGrid()) return;
    
    stopAllSounds();
    
    if (!running) {
      return;
    }
    
    try {
      let activeCells = [];
      
      if (dimensions === 1) {
        grid.forEach((cell, x) => {
          if (cell) activeCells.push([x]);
        });
      } 
      else if (dimensions === 2) {
        grid.forEach((row, x) => {
          row.forEach((cell, y) => {
            if (cell) activeCells.push([x, y]);
          });
        });
      }
      else if (dimensions === 3) {
        grid.forEach((plane, x) => {
          plane.forEach((row, y) => {
            row.forEach((cell, z) => {
              if (cell) activeCells.push([x, y, z]);
            });
          });
        });
      }
      else if (dimensions === 4) {
        grid.forEach((space, x) => {
          space.forEach((plane, y) => {
            plane.forEach((row, z) => {
              row.forEach((cell, w) => {
                if (cell) activeCells.push([x, y, z, w]);
              });
            });
          });
        });
      }
      
      if (activeCells.length === 0) return;
      
      const masterGain = audioContextRef.current.createGain();
      const limiter = audioContextRef.current.createDynamicsCompressor();
      
      limiter.threshold.value = -3;
      limiter.knee.value = 0.0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.001;
      limiter.release.value = 0.1;
      
      masterGain.connect(limiter);
      limiter.connect(audioContextRef.current.destination);
      
      const cellCount = activeCells.length;
      
      const logBase = Math.max(4, dimensions * 2);
      const masterGainValue = 0.5 / (1 + Math.log(cellCount + 1) / Math.log(logBase));
      masterGain.gain.value = masterGainValue;
      
      const perCellWeight = 0.4 / (1 + Math.log(cellCount + 1) / Math.log(logBase)); 
      
      if (arpeggiate !== 'OFF' && activeCells.length > 1) {
        playArpeggiatedSounds(activeCells, masterGain);
      } else {
        playSimultaneousSounds(activeCells, masterGain, perCellWeight);
      }
    } catch (e) {
      console.error("Error in playSounds:", e);
      stopAllSounds();
    }
  };
  
  const playSimultaneousSounds = (activeCells, masterGain, perCellWeight) => {
    activeCells.forEach((coords, index) => {
      const [x, y = 0, z = 0, w = 0] = coords;
      
      const xRatio = calculateRatio(
        harmonicRatios.x.numerator, 
        harmonicRatios.x.denominator, 
        x
      );
      
      const yRatio = dimensions >= 2 ? calculateRatio(
        harmonicRatios.y.numerator, 
        harmonicRatios.y.denominator, 
        y
      ) : 1;
      
      const zRatio = dimensions >= 3 ? calculateRatio(
        harmonicRatios.z.numerator, 
        harmonicRatios.z.denominator, 
        z
      ) : 1;
      
      const wRatio = dimensions >= 4 ? calculateRatio(
        harmonicRatios.w.numerator, 
        harmonicRatios.w.denominator, 
        w
      ) : 1;
      
      const frequency = ratioToFrequency(xRatio * yRatio * zRatio * wRatio, baseFrequency);
      
      const oscillator = audioContextRef.current.createOscillator();
      const gain = audioContextRef.current.createGain();
      
      if (dimensions === 4) {
        oscillator.type = 'sine';
      } else if (dimensions === 3) {
        oscillator.type = index % 2 === 0 ? 'sine' : 'triangle';
      } else if (dimensions === 2) {
        oscillator.type = ['sine', 'triangle', 'sawtooth'][index % 3];
      } else {
        oscillator.type = ['sine', 'triangle', 'sawtooth', 'square'][index % 4];
      }
      
      oscillator.frequency.value = frequency;
      
      if (dimensions === 4) {
        gain.gain.value = perCellWeight;
      } else {
        gain.gain.setValueAtTime(0, audioContextRef.current.currentTime);
        gain.gain.linearRampToValueAtTime(perCellWeight, audioContextRef.current.currentTime + 0.05);
      }
      
      oscillator.connect(gain);
      gain.connect(masterGain);
      
      oscillator.start();
      
      oscillatorsRef.current[index] = {
        oscillator: oscillator,
        gain: gain
      };
    });
  };
  
  const playArpeggiatedSounds = (activeCells, masterGain) => {
    if (arpSchedulerRef.current) {
      clearTimeout(arpSchedulerRef.current);
    }
    
    const MIN_NOTE_TIME = 40;
    
    const cellFrequencies = activeCells.map(coords => {
      const [x, y = 0, z = 0, w = 0] = coords;
      
      const xRatio = calculateRatio(
        harmonicRatios.x.numerator, 
        harmonicRatios.x.denominator, 
        x
      );
      
      const yRatio = dimensions >= 2 ? calculateRatio(
        harmonicRatios.y.numerator, 
        harmonicRatios.y.denominator, 
        y
      ) : 1;
      
      const zRatio = dimensions >= 3 ? calculateRatio(
        harmonicRatios.z.numerator, 
        harmonicRatios.z.denominator, 
        z
      ) : 1;
      
      const wRatio = dimensions >= 4 ? calculateRatio(
        harmonicRatios.w.numerator, 
        harmonicRatios.w.denominator, 
        w
      ) : 1;
      
      return {
        coords,
        frequency: ratioToFrequency(xRatio * yRatio * zRatio * wRatio, baseFrequency)
      };
    });
    
    let arpPattern = [];
    
    switch(arpeggiate) {
      case 'UP':
        cellFrequencies.sort((a, b) => a.frequency - b.frequency);
        arpPattern = cellFrequencies.map(cell => cell.coords);
        break;
        
      case 'DOWN':
        cellFrequencies.sort((a, b) => b.frequency - a.frequency);
        arpPattern = cellFrequencies.map(cell => cell.coords);
        break;
        
      case 'UP_DOWN':
        cellFrequencies.sort((a, b) => a.frequency - b.frequency);
        
        const ascendingCells = cellFrequencies.map(cell => cell.coords);
        
        let descendingCells = [];
        if (ascendingCells.length > 2) { 
          descendingCells = [...ascendingCells].slice(1, -1).reverse();
        }
        
        arpPattern = [...ascendingCells, ...descendingCells];
        break;
        
      case 'RANDOM':
        const shuffled = [...cellFrequencies];
        
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        
        arpPattern = shuffled.map(cell => cell.coords);
        break;
        
      default:
        cellFrequencies.sort((a, b) => a.frequency - b.frequency);
        arpPattern = cellFrequencies.map(cell => cell.coords);
    }
    
    if (arpPattern.length === 0) {
      return;
    }
    
    const MAX_PATTERN_TIME = generationTime * 0.95;
    
    let noteTime = MAX_PATTERN_TIME / arpPattern.length;
    
    if (noteTime < MIN_NOTE_TIME) {
      console.log(`Warning: Note time (${noteTime.toFixed(2)}ms) is below minimum (${MIN_NOTE_TIME}ms). Audio quality may suffer.`);
    }
    
    console.log(`Arpeggiating ${arpPattern.length} notes at ${noteTime.toFixed(2)}ms per note`);
    console.log(`Total pattern duration: ${(noteTime * arpPattern.length).toFixed(2)}ms out of ${generationTime}ms generation time`);
    
    const attackRatio = Math.min(0.15, 10/noteTime);
    const decayRatio = Math.min(0.1, 8/noteTime);
    const releaseRatio = Math.min(0.3, 15/noteTime);
    
    const attack = noteTime * attackRatio;
    const decay = noteTime * decayRatio;
    const sustain = 0.7;
    const release = noteTime * releaseRatio;
    
    const arpLimiter = audioContextRef.current.createDynamicsCompressor();
    arpLimiter.threshold.value = -6;
    arpLimiter.knee.value = 4;
    arpLimiter.ratio.value = 12;
    arpLimiter.attack.value = 0.002;
    arpLimiter.release.value = 0.05;
    arpLimiter.connect(masterGain);
    
    const isLargePattern = arpPattern.length > 100;
    
    let reverbConvolver = null;
    let dryGain = null;
    let wetGain = null;
    
    if (!isLargePattern) {
      reverbConvolver = audioContextRef.current.createConvolver();
      dryGain = audioContextRef.current.createGain();
      wetGain = audioContextRef.current.createGain();
      
      const createReverbImpulse = () => {
        const sampleRate = audioContextRef.current.sampleRate;
        const length = sampleRate * (dimensions >= 4 ? 0.5 : 1.0);
        const impulse = audioContextRef.current.createBuffer(2, length, sampleRate);
        const leftChannel = impulse.getChannelData(0);
        const rightChannel = impulse.getChannelData(1);
        
        for (let i = 0; i < length; i++) {
          const decay = Math.pow(0.5, i / (sampleRate * 0.3));
          const noise = Math.random() * 2 - 1;
          
          leftChannel[i] = noise * decay;
          rightChannel[i] = noise * decay;
        }
        
        return impulse;
      };
      
      reverbConvolver.buffer = createReverbImpulse();
      dryGain.gain.value = 0.9;
      wetGain.gain.value = 0.1;
      
      dryGain.connect(arpLimiter);
      reverbConvolver.connect(wetGain);
      wetGain.connect(arpLimiter);
    }
    
    const scheduleArpeggio = (index = 0) => {
      if (!running || arpeggiate === 'OFF') {
        stopAllSounds();
        return;
      }
      
      if (!arpPattern || arpPattern.length === 0 || index >= arpPattern.length) {
        console.error("Invalid arpeggio pattern or index");
        return;
      }
      
      const coords = arpPattern[index];
      
      if (!coords) {
        console.error("Invalid coordinates in arpeggio pattern");
        return;
      }
      
      const [x, y = 0, z = 0, w = 0] = coords;
      
      const xRatio = calculateRatio(
        harmonicRatios.x.numerator, 
        harmonicRatios.x.denominator, 
        x
      );
      
      const yRatio = dimensions >= 2 ? calculateRatio(
        harmonicRatios.y.numerator, 
        harmonicRatios.y.denominator, 
        y
      ) : 1;
      
      const zRatio = dimensions >= 3 ? calculateRatio(
        harmonicRatios.z.numerator, 
        harmonicRatios.z.denominator, 
        z
      ) : 1;
      
      const wRatio = dimensions >= 4 ? calculateRatio(
        harmonicRatios.w.numerator, 
        harmonicRatios.w.denominator, 
        w
      ) : 1;
      
      const frequency = ratioToFrequency(xRatio * yRatio * zRatio * wRatio, baseFrequency);
      
      const voiceGain = audioContextRef.current.createGain();
      
      const now = audioContextRef.current.currentTime;
      voiceGain.gain.setValueAtTime(0, now);
      voiceGain.gain.linearRampToValueAtTime(1, now + attack / 1000);
      voiceGain.gain.linearRampToValueAtTime(sustain, now + (attack + decay) / 1000);
      voiceGain.gain.setValueAtTime(sustain, now + (noteTime - release) / 1000);
      voiceGain.gain.linearRampToValueAtTime(0, now + noteTime / 1000);
      
      if (isLargePattern) {
        voiceGain.connect(arpLimiter);
      } else {
        voiceGain.connect(dryGain);
        voiceGain.connect(reverbConvolver);
      }
      
      let synthVoice;
      
      if (isLargePattern || dimensions === 4) {
        const oscillator = audioContextRef.current.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        oscillator.connect(voiceGain);
        oscillator.start();
        
        synthVoice = {
          oscillators: [oscillator],
          gains: [voiceGain],
          filter: null
        };
      } else {
        synthVoice = createSynthySound(frequency, audioContextRef.current, voiceGain, index);
      }
      
      setTimeout(() => {
        synthVoice.oscillators.forEach(osc => {
          try {
            osc.stop();
            osc.disconnect();
          } catch (e) {
          }
        });
        
        synthVoice.gains.forEach(gain => {
          try { gain.disconnect(); } catch (e) {}
        });
        
        if (synthVoice.filter) {
          try { synthVoice.filter.disconnect(); } catch (e) {}
        }
        if (synthVoice.compressor) {
          try { synthVoice.compressor.disconnect(); } catch (e) {}
        }
        try { voiceGain.disconnect(); } catch (e) {}
        
      }, noteTime + 50);
      
      oscillatorsRef.current[index] = {
        oscillators: synthVoice.oscillators,
        gains: [...synthVoice.gains, voiceGain],
        filter: synthVoice.filter,
        compressor: synthVoice.compressor
      };
      
      if (arpPattern.length === 0) {
        return;
      }
      
      const nextIndex = (index + 1) % arpPattern.length;
      
      arpSchedulerRef.current = setTimeout(() => {
        scheduleArpeggio(nextIndex);
      }, noteTime);
    };
    
    if (arpPattern.length > 0) {
      scheduleArpeggio(0);
    }
  };
  
  const getScaledRules = () => {
    const currentRule = rule === "custom" ? ruleSets.custom : ruleSets[rule];
    
    if (currentRule.special || currentRule.useVonNeumann) {
      return {
        birth: currentRule.birth,
        survival: currentRule.survival
      };
    }
    
    return {
      birth: currentRule.birth,
      survival: currentRule.survival
    };
  };
  
  const stopAllSounds = () => {
    if (!audioContextRef.current) return;
    
    if (arpSchedulerRef.current) {
      clearTimeout(arpSchedulerRef.current);
      arpSchedulerRef.current = null;
    }
    
    Object.values(oscillatorsRef.current).forEach(voice => {
      cleanupSynthVoice(voice);
    });
    
    oscillatorsRef.current = {};
  };
  
  const initializeGrid = () => {
    let newGrid = [];
    
    if (dimensions === 1) {
      newGrid = Array(gridSize).fill().map(() => Math.random() > 0.7);
    } 
    else if (dimensions === 2) {
      newGrid = Array(gridSize).fill().map(() => 
        Array(gridSize).fill().map(() => Math.random() > 0.7)
      );
    }
    else if (dimensions === 3) {
      newGrid = Array(gridSize).fill().map(() => 
        Array(gridSize).fill().map(() => 
          Array(gridSize).fill().map(() => Math.random() > 0.7)
        )
      );
    }
    else if (dimensions === 4) {
      newGrid = Array(gridSize).fill().map(() => 
        Array(gridSize).fill().map(() => 
          Array(gridSize).fill().map(() => 
            Array(gridSize).fill().map(() => Math.random() > 0.7)
          )
        )
      );
    }
    
    setGrid(newGrid);
    setGeneration(0);
  };
  
  const countNeighbors = (grid, x, y, z = 0, w = 0) => {
    if (isTransitioning || !grid) return 0;
    
    let neighbors = 0;
    
    try {
      if (dimensions === 1) {
        const prev = (x - 1 + gridSize) % gridSize;
        const next = (x + 1) % gridSize;
        if (grid[prev]) neighbors++;
        if (grid[next]) neighbors++;
      } 
      else if (dimensions === 2) {
        for (let i = -1; i <= 1; i++) {
          for (let j = -1; j <= 1; j++) {
            if (i === 0 && j === 0) continue;
            const newX = (x + i + gridSize) % gridSize;
            const newY = (y + j + gridSize) % gridSize;
            if (grid[newX] && grid[newX][newY]) neighbors++;
          }
        }
      }
      else if (dimensions === 3) {
        for (let i = -1; i <= 1; i++) {
          for (let j = -1; j <= 1; j++) {
            for (let k = -1; k <= 1; k++) {
              if (i === 0 && j === 0 && k === 0) continue;
              const newX = (x + i + gridSize) % gridSize;
              const newY = (y + j + gridSize) % gridSize;
              const newZ = (z + k + gridSize) % gridSize;
              if (grid[newX] && grid[newX][newY] && grid[newX][newY][newZ]) neighbors++;
            }
          }
        }
      }
      else if (dimensions === 4) {
        for (let i = -1; i <= 1; i++) {
          for (let j = -1; j <= 1; j++) {
            for (let k = -1; k <= 1; k++) {
              for (let l = -1; l <= 1; l++) {
                if (i === 0 && j === 0 && k === 0 && l === 0) continue;
                const newX = (x + i + gridSize) % gridSize;
                const newY = (y + j + gridSize) % gridSize;
                const newZ = (z + k + gridSize) % gridSize;
                const newW = (w + l + gridSize) % gridSize;
                if (grid[newX] && grid[newX][newY] && grid[newX][newY][newZ] && grid[newX][newY][newZ][newW]) neighbors++;
              }
            }
          }
        }
      }
      return neighbors;
    } catch (e) {
      console.error("Error counting neighbors:", e);
      return 0;
    }
  };
  
  const countVonNeumannNeighbors = (grid, x, y, z = 0, w = 0) => {
    if (isTransitioning || !grid) return 0;
    
    let neighbors = 0;
    
    try {
      if (dimensions === 1) {
        const prev = (x - 1 + gridSize) % gridSize;
        const next = (x + 1) % gridSize;
        if (grid[prev]) neighbors++;
        if (grid[next]) neighbors++;
      } 
      else if (dimensions === 2) {
        const directions = [
          [0, 1], [1, 0], [0, -1], [-1, 0]
        ];
        
        for (const [dx, dy] of directions) {
          const newX = (x + dx + gridSize) % gridSize;
          const newY = (y + dy + gridSize) % gridSize;
          if (grid[newX] && grid[newX][newY]) neighbors++;
        }
      }
      else if (dimensions === 3) {
        const directions = [
          [0, 0, 1], [0, 1, 0], [1, 0, 0],
          [0, 0, -1], [0, -1, 0], [-1, 0, 0]
        ];
        
        for (const [dx, dy, dz] of directions) {
          const newX = (x + dx + gridSize) % gridSize;
          const newY = (y + dy + gridSize) % gridSize;
          const newZ = (z + dz + gridSize) % gridSize;
          if (grid[newX] && grid[newX][newY] && grid[newX][newY][newZ]) neighbors++;
        }
      }
      else if (dimensions === 4) {
        const directions = [
          [0, 0, 0, 1], [0, 0, 1, 0], [0, 1, 0, 0], [1, 0, 0, 0],
          [0, 0, 0, -1], [0, 0, -1, 0], [0, -1, 0, 0], [-1, 0, 0, 0]
        ];
        
        for (const [dx, dy, dz, dw] of directions) {
          const newX = (x + dx + gridSize) % gridSize;
          const newY = (y + dy + gridSize) % gridSize;
          const newZ = (z + dz + gridSize) % gridSize;
          const newW = (w + dw + gridSize) % gridSize;
          if (grid[newX] && grid[newX][newY] && grid[newX][newY][newZ] && grid[newX][newY][newZ][newW]) neighbors++;
        }
      }
      return neighbors;
    } catch (e) {
      console.error("Error counting Von Neumann neighbors:", e);
      return 0;
    }
  };
  
  const applyRules = (cell, neighbors, vonNeumannNeighbors = 0) => {
    const { birth, survival } = getScaledRules();
    
    switch (rule) {
      case "conway": 
      case "fredkin": 
      case "seeds": 
      case "daynight":
      case "custom":
        if (cell) {
          return survival.includes(neighbors);
        } else {
          return birth.includes(neighbors);
        }
        
      case "brain": 
        if (cell === 2) return 0;
        if (cell === 1) return 2;
        return neighbors === 2 ? 1 : 0;
        
      case "vonneumann":
        const selfValue = cell ? 1 : 0;
        if (dimensions === 1) {
          return (vonNeumannNeighbors + selfValue) >= 2;
        } else if (dimensions === 2) {
          return (vonNeumannNeighbors + selfValue) >= 4;
        } else if (dimensions === 3) {
          return (vonNeumannNeighbors + selfValue) >= 5;
        } else if (dimensions === 4) {
          return (vonNeumannNeighbors + selfValue) >= 7;
        }
        return cell;
      default:
        return cell;
    }
  };
  
  const updateGrid = () => {
    if (isTransitioning || !validateGrid()) return;
    
    let newGrid;
    
    if (dimensions === 1) {
      newGrid = Array(gridSize).fill().map((_, x) => {
        const neighbors = countNeighbors(grid, x);
        const vonNeumannNeighbors = countVonNeumannNeighbors(grid, x);
        return applyRules(grid[x], neighbors, vonNeumannNeighbors);
      });
    }
    else if (dimensions === 2) {
      newGrid = Array(gridSize).fill().map((_, x) => 
        Array(gridSize).fill().map((_, y) => {
          const neighbors = countNeighbors(grid, x, y);
          const vonNeumannNeighbors = countVonNeumannNeighbors(grid, x, y);
          return applyRules(grid[x][y], neighbors, vonNeumannNeighbors);
        })
      );
    }
    else if (dimensions === 3) {
      newGrid = Array(gridSize).fill().map((_, x) => 
        Array(gridSize).fill().map((_, y) => 
          Array(gridSize).fill().map((_, z) => {
            const neighbors = countNeighbors(grid, x, y, z);
            const vonNeumannNeighbors = countVonNeumannNeighbors(grid, x, y, z);
            return applyRules(grid[x][y][z], neighbors, vonNeumannNeighbors);
          })
        )
      );
    }
    else if (dimensions === 4) {
      newGrid = Array(gridSize).fill().map((_, x) => 
        Array(gridSize).fill().map((_, y) => 
          Array(gridSize).fill().map((_, z) => 
            Array(gridSize).fill().map((_, w) => {
              const neighbors = countNeighbors(grid, x, y, z, w);
              const vonNeumannNeighbors = countVonNeumannNeighbors(grid, x, y, z, w);
              return applyRules(grid[x][y][z][w], neighbors, vonNeumannNeighbors);
            })
          )
        )
      );
    }
    
    setGrid(newGrid);
  };
  
  const updateHarmonicRatio = (axis, property, value) => {
    setHarmonicRatios(prev => ({
      ...prev,
      [axis]: {
        ...prev[axis],
        [property]: value
      }
    }));
  };
  
  const renderHarmonicControls = (axis) => {
    const isCompact = dimensions === 4;
    
    return (
      <div className={isCompact ? "" : "border rounded"} style={{ 
        padding: isCompact ? '2px 0 2px 0' : '8px 0 8px 0',
        margin: 0,
        marginBottom: isCompact ? '4px' : '8px'
      }}>
        <div className="text-sm" style={{ 
          marginLeft: 0, 
          paddingLeft: 0,
          marginBottom: isCompact ? '2px' : '4px',
          fontWeight: 'normal'
        }}>{axis.toUpperCase()}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0, padding: 0 }}>
          <input
            type="number"
            min="1"
            max="20"
            value={harmonicRatios[axis].numerator}
            onChange={(e) => updateHarmonicRatio(axis, 'numerator', parseInt(e.target.value) || 1)}
            className="border rounded text-sm"
            style={{ 
              appearance: "textfield", 
              padding: isCompact ? '2px 0 2px 2px' : '4px 0 4px 4px', 
              margin: 0, 
              width: '40%', 
              fontFamily: 'Georgia, serif',
              height: isCompact ? '28px' : 'auto'
            }}
          />
          <span style={{ margin: isCompact ? '0 4px' : '0 8px', fontSize: isCompact ? '1em' : '1.2em', fontWeight: 'bold' }}>/</span>
          <input
            type="number"
            min="1"
            max="20"
            value={harmonicRatios[axis].denominator}
            onChange={(e) => updateHarmonicRatio(axis, 'denominator', parseInt(e.target.value) || 1)}
            className="border rounded text-sm"
            style={{ 
              appearance: "textfield", 
              padding: isCompact ? '2px 0 2px 2px' : '4px 0 4px 4px', 
              margin: 0, 
              width: '40%', 
              fontFamily: 'Georgia, serif',
              height: isCompact ? '28px' : 'auto'
            }}
          />
        </div>
      </div>
    );
  };
  
  const getHarmonicColor = (x, y, z = 0, w = 0) => {
    const xRatio = calculateRatio(
      harmonicRatios.x.numerator, 
      harmonicRatios.x.denominator, 
      x
    );
    
    const yRatio = dimensions >= 2 ? calculateRatio(
      harmonicRatios.y.numerator, 
      harmonicRatios.y.denominator, 
      y
    ) : 1;
    
    const zRatio = dimensions >= 3 ? calculateRatio(
      harmonicRatios.z.numerator, 
      harmonicRatios.z.denominator, 
      z
    ) : 1;
    
    const wRatio = dimensions >= 4 ? calculateRatio(
      harmonicRatios.w.numerator, 
      harmonicRatios.w.denominator, 
      w
    ) : 1;
    
    const hue = (xRatio * 360) % 360;
    const saturation = Math.min(yRatio * 100, 100);
    const lightness = Math.min((zRatio * wRatio * 70) + 20, 90);
    
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  };
  
  const validateGrid = () => {
    if (isTransitioning) return false;
    
    if (!grid || grid.length === 0) return false;
    
    if (dimensions === 1) {
      return Array.isArray(grid);
    } else if (dimensions === 2) {
      return Array.isArray(grid) && Array.isArray(grid[0]);
    } else if (dimensions === 3) {
      return Array.isArray(grid) && Array.isArray(grid[0]) && Array.isArray(grid[0][0]);
    } else if (dimensions === 4) {
      return Array.isArray(grid) && Array.isArray(grid[0]) && 
             Array.isArray(grid[0][0]) && Array.isArray(grid[0][0][0]);
    }
    
    return false;
  };
  
  const drawGrid = () => {
    if (isTransitioning || !validateGrid()) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (dimensions === 1 || dimensions === 2) {
      drawColorGrid(ctx, canvas.width, canvas.height);
    } else if (dimensions === 3 || dimensions === 4) {
      drawCubicGrid(ctx, canvas.width, canvas.height);
    }
  };
  
  const drawColorGrid = (ctx, width, height) => {
    const cellSize = width / gridSize;
    
    if (dimensions === 1) {
      grid.forEach((cell, x) => {
        if (cell) {
          ctx.fillStyle = getHarmonicColor(x, 0);
          ctx.fillRect(x * cellSize, 0, cellSize, height);
        }
      });
    } 
    else if (dimensions === 2) {
      grid.forEach((row, x) => {
        row.forEach((cell, y) => {
          if (cell) {
            ctx.fillStyle = getHarmonicColor(x, y);
            ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
          }
        });
      });
    }
  };
  
  const drawCubicGrid = (ctx, width, height) => {
    if (isTransitioning || !validateGrid()) return;
    
    try {
      ctx.clearRect(0, 0, width, height);
      
      if (dimensions === 1) {
        const margin = 50;
        const size = width - 2 * margin;
        const cellSize = size / gridSize;
        const offsetX = margin;
        const offsetY = height / 2;
        
        grid.forEach((cell, x) => {
          if (cell) {
            ctx.fillStyle = "#333";
            ctx.fillRect(offsetX + x * cellSize, offsetY, cellSize, 20);
          }
        });
      } 
      else if (dimensions === 2) {
        const margin = 50;
        const size = Math.min(width, height) - 2 * margin;
        const cellSize = size / gridSize;
        const offsetX = (width - size) / 2;
        const offsetY = (height - size) / 2;
        
        grid.forEach((row, x) => {
          row.forEach((cell, y) => {
            if (cell) {
              ctx.fillStyle = "#333";
              ctx.fillRect(offsetX + x * cellSize, offsetY + y * cellSize, cellSize, cellSize);
            } else {
              ctx.strokeStyle = "#eee";
              ctx.strokeRect(offsetX + x * cellSize, offsetY + y * cellSize, cellSize, cellSize);
            }
          });
        });
      }
      else if (dimensions === 3 || dimensions === 4) {
        const SCALE_FACTOR = 25 - gridSize;
        const cubeSize = SCALE_FACTOR;
        
        const ISO_X = 0.7;
        const ISO_Y = 0.4;
        
        const startX = width / 2;
        const startY = height / 6;
        
        const wSlice = dimensions === 4 ? Math.floor(gridSize / 2) : 0;
        
        let cellsToDraw = [];
        
        for (let z = 0; z < gridSize; z++) {
          for (let x = 0; x < gridSize; x++) {
            for (let y = 0; y < gridSize; y++) {
              if (dimensions === 3) {
                if (grid[x] && grid[x][y] && grid[x][y][z]) {
                  cellsToDraw.push({
                    x, y, z, 
                    w: 0,
                    color: "#AAA"
                  });
                }
              } 
              else if (dimensions === 4) {
                for (let w = 0; w < gridSize; w++) {
                  if (grid[x] && grid[x][y] && grid[x][y][z] && grid[x][y][z][w]) {
                    const color = getHarmonicColor(x, y, z, w);
                    
                    cellsToDraw.push({
                      x, y, z, w,
                      color: color
                    });
                  }
                }
              }
            }
          }
        }
        
        cellsToDraw.sort((a, b) => {
          if (b.z !== a.z) return b.z - a.z;
          return (b.x + b.y) - (a.x + a.y);
        });
        
        cellsToDraw.forEach(cell => {
          const posX = startX + (cell.x - cell.z) * cubeSize * ISO_X;
          const posY = startY + (cell.x + cell.z) * cubeSize * ISO_Y + cell.y * cubeSize * 0.8;
          
          let topFaceColor, leftFaceColor, rightFaceColor;
          
          if (dimensions === 4) {
            const baseColor = cell.color;
            
            const hslMatch = baseColor.match(/hsl\((\d+\.?\d*),\s*(\d+\.?\d*)%,\s*(\d+\.?\d*)%\)/);
            if (hslMatch) {
              const h = parseFloat(hslMatch[1]);
              const s = parseFloat(hslMatch[2]);
              const l = parseFloat(hslMatch[3]);
              
              topFaceColor = `hsl(${h}, ${s}%, ${Math.min(l + 10, 90)}%)`;
              leftFaceColor = `hsl(${h}, ${s}%, ${Math.max(l - 10, 20)}%)`;
              rightFaceColor = `hsl(${h}, ${s}%, ${Math.max(l - 20, 15)}%)`;
            } else {
              topFaceColor = baseColor;
              leftFaceColor = baseColor;
              rightFaceColor = baseColor;
            }
          } else {
            topFaceColor = "#AAA";
            leftFaceColor = "#888";
            rightFaceColor = "#666";
          }
          
          ctx.beginPath();
          ctx.moveTo(posX, posY);
          ctx.lineTo(posX + cubeSize * ISO_X, posY - cubeSize * ISO_Y);
          ctx.lineTo(posX, posY - cubeSize * ISO_Y * 2);
          ctx.lineTo(posX - cubeSize * ISO_X, posY - cubeSize * ISO_Y);
          ctx.closePath();
          ctx.fillStyle = topFaceColor;
          ctx.fill();
          ctx.strokeStyle = "#333";
          ctx.stroke();
          
          ctx.beginPath();
          ctx.moveTo(posX, posY);
          ctx.lineTo(posX - cubeSize * ISO_X, posY - cubeSize * ISO_Y);
          ctx.lineTo(posX - cubeSize * ISO_X, posY + cubeSize * 0.8 - cubeSize * ISO_Y);
          ctx.lineTo(posX, posY + cubeSize * 0.8);
          ctx.closePath();
          ctx.fillStyle = leftFaceColor;
          ctx.fill();
          ctx.strokeStyle = "#333";
          ctx.stroke();
          
          ctx.beginPath();
          ctx.moveTo(posX, posY);
          ctx.lineTo(posX + cubeSize * ISO_X, posY - cubeSize * ISO_Y);
          ctx.lineTo(posX + cubeSize * ISO_X, posY + cubeSize * 0.8 - cubeSize * ISO_Y);
          ctx.lineTo(posX, posY + cubeSize * 0.8);
          ctx.closePath();
          ctx.fillStyle = rightFaceColor;
          ctx.fill();
          ctx.strokeStyle = "#333";
          ctx.stroke();
        });
        
        if (dimensions === 4) {
          const legendX = 10;
          const legendY = height - 80;
          
          const gradientWidth = 200;
          const gradientHeight = 15;
          const gradient = ctx.createLinearGradient(legendX, legendY + 10, legendX + gradientWidth, legendY + 10);
          
          gradient.addColorStop(0, "hsl(0, 80%, 60%)");
          gradient.addColorStop(0.2, "hsl(72, 80%, 60%)");
          gradient.addColorStop(0.4, "hsl(144, 80%, 60%)");
          gradient.addColorStop(0.6, "hsl(216, 80%, 60%)");
          gradient.addColorStop(0.8, "hsl(288, 80%, 60%)");
          gradient.addColorStop(1, "hsl(360, 80%, 60%)");
          
          ctx.fillStyle = gradient;
          ctx.fillRect(legendX, legendY + 15, gradientWidth, gradientHeight);
          
          ctx.fillStyle = "#FFF";
          ctx.fillText("w = 0", legendX, legendY + 45);
          ctx.fillText(`w = ${gridSize - 1}`, legendX + gradientWidth - 30, legendY + 45);
        }
      }
    } catch (e) {
      console.error("Error in drawCubicGrid:", e);
    }
  };
  
  const toggleNeighborRequirement = (neighbors, set, setFunction) => {
    const newSet = [...set];
    const index = newSet.indexOf(neighbors);
    
    if (index === -1) {
      newSet.push(neighbors);
      newSet.sort((a, b) => a - b);
    } else {
      newSet.splice(index, 1);
    }
    
    setFunction(newSet);
    
    if (rule !== "custom") {
      setRule("custom");
    }
  };
  
  const formatRuleString = (birthSet, survivalSet) => {
    const birthString = birthSet.length > 0 ? birthSet.join(',') : '';
    const survivalString = survivalSet.length > 0 ? survivalSet.join(',') : '';
    
    return `B${birthString}/S${survivalString}`;
  };
  
  const getCurrentRuleDisplay = () => {
    let currentRule;
    if (rule === "custom") {
      currentRule = {
        birth: customBirth,
        survival: customSurvival
      };
    } else if (ruleSets[rule]) {
      currentRule = ruleSets[rule];
    } else {
      return "Unknown Rule";
    }
    
    if (rule === "brain") {
      return "Brian's Brain";
    }
    
    if (rule === "vonneumann") {
      return "von Neumann";
    }
    
    const scaledRule = getScaledRules();
    
    return formatRuleString(scaledRule.birth, scaledRule.survival);
  };
  
useEffect(() => {
  document.title = "Cellular Automata in Harmonic Space";
  
  const favicon = document.querySelector("link[rel='icon']") || document.createElement('link');
  favicon.type = 'image/gif';
  favicon.rel = 'icon';
  favicon.href = '/ribosommmme.gif';
  
  const existingFavicons = document.querySelectorAll('link[rel="icon"]');
  existingFavicons.forEach(el => {
    if (el !== favicon) {
      el.parentNode.removeChild(el);
    }
  });
  
  document.head.appendChild(favicon);
}, []);

  const renderNeighborCounterButtons = (type) => {
    const maxNeighbors = dimensions === 1 ? 2 : 
                        dimensions === 2 ? 8 : 
                        dimensions === 3 ? 26 : 
                        dimensions === 4 ? 80 : 8;
    
    const currentSet = type === 'birth' ? customBirth : customSurvival;
    
    const toggleFunction = (n) => {
      if (type === 'birth') {
        toggleNeighborRequirement(n, customBirth, setCustomBirth);
      } else {
        toggleNeighborRequirement(n, customSurvival, setCustomSurvival);
      }
    };
    
    let buttonSize, buttonGap, buttonsPerRow;
    
    if (dimensions <= 2) {
      buttonSize = '2rem';
      buttonGap = '0.25rem';
      buttonsPerRow = maxNeighbors + 1;
    } else if (dimensions === 3) {
      buttonSize = '1.25rem';
      buttonGap = '0.125rem';
      buttonsPerRow = 13;
    } else {
      buttonSize = '0.75rem';
      buttonGap = '0.0625rem';
      buttonsPerRow = 20;
    }
    
    const rows = [];
    for (let i = 0; i <= maxNeighbors; i += buttonsPerRow) {
      const rowButtons = [];
      for (let j = 0; j < buttonsPerRow && i + j <= maxNeighbors; j++) {
        const neighborCount = i + j;
        rowButtons.push(
          <button
            key={neighborCount}
            onClick={() => toggleFunction(neighborCount)}
            style={{
              width: buttonSize, 
              height: buttonSize,
              fontSize: dimensions === 3 ? '0.6rem' : dimensions === 4 ? '0.5rem' : '0.8rem',
              padding: 0,
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: dimensions >= 3 ? '1px solid #e5e7eb' : '1px solid #e5e7eb',
              borderRadius: dimensions >= 3 ? '0.2rem' : '0.375rem',
              backgroundColor: currentSet.includes(neighborCount) ? '#d1d5db' : '#ffffff',
              color: '#1f2937'
            }}
            title={`${neighborCount} neighbors`}
          >
            {neighborCount}
          </button>
        );
      }
      
      rows.push(
        <div 
          key={`row-${i}`} 
          style={{ 
            display: 'flex', 
            gap: buttonGap, 
            marginBottom: buttonGap
          }}
        >
          {rowButtons}
        </div>
      );
    }
    
    return (
      <div style={{ marginBottom: dimensions >= 3 ? '0.5rem' : '1rem' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '0.25rem'
        }}>
          <label className="text-sm" style={{ 
            marginBottom: '0.25rem',
            fontSize: 'inherit',
            fontWeight: 'normal'
          }}>
            {type === 'birth' ? 'Birth' : 'Survival'} ({type === 'birth' ? 'B' : 'S'}):
          </label>
        </div>
        
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          gap: buttonGap,
          border: '1px solid transparent',
          borderRadius: '0.25rem',
          padding: dimensions >= 3 ? '0.125rem' : '0.25rem',
          backgroundColor: 'transparent' 
        }}>
          {rows}
        </div>
      </div>
    );
  };

  return (
    <div style={{ 
      position: 'absolute',
      left: 0,
      top: 0,
      padding: 0,
      margin: 0,
      width: '100%',
      boxSizing: 'border-box',
      maxHeight: '100vh',
      overflowY: 'hidden',
      fontFamily: 'Georgia, serif'
    }}>
      <div style={{ marginLeft: '120px', paddingLeft: 0, marginTop: '120px', marginBottom: '1rem', textAlign: 'left', paddingTop: 0 }}>
        <div style={{ display: 'flex', marginBottom: '0.5rem', marginLeft: 0, paddingLeft: 0, marginTop: 0, paddingTop: 0 }}>
          <button 
            onClick={() => setRunning(!running)} 
            className="bg-blue-500 text-white rounded-full mr-2"
            style={{ padding: '8px', margin: 0 }}
          >
            {running ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button 
            onClick={initializeGrid} 
            className="bg-green-500 text-white rounded-full mr-2"
            style={{ padding: '8px', margin: 0 }}
          >
            <RefreshCw size={20} />
          </button>
          <button 
            onClick={() => {
              updateGrid();
              setGeneration(prev => prev + 1);
            }} 
            className="bg-purple-500 text-white rounded-full mr-4"
            style={{ padding: '8px', margin: 0 }}
            title="Step to next generation"
          >
            <ChevronRight size={20} />
          </button>
          <span className="text-sm" style={{ textAlign: 'left' }}>Generation: {generation}</span>
        </div>
        
        <div style={{ 
          marginBottom: '1rem', 
          textAlign: 'left', 
          marginLeft: 0, 
          paddingLeft: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label className="text-sm mr-2" style={{ textAlign: 'left' }}>Rules:</label>
            <select 
              value={rule} 
              onChange={(e) => setRule(e.target.value)}
              className="border rounded"
              style={{ padding: '4px', margin: 0, textAlign: 'left', fontFamily: 'Georgia, serif' }}
            >
              {Object.keys(ruleSets).map(key => (
                <option key={key} value={key}>{ruleSets[key].name}</option>
              ))}
            </select>
          </div>
          
          <div className="text-sm bg-gray-100 p-2 rounded">
            <div className="font-semibold">Current Rule: {getCurrentRuleDisplay()}</div>
          </div>
          
          <div style={{ 
            marginTop: '0.5rem', 
            padding: '0.5rem 0.5rem 0.25rem 0',
            backgroundColor: 'transparent',
            borderRadius: '4px',
            border: '1px solid transparent',
            maxWidth: '300px',
            width: '100%',
            minHeight: 'auto',
            position: 'relative',
          }}>
            <div className="text-sm font-semibold mb-2">
              {rule === 'custom' ? 'Custom Rule Settings' : 'Edit Rule'}
            </div>
            
            {renderNeighborCounterButtons('birth')}
            {renderNeighborCounterButtons('survival')}
          </div>
          
          <div style={{ marginTop: '0.5rem' }}>
            <label className="text-sm block mb-1" style={{ textAlign: 'left' }}>Arpeggiation:</label>
            <select 
              value={arpeggiate} 
              onChange={(e) => setArpeggiate(e.target.value)}
              className="border rounded"
              style={{ padding: '4px', margin: 0, textAlign: 'left', width: '150px', fontFamily: 'Georgia, serif' }}
            >
              <option value="OFF">Off</option>
              <option value="UP">Up</option>
              <option value="DOWN">Down</option>
              <option value="UP_DOWN">Up/Down</option>
              <option value="RANDOM">Random</option>
            </select>
          </div>
        </div>
      </div>
      
      <div style={{ 
        display: 'flex', 
        flexDirection: 'row', 
        width: '100%',
        position: 'relative'
      }}>
        <div style={{ 
          marginLeft: '120px', 
          paddingLeft: 0, 
          marginBottom: '1rem', 
          textAlign: 'left',
          width: '300px',
          flexShrink: 0,
          marginRight: '40px',
          position: 'relative',
          zIndex: 1
        }}>
          <div style={{ marginBottom: '0.5rem', textAlign: 'left', marginLeft: 0, paddingLeft: 0 }}>
            <label className="text-sm block" style={{ textAlign: 'left', marginLeft: 0, paddingLeft: 0 }}>Dimensions ({dimensions}D)</label>
            <input 
              type="range" 
              min="1" 
              max="4" 
              value={dimensions} 
              onChange={(e) => setDimensions(parseInt(e.target.value))}
              style={{ width: '100%', maxWidth: '300px', marginLeft: 0, paddingLeft: 0, fontFamily: 'Georgia, serif' }}
            />
          </div>
          
          <div style={{ marginBottom: '0.5rem', textAlign: 'left', marginLeft: 0, paddingLeft: 0 }}>
            <label className="text-sm block" style={{ textAlign: 'left', marginLeft: 0, paddingLeft: 0 }}>Grid Size ({gridSize})</label>
            <input 
              type="range" 
              min="4" 
              max="16" 
              step="1"
              value={gridSize} 
              onChange={(e) => setGridSize(parseInt(e.target.value))}
              style={{ width: '100%', maxWidth: '300px', marginLeft: 0, paddingLeft: 0, fontFamily: 'Georgia, serif' }}
            />
          </div>
        </div>

        <div style={{ 
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          top: '-380px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 0
        }}>
          <canvas 
            ref={canvasRef}
            width={canvasSize.width}
            height={canvasSize.height}
            className="border"
            style={{
              maxWidth: '100%',
              height: 'auto'
            }}
          />
        </div>
        
        <div style={{ 
          position: 'absolute',
          right: '120px',
          top: dimensions === 4 ? '-450px' : '-380px',
          width: '300px',
          textAlign: 'left',
          zIndex: 1
        }}>
          <div style={{ marginBottom: '0.5rem', textAlign: 'left' }}>
            <label className="text-sm block" style={{ textAlign: 'left' }}>Base Frequency (Hz)</label>
            <input 
              type="number"
              min="20"
              max="1000"
              value={baseFrequency} 
              onChange={(e) => setBaseFrequency(parseInt(e.target.value) || 220)}
              className="border rounded"
              style={{ 
                width: '150px', 
                padding: '4px', 
                margin: 0, 
                textAlign: 'left', 
                fontFamily: 'Georgia, serif'
              }}
            />
          </div>
          
          <div style={{ marginBottom: '0.5rem', textAlign: 'left' }}>
            <label className="text-sm block" style={{ textAlign: 'left' }}>Generation Time ({generationTime} ms)</label>
            <input 
              type="range" 
              min="100" 
              max="8000" 
              step="100"
              value={generationTime} 
              onChange={(e) => setGenerationTime(parseInt(e.target.value))}
              style={{ width: '100%', maxWidth: '300px', marginLeft: 0, paddingLeft: 0, fontFamily: 'Georgia, serif' }}
            />
          </div>
          
          <div style={{ 
            marginBottom: dimensions === 4 ? '0.5rem' : '1rem', 
            maxWidth: '300px', 
            textAlign: 'left'
          }}>
            <div style={{ marginBottom: dimensions === 4 ? '0.5rem' : '1rem' }}>
              <div className="text-sm" style={{ marginBottom: '0.5rem' }}>Harmonics:</div>
              {renderHarmonicControls('x')}
              {dimensions >= 2 && renderHarmonicControls('y')}
              {dimensions >= 3 && renderHarmonicControls('z')}
              {dimensions >= 4 && renderHarmonicControls('w')}
              
              {dimensions === 4 && (
                <div style={{ marginTop: '1rem' }}>
                  <div className="text-sm" style={{ marginBottom: '0.5rem' }}>W Dimension Color Mapping:</div>
                  <div style={{ 
                    width: '100%', 
                    height: '15px', 
                    background: 'linear-gradient(to right, hsl(0,80%,60%), hsl(72,80%,60%), hsl(144,80%,60%), hsl(216,80%,60%), hsl(288,80%,60%), hsl(360,80%,60%))',
                    borderRadius: '3px',
                    marginBottom: '4px'
                  }}></div>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    fontSize: '0.75rem'
                  }}>
                    <span>w = 0</span>
                    <span>w = {gridSize-1}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}