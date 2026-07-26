import { useEffect, useRef } from "react";
import { AudioManager } from "../audio/AudioManager";

export default function IntroVideo({ onFinished }: { onFinished: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const finishedRef = useRef(false);

  const safeFinish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinished();
  };

  useEffect(() => {
    // Start game BGM for intro
    const startAudio = () => {
      AudioManager.playBgm("./audio/bgm-game.mp3", true);
    };
    // Try to start on first user interaction (browser autoplay policy)
    startAudio();
    const onInteract = () => {
      startAudio();
      window.removeEventListener("click", onInteract);
      window.removeEventListener("keydown", onInteract);
    };
    window.addEventListener("click", onInteract, { once: true });
    window.addEventListener("keydown", onInteract, { once: true });

    const v = videoRef.current;
    if (!v) {
      const t = setTimeout(safeFinish, 2000);
      return () => {
        clearTimeout(t);
        window.removeEventListener("click", onInteract);
        window.removeEventListener("keydown", onInteract);
      };
    }

    // Attempt autoplay video (muted for autoplay policy)
    const tryPlay = () => {
      const p = v.play();
      if (p) {
        p.catch(() => {
          v.muted = true;
          v.play().catch(() => {
            setTimeout(safeFinish, 3000);
          });
        });
      }
    };
    tryPlay();

    // Safety: auto-skip after 15s
    const safety = setTimeout(safeFinish, 15000);
    return () => {
      clearTimeout(safety);
      window.removeEventListener("click", onInteract);
      window.removeEventListener("keydown", onInteract);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-black overflow-hidden" onClick={safeFinish}>
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        src="./images/intro-video.mp4"
        autoPlay
        muted
        playsInline
        preload="auto"
        onEnded={safeFinish}
        onError={() => setTimeout(safeFinish, 1500)}
      />
    </div>
  );
}
