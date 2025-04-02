import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff } from 'lucide-react';
import Millis from '@millisai/web-sdk';
import axios from 'axios';

interface WebSocketCallProps {
  agentId: string;
  sessionId: string;
  onComplete: () => void;
}

export function WebSocketCall({ agentId, sessionId, onComplete }: WebSocketCallProps) {
  const [isCallActive, setIsCallActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState<'good' | 'poor' | 'none'>('none');
  const [callDuration, setCallDuration] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  
  const msClient = useRef<any>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const durationInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      stopCall();
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
      }
    };
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleMicrophoneClick = async () => {
    if (isCallActive) {
      stopCall();
    } else {
      await startCall();
    }
  };

  const startCall = async () => {
    setIsConnecting(true);

    try {
      // Request microphone access first
      mediaStream.current = await navigator.mediaDevices.getUserMedia({
        audio: true
      });

      // Initialize Millis client
      msClient.current = Millis.createClient({
        publicKey: import.meta.env.VITE_MILLIS_PUBLIC_KEY,
        audio: {
          stream: mediaStream.current
        }
      });

      // Set up event listeners
      msClient.current.on('onopen', () => {
        console.log('WebSocket connection opened');
        setConnectionQuality('good');
        setIsAnimating(true);
      });

      msClient.current.on('onready', async (payload: { session_id: string }) => {
        console.log('Client is ready, session ID:', payload.session_id);
        
        try {
          await axios.post(`${import.meta.env.VITE_BACKEND_URL}/api/sessions/${sessionId}/millis`, {
            millisSessionId: payload.session_id
          });
        } catch (error) {
          console.error('Failed to update Millis session ID:', error);
        }

        setIsCallActive(true);
        setIsConnecting(false);

        durationInterval.current = setInterval(() => {
          setCallDuration(prev => prev + 1);
        }, 1000);
      });

      msClient.current.on('onsessionended', () => {
        stopCall();
      });

      msClient.current.on('onclose', () => {
        stopCall();
      });

      msClient.current.on('onerror', (error: any) => {
        console.error('WebSocket error:', error);
        setConnectionQuality('poor');
      });

      // Start the conversation
      await msClient.current.start({
        agent: {
          agent_id: agentId
        }
      });

    } catch (error) {
      console.error('Error starting call:', error);
      setIsConnecting(false);
      stopCall();
    }
  };

  const stopCall = () => {
    if (msClient.current) {
      msClient.current.stop();
      msClient.current = null;
      
      // Update call status to completed
      axios.post(`${import.meta.env.VITE_BACKEND_URL}/api/sessions/${sessionId}/call-complete`)
        .catch(error => console.error('Error updating call status:', error));
    }

    if (mediaStream.current) {
      mediaStream.current.getTracks().forEach(track => track.stop());
      mediaStream.current = null;
    }

    setIsCallActive(false);
    setConnectionQuality('none');
    setCallDuration(0);
    setIsAnimating(false);
    setIsConnecting(false);
  };

  const toggleMute = () => {
    if (mediaStream.current) {
      const audioTrack = mediaStream.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isMuted;
        setIsMuted(!isMuted);
      }
    }
  };

  return (
    <div className="flex flex-col items-center justify-center">
      {/* Call status bar - only visible when call is active */}
      {isCallActive && (
        <div className="flex justify-between items-center text-sm text-primary/60 font-medium w-full mb-4">
          <div className="flex items-center space-x-2">
            <span className="font-mono">{formatDuration(callDuration)}</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`
              w-2 h-2 rounded-full
              ${connectionQuality === 'good' ? 'bg-green-500 animate-pulse' : 'bg-red-500 animate-[pulse_0.5s_ease-in-out_infinite]'}
            `} />
            <span className={connectionQuality === 'good' ? 'text-green-600' : 'text-red-600'}>
              {connectionQuality === 'good' ? 'Tilkoblet' : 'Ikke tilkoblet'}
            </span>
          </div>
        </div>
      )}

      {/* Call controls */}
      <div className="flex flex-col items-center space-y-6">
        {isConnecting ? (
          <div className="loading-dots">
            <div></div>
            <div></div>
            <div></div>
          </div>
        ) : (
          <button
            onClick={handleMicrophoneClick}
            className={`relative w-48 h-48 rounded-full overflow-hidden metallic-circle hover:scale-105 transition-transform cursor-pointer ${isAnimating ? 'animate' : ''}`}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <Mic size={48} className="text-white" />
            </div>
          </button>
        )}

        {/* Additional controls - only visible when call is active */}
        {isCallActive && (
          <div className="flex items-center space-x-4">
            <button
              onClick={toggleMute}
              className={`
                p-3 rounded-full transition-all duration-300
                ${isMuted ? 
                  'bg-red-500 text-white hover:bg-red-600' : 
                  'bg-gray-100 text-gray-700 hover:bg-gray-200'}
              `}
            >
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
          </div>
        )}

        {/* Complete button - always visible */}
        <button 
          onClick={onComplete}
          className="bg-accent text-white py-3 px-8 rounded-full font-medium text-lg hover:bg-accent/90 transition-colors shadow-lg"
        >
          Jeg er klar med spørsmål! Ta meg til steg 2
        </button>
      </div>
    </div>
  );
}