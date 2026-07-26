import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import IntroVideo from "./components/IntroVideo";
import MainMenu from "./components/MainMenu";
import CharacterSelect from "./components/CharacterSelect";
import CharacterGallery from "./components/CharacterGallery";
import FactionWorld from "./components/FactionWorld";
import FactionGallery3D from "./components/FactionGallery3D";
import PetGallery from "./components/PetGallery";
import GameBoard from "./components/GameBoard";
import LoadingRitual from "./components/LoadingRitual";
import { useGameStore } from "./store/gameStore";
import { AudioManager } from "./audio/AudioManager";

type Screen = "intro" | "menu" | "select" | "loading" | "game" | "characters" | "factions" | "factions3d" | "pet";

export default function App() {
  const [screen, setScreen] = useState<Screen>("intro");
  const [pendingCharId, setPendingCharId] = useState<number | null>(null);
  const initGame = useGameStore((s) => s.actions.initGame);
  const resetGame = useGameStore((s) => s.actions.resetGame);

  useEffect(() => {
    AudioManager.initOnUserGesture();
  }, []);

  const startNewGame = (characterId: number) => {
    setPendingCharId(characterId);
    setScreen("loading");
  };

  const onLoadingComplete = () => {
    if (pendingCharId !== null) {
      initGame(pendingCharId);
      setPendingCharId(null);
    }
    setScreen("game");
  };

  const exitToMenu = () => {
    setScreen("menu");
  };

  // Fix black-screen bug: switch screen first (triggers exit fade animation on GameBoard),
  // then reset game state AFTER the 0.5s exit animation so GameBoard still has data while fading out.
  const hardExitToMenu = () => {
    setScreen("menu");
    setTimeout(() => {
      resetGame();
    }, 520); // slightly longer than 0.5s animation to avoid flicker
  };

  return (
    <div className="fixed inset-0 bg-black font-cinzel text-[#e8dfc8]">
      <AnimatePresence mode="wait">
        {screen === "intro" && (
          <motion.div key="intro" exit={{ opacity: 0 }} transition={{ duration: 0.5 }} className="absolute inset-0">
            <IntroVideo onFinished={() => setScreen("menu")} />
          </motion.div>
        )}

        {screen === "menu" && (
          <motion.div key="menu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }} className="absolute inset-0">
            <MainMenu
              onNewGame={() => setScreen("select")}
              onFactions={() => setScreen("factions")}
              onGallery={() => setScreen("characters")}
              onPet={() => setScreen("pet")}
            />
          </motion.div>
        )}

        {screen === "select" && (
          <motion.div key="select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} className="absolute inset-0">
            <CharacterSelect onConfirm={startNewGame} onBack={() => setScreen("menu")} />
          </motion.div>
        )}

        {screen === "loading" && (
          <LoadingRitual key="loading" onComplete={onLoadingComplete} />
        )}

        {screen === "game" && (
          <motion.div key="game" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} className="absolute inset-0">
            <GameBoard onExit={hardExitToMenu} />
          </motion.div>
        )}

        {screen === "characters" && (
          <motion.div key="characters" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} className="absolute inset-0">
            <CharacterGallery onBack={exitToMenu} />
          </motion.div>
        )}

        {screen === "factions" && (
          <motion.div key="factions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} className="absolute inset-0">
            <FactionWorld onBack={exitToMenu} onView3D={() => setScreen("factions3d")} />
          </motion.div>
        )}

        {screen === "factions3d" && (
          <motion.div key="factions3d" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} className="absolute inset-0">
            <FactionGallery3D onBack={() => setScreen("factions")} />
          </motion.div>
        )}

        {screen === "pet" && (
          <motion.div key="pet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} className="absolute inset-0">
            <PetGallery onBack={exitToMenu} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
