// File purpose: Startup splash screen that plays the intro video before the main app loads.
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";
import startupVideo from "../assets/intro_video.mp4";

type StartupSplashProps = {
  onComplete: () => void;
};

export default function StartupSplash({ onComplete }: StartupSplashProps) {
  useEffect(() => {
    const appWindow = getCurrentWindow();
    void appWindow.setDecorations(false);
    void appWindow.maximize();

    return () => {
      void appWindow.setDecorations(true);
    };
  }, []);

  async function handleEnded() {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.setDecorations(true);
      await appWindow.maximize();
    } catch {
      // Keep the splash exit resilient even if the desktop shell cannot change decorations.
    }
    onComplete();
  }

  return (
    <div className="startup-splash">
      <video
        className="startup-video"
        src={startupVideo}
        autoPlay
        muted
        playsInline
        controlsList="nodownload nofullscreen noremoteplayback"
        disablePictureInPicture
        onContextMenu={(event) => event.preventDefault()}
        onEnded={handleEnded}
      />
    </div>
  );
}
