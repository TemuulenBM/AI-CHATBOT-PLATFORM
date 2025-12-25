import { motion, AnimatePresence } from "framer-motion";
import { Check, PartyPopper, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

interface SuccessAnimationProps {
  show: boolean;
  onComplete?: () => void;
  variant?: "checkmark" | "confetti" | "sparkle";
  size?: "sm" | "md" | "lg";
}

export function SuccessAnimation({
  show,
  onComplete,
  variant = "checkmark",
  size = "md",
}: SuccessAnimationProps) {
  const [isVisible, setIsVisible] = useState(show);

  useEffect(() => {
    if (show) {
      setIsVisible(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        onComplete?.();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [show, onComplete]);

  const sizeClasses = {
    sm: "h-12 w-12",
    md: "h-20 w-20",
    lg: "h-32 w-32",
  };

  const iconSizes = {
    sm: "h-6 w-6",
    md: "h-10 w-10",
    lg: "h-16 w-16",
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className={`${sizeClasses[size]} rounded-full bg-green-500/10 flex items-center justify-center`}
        >
          {variant === "checkmark" && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 400 }}
            >
              <Check className={`${iconSizes[size]} text-green-500`} />
            </motion.div>
          )}
          {variant === "confetti" && (
            <motion.div
              initial={{ rotate: -20, scale: 0 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 400 }}
            >
              <PartyPopper className={`${iconSizes[size]} text-yellow-500`} />
            </motion.div>
          )}
          {variant === "sparkle" && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ delay: 0.2, duration: 0.5, repeat: 2 }}
            >
              <Sparkles className={`${iconSizes[size]} text-primary`} />
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Confetti particles effect
interface ConfettiProps {
  show: boolean;
  duration?: number;
}

export function Confetti({ show, duration = 3000 }: ConfettiProps) {
  const [particles, setParticles] = useState<Array<{ id: number; x: number; delay: number; color: string }>>([]);

  useEffect(() => {
    if (show) {
      const colors = ["#8b5cf6", "#22d3ee", "#22c55e", "#f59e0b", "#ef4444", "#ec4899"];
      const newParticles = Array.from({ length: 50 }).map((_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 0.5,
        color: colors[Math.floor(Math.random() * colors.length)],
      }));
      setParticles(newParticles);

      const timer = setTimeout(() => setParticles([]), duration);
      return () => clearTimeout(timer);
    }
  }, [show, duration]);

  if (!show || particles.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          initial={{ y: -20, x: `${particle.x}vw`, opacity: 1, rotate: 0 }}
          animate={{ y: "100vh", opacity: 0, rotate: 360 * (Math.random() > 0.5 ? 1 : -1) }}
          transition={{ duration: 2 + Math.random(), delay: particle.delay, ease: "easeIn" }}
          className="absolute w-3 h-3 rounded-sm"
          style={{ backgroundColor: particle.color }}
        />
      ))}
    </div>
  );
}

// Pulse animation for save buttons
interface PulseButtonProps {
  hasChanges: boolean;
  children: React.ReactNode;
  className?: string;
}

export function PulseIndicator({ show }: { show: boolean }) {
  if (!show) return null;

  return (
    <motion.span
      initial={{ scale: 0.8, opacity: 0.5 }}
      animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 1.5, repeat: Infinity }}
      className="absolute -top-1 -right-1 h-3 w-3 bg-primary rounded-full"
    />
  );
}
