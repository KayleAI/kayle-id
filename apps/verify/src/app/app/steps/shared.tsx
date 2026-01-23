import { Logo } from "@kayleai/ui/logo";
import { motion } from "motion/react";
import type { ReactNode } from "react";

/**
 * Common layout wrapper for all step screens.
 */
export function StepLayout({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="relative flex w-full flex-col items-center justify-center">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div>
          <div className="mb-8">
            <Logo className="" title="Kayle ID" />
          </div>
          <h1 className="mb-4 font-light text-3xl text-foreground tracking-tight">
            {title}
          </h1>
          <p className="text-lg text-muted-foreground">{description}</p>
        </div>

        {/* Children content */}
        {children}

        {/* Actions */}
        {actions && <div className="flex flex-col space-y-4">{actions}</div>}
      </div>
    </div>
  );
}

/**
 * Fade transition wrapper for step screens.
 */
export function FadeTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.div>
  );
}
