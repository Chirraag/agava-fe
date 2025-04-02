import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, ChevronLeft, ChevronRight,  ChevronUp,  ChevronDown } from 'lucide-react';
import Millis from '@millisai/web-sdk';
import axios from 'axios';

interface InteractiveAvatarProps {
  sessionId: string;
}

export function InteractiveAvatar({ sessionId }: InteractiveAvatarProps) {
  const [isCallActive, setIsCallActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState<'good' | 'poor' | 'none'>('none');
  const [callDuration, setCallDuration] = useState(0);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [analysis, setAnalysis] = useState<any>(null);
  const [secondCallAgentId, setSecondCallAgentId] = useState<string | null>(null);
  const [previousSessionId, setPreviousSessionId] = useState<string | null>(null);
  
  const msClient = useRef<any>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const durationInterval = useRef<NodeJS.Timeout | null>(null);

  const images = [
    '/call2-1.jpg',
    '/call2-2.jpg',
    '/call2-3.jpg',
    '/call2-4.jpg',
    '/call2-5.jpg'
  ];

  useEffect(() => {
    // Create second agent immediately when component mounts
    if (sessionId && !secondCallAgentId) {
      createSecondAgent();
    }

    // Fetch analysis data and agent status
    if (sessionId) {
      fetch(`${import.meta.env.VITE_BACKEND_URL}/api/status/${sessionId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            if (data.analysis) {
              setAnalysis(JSON.parse(data.analysis));
            }
            if (data.secondCallAgentId) {
              setSecondCallAgentId(data.secondCallAgentId);
            }
            // Store the previous Millis session ID
            if (data.millisSessionId) {
              setPreviousSessionId(data.millisSessionId);
            }
          }
        })
        .catch(err => console.error('Error fetching status:', err));
    }

    // Keyboard navigation
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        setCurrentImageIndex(prev => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowDown') {
        setCurrentImageIndex(prev => Math.min(images.length - 1, prev + 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      stopCall();
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
      }
    };
  }, [sessionId]);

  const createSecondAgent = async () => {
    try {
      const response = await axios.post(
        `${import.meta.env.VITE_BACKEND_URL}/api/sessions/${sessionId}/create-second-agent`
      );
      if (response.data.success) {
        setSecondCallAgentId(response.data.agentId);
      }
    } catch (error) {
      console.error('Error creating second agent:', error);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startCall = async () => {
    if (!secondCallAgentId) { 
      console.error('Second agent not created yet');
      return;
    }

    setIsConnecting(true);

    try {
      mediaStream.current = await navigator.mediaDevices.getUserMedia({
        audio: true
      });

      msClient.current = Millis.createClient({
        publicKey: import.meta.env.VITE_MILLIS_PUBLIC_KEY,
        audio: {
          stream: mediaStream.current
        }
      });

      msClient.current.on('onopen', () => {
        console.log('WebSocket connection opened');
        setConnectionQuality('good');
      });

      msClient.current.on('onready', async (payload: { session_id: string }) => {
        console.log('Client is ready, session ID:', payload.session_id);
        
        try {
          await axios.post(`${import.meta.env.VITE_BACKEND_URL}/api/sessions/${sessionId}/millis-second-call`, {
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

      // Start the conversation with the second agent and include session continuation
      await msClient.current.start({
        agent: {
          agent_id: secondCallAgentId
        },
        session_continuation: previousSessionId ? {
          session_id: previousSessionId
        } : undefined
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
      
      // Update second call status to completed
      axios.post(`${import.meta.env.VITE_BACKEND_URL}/api/sessions/${sessionId}/second-call-complete`)
        .catch(error => console.error('Error updating second call status:', error));
    }

    if (mediaStream.current) {
      mediaStream.current.getTracks().forEach(track => track.stop());
      mediaStream.current = null;
    }

    setIsCallActive(false);
    setConnectionQuality('none');
    setCallDuration(0);
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
    <div className="w-full max-w-7xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-5xl font-heading font-bold text-primary mb-4 bg-gradient-to-r from-accent to-accent/70 bg-clip-text text-transparent">
          SI HEI TIL VÅR AI-SELGER SOFIA!
        </h1>
        <h2 className="text-2xl text-primary/80 font-medium">
          Test 100% AI-salg, steg 2
        </h2>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Image Navigation */}
        <div className="hidden lg:flex flex-col justify-start items-center gap-6 pt-8">
          {images.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentImageIndex(index)}
              className={`w-4 h-4 rounded-full transition-all border-2 ${
                currentImageIndex === index 
                  ? 'bg-accent border-accent scale-125' 
                  : 'bg-gray-100 border-gray-300 hover:bg-accent/20 hover:border-accent/50'
              }`}
            />
          ))}
        </div>

        {/* Main Content */}
        <div className="flex-1">
          <div className="relative aspect-[16/9] rounded-2xl overflow-hidden shadow-2xl bg-gradient-to-br from-gray-50 to-gray-100">
            {images.map((src, index) => (
              <img
                key={src}
                src={src}
                alt={`Presentation slide ${index + 1}`}
                className={`absolute inset-0 w-full h-full object-contain transition-all duration-500 p-4 ${
                  currentImageIndex === index 
                    ? 'opacity-100 scale-100' 
                    : 'opacity-0 scale-95'
                }`}
              />
            ))}

            {/* Navigation Arrows */}
            <button
              onClick={() => setCurrentImageIndex(prev => Math.max(0, prev - 1))}
              className="absolute left-1/2 top-4 -translate-x-1/2 bg-white/90 text-accent p-2 rounded-full hover:bg-white shadow-lg transition-all hover:scale-110 disabled:opacity-50 disabled:hover:scale-100"
              disabled={currentImageIndex === 0}
            >
              <ChevronUp size={24} />
            </button>
            <button
              onClick={() => setCurrentImageIndex(prev => Math.min(images.length - 1, prev + 1))}
              className="absolute left-1/2 bottom-4 -translate-x-1/2 bg-white/90 text-accent p-2 rounded-full hover:bg-white shadow-lg transition-all hover:scale-110 disabled:opacity-50 disabled:hover:scale-100"
              disabled={currentImageIndex === images.length - 1}
            >
              <ChevronDown size={24} />
            </button>
            
            {/* Mobile Navigation Dots */}
            <div className="lg:hidden absolute bottom-6 right-6 flex gap-3">
              {images.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentImageIndex(index)}
                  className={`w-3 h-3 rounded-full transition-all border ${
                    currentImageIndex === index 
                      ? 'bg-accent border-accent' 
                      : 'bg-white/80 border-gray-400 hover:bg-accent/20'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Call Controls */}
          <div className="mt-8 flex justify-center items-center gap-6">
            {isCallActive ? (
              <>
                <button
                  onClick={toggleMute}
                  className={`p-4 rounded-full transition-all duration-300 shadow-lg hover:scale-110 ${
                    isMuted 
                      ? 'bg-red-500 text-white hover:bg-red-600' 
                      : 'bg-white text-accent hover:bg-gray-50'
                  }`}
                >
                  {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
                <button
                  onClick={stopCall}
                  className="bg-red-500 text-white px-8 py-3 rounded-full hover:bg-red-600 transition-all shadow-lg hover:scale-105 font-medium"
                >
                  End Call
                </button>
                <div className="text-lg font-mono font-medium bg-gray-100 px-4 py-2 rounded-full">{formatDuration(callDuration)}</div>
              </>
            ) : (
              <button
                onClick={startCall}
                disabled={isConnecting || !secondCallAgentId}
                className="bg-accent text-white px-10 py-4 rounded-full hover:bg-accent/90 transition-all shadow-lg hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 text-lg font-medium"
              >
                {isConnecting ? 'Connecting...' : !secondCallAgentId ? 'Preparing...' : 'Start Call'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default InteractiveAvatar;