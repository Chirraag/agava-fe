import React, { useState, useEffect } from 'react';
import ReactPlayer from 'react-player';
import { Play, Loader2 } from 'lucide-react';

interface HeyGenVideoProps {
  onComplete?: () => void;
}

export function HeyGenVideo({ onComplete }: HeyGenVideoProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);
  
  // This would be replaced with actual HeyGen stream URL
  const videoUrl = "https://example.com/heygen-stream";

  const handleStart = () => {
    setHasStarted(true);
    setIsLoading(false);
  };

  const handleComplete = () => {
    if (onComplete) {
      onComplete();
    }
  };

  if (!hasStarted) {
    return (
      <div className="relative w-full aspect-video bg-gray-100 rounded-xl overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          <button
            onClick={() => setHasStarted(true)}
            className="bg-accent text-white p-4 rounded-full hover:bg-accent/90 transition-colors"
          >
            <Play size={32} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-video bg-gray-100 rounded-xl overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <Loader2 className="w-8 h-8 text-accent animate-spin" />
        </div>
      )}
      <ReactPlayer
        url={videoUrl}
        width="100%"
        height="100%"
        playing={hasStarted}
        onStart={handleStart}
        onEnded={handleComplete}
        controls={true}
      />
    </div>
  );
}