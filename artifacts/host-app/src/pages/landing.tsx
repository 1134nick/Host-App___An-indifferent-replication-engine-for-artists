import { motion } from "framer-motion";
import { Link } from "wouter";

export default function Landing() {
  return (
    <div className="relative flex-1 flex items-center justify-center overflow-hidden min-h-[calc(100vh-3.5rem)]">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 2, ease: "easeOut" }}
        className="relative z-10 max-w-2xl mx-auto px-8 text-center flex flex-col items-center gap-12"
      >
        <h1 className="depth-text-lg uppercase tracking-[0.3em]">
          Host
        </h1>

        <div className="max-w-md space-y-4 text-sm leading-relaxed text-muted-foreground tracking-wide">
          <p>time is the substance.</p>
          <p>this members only platform is anonymous.</p>
          <p>Users interact with voice messages between participants.</p>
          <p>Nothing is built on stone.</p>
        </div>

        <div className="weave-divider w-full max-w-xs" />

        <Link
          href="/register"
          className="px-8 py-3 border border-border text-foreground uppercase tracking-[0.2em] text-xs hover:border-primary hover:text-primary transition-all duration-500"
        >
          Enter
        </Link>
      </motion.div>
    </div>
  );
}
