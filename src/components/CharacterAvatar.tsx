import type { CharacterDef } from "../data/characters";
import { cn } from "../utils/cn";

interface Props {
  ch: CharacterDef;
  className?: string;
  ring?: boolean;
  shape?: "circle" | "rect" | "rounded";
}

export default function CharacterAvatar({ ch, className, ring, shape = "circle" }: Props) {
  const radiusCls = shape === "circle" ? "rounded-full" : shape === "rect" ? "rounded-none" : "rounded-lg";

  return (
    <div
      className={cn("relative overflow-hidden", radiusCls, className)}
      style={{
        background: `radial-gradient(circle at 50% 30%, ${ch.color}33, #1a1410 80%)`,
      }}
    >
      <img
        src={ch.portrait}
        alt={ch.name}
        className="w-full h-full object-cover"
        draggable={false}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
      {/* Color tint overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(180deg, transparent 50%, ${ch.color}22 100%)`,
        }}
      />
      {/* Ring */}
      {ring && (
        <div
          className="absolute inset-0 pointer-events-none rounded-[inherit]"
          style={{
            boxShadow: "inset 0 0 0 2px rgba(240,200,98,0.7)",
          }}
        />
      )}
    </div>
  );
}
