import React from "react";
import ReactPlayer from "react-player";

interface VideoScreenProps {
  onComplete: () => void;
}

export function VideoScreen({ onComplete }: VideoScreenProps) {
  return (
    <div className="bg-white rounded-2xl shadow-lg p-8">
      <div className="text-center">
        <h2 className="text-3xl font-heading font-bold text-primary mb-6">
          TEST 100% KI-SALG, STEG 1
        </h2>
        <p className="text-xl mb-4">Si hei til vår svenske kollega Amelia!</p>
        <p className="text-lg mb-6">
          Amelia vil på 3 minutter ta deg igjennom hvordan Bantaii-appen
          debriefer kundemøter med salgsmetodene BANT og MEDDIC.
        </p>
        <p className="text-lg mb-8 text-accent font-medium">
          Obs! Forbered noen Bantaii spørsmål til ditt <i>live</i> møte med
          Sofia i steg 2.
        </p>

        <div className="max-w-4xl mx-auto mb-8">
          <div className="relative aspect-video rounded-xl overflow-hidden shadow-xl">
            <ReactPlayer
              url="/example-vid.mp4"
              width="100%"
              height="100%"
              controls={true}
              playing={false}
              onEnded={onComplete}
            />
          </div>
        </div>

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
