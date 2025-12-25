import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { OnboardingSteps } from "./steps";

interface OnboardingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

export function OnboardingModal({ open, onOpenChange, onComplete }: OnboardingModalProps) {
  const handleSkip = () => {
    onOpenChange(false);
    onComplete();
  };

  const handleComplete = () => {
    onOpenChange(false);
    onComplete();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] p-0 overflow-hidden">
        <DialogTitle className="sr-only">
          Welcome to ConvoAI - Onboarding
        </DialogTitle>
        <DialogDescription className="sr-only">
          Complete the onboarding steps to create your first AI chatbot. Follow the guided tour to set up your chatbot in 3 easy steps.
        </DialogDescription>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="p-6"
            >
              <OnboardingSteps onComplete={handleComplete} onSkip={handleSkip} />
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
