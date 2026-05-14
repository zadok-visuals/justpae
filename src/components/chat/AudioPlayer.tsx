import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Play, Pause, Gauge } from 'lucide-react';

interface AudioPlayerProps {
  src: string;
  timestamp?: string;
  isRead?: boolean;
  isCurrentUser?: boolean;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ 
  src, 
  timestamp,
  isRead,
  isCurrentUser
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);

  const TOTAL_BARS = 36;

  const waveformBars = useMemo(() => {
    return Array.from({ length: TOTAL_BARS }, (_, i) => {
      const seed = Math.sin(i + 12) * 8765.43;
      return Math.floor((seed - Math.floor(seed)) * 18) + 6;
    });
  }, []);

  const formatTime = (time: number) => {
    if (isNaN(time) || !isFinite(time) || time <= 0) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    setIsLoaded(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    // Forces browser to fetch data immediately to read total minutes
    audio.load();

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
        setIsLoaded(true);
      }
    };

    const handleDurationChange = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
        setIsLoaded(true);
      }
    };

    const handleTimeUpdate = () => {
      if (!isScrubbing) {
        setCurrentTime(audio.currentTime);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    // Fallback check if browser already has it cached
    if (audio.readyState >= 1 && audio.duration) {
      setDuration(audio.duration);
      setIsLoaded(true);
    }

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [src]);

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;
    
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().catch((err) => console.log("Audio play error:", err));
      setIsPlaying(true);
    }
  };

  const cyclePlaybackRate = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const rates = [1, 1.5, 2];
    const nextRate = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    audio.playbackRate = nextRate;
    setPlaybackRate(nextRate);
  };

  const updateTimeFromPosition = (clientX: number) => {
    const audio = audioRef.current;
    // Uses a default fallback duration if metadata is loading so user can still drag the slider
    const targetDuration = duration > 0 ? duration : 100;
    if (!audio || !waveformRef.current) return;

    const rect = waveformRef.current.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    
    const newTime = percentage * targetDuration;
    setCurrentTime(newTime);
    
    if (duration > 0) {
      audio.currentTime = newTime;
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsScrubbing(true);
    updateTimeFromPosition(e.clientX);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    setIsScrubbing(true);
    if (e.touches.length > 0) {
      updateTimeFromPosition(e.touches[0].clientX);
    }
  };

  useEffect(() => {
    if (!isScrubbing) return;

    const handleMouseMove = (e: MouseEvent) => updateTimeFromPosition(e.clientX);
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        updateTimeFromPosition(e.touches[0].clientX);
      }
    };
    const handleDragEnd = () => setIsScrubbing(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleDragEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleDragEnd);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleDragEnd);
    };
  }, [isScrubbing, duration]);

  // Fallback progress to allow visual slider movements even during loading states
  const targetDuration = duration > 0 ? duration : 100;
  const progressPercent = (currentTime / targetDuration) * 100;

  return (
    <div className="flex items-center gap-3 w-full max-w-[340px] p-3 rounded-2xl border select-none transition-all bg-white border-gray-100 text-gray-900 shadow-sm dark:bg-neutral-900 dark:border-neutral-800 dark:text-white dark:shadow-md">
      <audio ref={audioRef} src={src} preload="auto" crossOrigin="anonymous" />
      
      {/* Play/Pause Button */}
      <button
        onClick={togglePlayPause}
        className="shrink-0 flex items-center justify-center w-10 h-10 rounded-full transition-all focus:outline-none active:scale-95 bg-orange-500 text-white hover:bg-orange-600"
      >
        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current translate-x-[1px]" />}
      </button>

      {/* Main Track System */}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
        
        {/* Interactive Track Area */}
        <div 
          ref={waveformRef}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          className="relative h-8 flex items-center gap-[2px] cursor-pointer group touch-none"
        >
          {/* Gray Background Wave */}
          {waveformBars.map((height, index) => (
            <div
              key={`bg-${index}`}
              style={{ height: `${height}px` }}
              className="w-[3px] rounded-full bg-gray-100 dark:bg-neutral-800"
            />
          ))}

          {/* Filled Orange Progress Track */}
          <div 
            style={{ width: `${progressPercent}%` }}
            className="absolute inset-y-0 left-0 flex items-center gap-[2px] overflow-hidden pointer-events-none"
          >
            {waveformBars.map((height, index) => (
              <div
                key={`active-${index}`}
                style={{ height: `${height}px` }}
                className="w-[3px] shrink-0 rounded-full bg-orange-500"
              />
            ))}
          </div>

          {/* Draggable Slider Dot */}
          <div 
            style={{ left: `${progressPercent}%` }}
            className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-orange-600 border-2 border-white shadow-md dark:border-neutral-900 transition-transform duration-75 pointer-events-none ${
              isScrubbing ? 'scale-125 bg-orange-700' : 'scale-100 group-hover:scale-110'
            }`}
          />
        </div>

        {/* Timestamps Row */}
        <div className="flex items-center justify-between text-[11px] font-medium whitespace-nowrap gap-2 text-gray-500 dark:text-neutral-400">
          <div className="flex items-center gap-1">
            <span>{formatTime(currentTime)}</span>
            <span className="opacity-40">/</span>
            <span>{duration > 0 ? formatTime(duration) : 'Loading...'}</span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {timestamp && <span>{timestamp}</span>}
            {isCurrentUser && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={`w-3.5 h-3.5 ${isRead ? 'text-blue-500' : 'text-neutral-500'}`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 7 17l-5-5" />
                <path d="m22 10-7.5 7.5L13 16" />
              </svg>
            )}
          </div>
        </div>
      </div>

      {/* Playback Speed Controller */}
      <button
        onClick={cyclePlaybackRate}
        className="shrink-0 flex items-center justify-center gap-0.5 px-2 h-7 rounded-xl text-[11px] font-bold border transition-colors bg-gray-50 border-gray-100 hover:bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:border-neutral-700 dark:hover:bg-neutral-700 dark:text-neutral-300"
      >
        <Gauge className="w-3.5 h-3.5 stroke-[2.5]" />
        <span>{playbackRate}x</span>
      </button>
    </div>
  );
};
