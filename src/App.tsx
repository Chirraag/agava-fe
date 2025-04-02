import React, { useState, useEffect } from 'react';
import { Send, Loader2, Building2, Mail, Phone, Globe } from 'lucide-react';
import { WebSocketCall } from './components/WebSocketCall';
import InteractiveAvatar from './components/InteractiveAvatar';
import { VideoScreen } from './components/VideoScreen';

function App() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    companyUrl: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const [showVideo, setShowVideo] = useState(false);
  const [showHeyGen, setShowHeyGen] = useState(false);

  useEffect(() => {
    let statusInterval: NodeJS.Timeout;

    if (sessionId && !showVideo && !showHeyGen) {
      statusInterval = setInterval(async () => {
        try {
          const response = await fetch(
            `${import.meta.env.VITE_BACKEND_URL}/api/status/${sessionId}`
          );
          const data = await response.json();

          if (data.success) {
            setStatus(data.status);
            if (data.agentId) {
              setAgentId(data.agentId);
            }
          }
        } catch (error) {
          console.error('Error fetching status:', error);
        }
      }, 2000);
    }

    return () => {
      if (statusInterval) {
        clearInterval(statusInterval);
      }
    };
  }, [sessionId, showVideo, showHeyGen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/submit`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(formData),
        }
      );

      if (!response.ok) {
        throw new Error('Submission failed');
      }

      const data = await response.json();
      setSessionId(data.sessionId);
      setStatus('Processing');

      setFormData({
        name: '',
        email: '',
        phone: '',
        companyUrl: '',
      });
    } catch (error) {
      console.error('Error submitting form:', error);
      alert('Failed to submit form. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleCallComplete = () => {
    setShowVideo(true);
  };

  const handleVideoComplete = () => {
    setShowHeyGen(true);
  };

  return (
    <div className="min-h-screen bg-base flex items-center justify-center p-6">
      <div className="w-full max-w-4xl">
        {!sessionId ? (
          <form onSubmit={handleSubmit}>
            <div className="text-center mb-8">
              <h2 className="text-3xl font-heading font-bold text-primary mb-3">
                TEST 100% KI-SALG
              </h2>
              <p className="text-lg text-primary/70">
                La oss starte din AI-oppdagelsesreise
              </p>
            </div>

            <div className="bg-white rounded-2xl shadow-lg p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="space-y-2">
                  <label
                    htmlFor="name"
                    className="flex items-center text-sm font-medium text-primary"
                  >
                    <Building2 className="w-4 h-4 mr-2 text-accent" />
                    Navn
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2 text-base rounded-lg border-2 border-gray-200 focus:border-accent focus:ring-0 transition-colors text-primary placeholder:text-gray-400"
                    placeholder="Ola Nordmann"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="email"
                    className="flex items-center text-sm font-medium text-primary"
                  >
                    <Mail className="w-4 h-4 mr-2 text-accent" />
                    E-post
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2 text-base rounded-lg border-2 border-gray-200 focus:border-accent focus:ring-0 transition-colors text-primary placeholder:text-gray-400"
                    placeholder="ola@bedrift.no"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="phone"
                    className="flex items-center text-sm font-medium text-primary"
                  >
                    <Phone className="w-4 h-4 mr-2 text-accent" />
                    Telefon
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2 text-base rounded-lg border-2 border-gray-200 focus:border-accent focus:ring-0 transition-colors text-primary placeholder:text-gray-400"
                    placeholder="+47 123 45 678"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="companyUrl"
                    className="flex items-center text-sm font-medium text-primary"
                  >
                    <Globe className="w-4 h-4 mr-2 text-accent" />
                    Nettside
                  </label>
                  <input
                    type="url"
                    id="companyUrl"
                    name="companyUrl"
                    value={formData.companyUrl}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2 text-base rounded-lg border-2 border-gray-200 focus:border-accent focus:ring-0 transition-colors text-primary placeholder:text-gray-400"
                    placeholder="https://bedrift.no"
                  />
                </div>
              </div>

              <div className="flex justify-center">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-accent text-white py-3 px-8 rounded-xl font-medium text-lg flex items-center justify-center space-x-3 hover:bg-accent/90 active:bg-accent/80 transition-colors disabled:opacity-50 shadow-lg"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <>
                      <span>Start Oppdagelse</span>
                      <Send size={20} />
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        ) : showHeyGen ? (
          <div className="mb-8">
            <InteractiveAvatar sessionId={sessionId} />
          </div>
        ) : showVideo ? (
          <VideoScreen onComplete={handleVideoComplete} />
        ) : (
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="text-center">
              <h2 className="text-3xl font-heading font-bold text-primary mb-6">
                TEST 100% KI-SALG, STEG 1
              </h2>
              <p className="text-xl mb-4">Si hei til Adam!</p>
              <p className="text-lg mb-6 max-w-2xl mx-auto">
                Adams oppgave er å forberede KI selgeren du snart vil møte, med
                innsikt om din avdeling, om dere er kommet i gang med
                automatisering med språkbaserte KI løsninger og hvilke tanker du
                har om KI muligheter for avdelingen.
              </p>
              <p className="text-lg mb-8">
                I neste steg vil du få svar på spørsmål om KI
                mulighetsrapporten, den automatiserte interaktive tjenesten og
                hva som kreves for å komme i gang i din avdeling.
              </p>

              {status === 'Processing' && (
                <div className="loading-dots">
                  <div></div>
                  <div></div>
                  <div></div>
                </div>
              )}

              {status === 'Ready' && agentId && sessionId && (
                <div className="mt-8">
                  <WebSocketCall
                    agentId={agentId}
                    sessionId={sessionId}
                    onComplete={handleCallComplete}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;