import { motion } from "framer-motion";
import { Link } from "wouter";
import { useGetCurrentCohortStatus } from "@workspace/api-client-react";
import { ShieldAlert, Hexagon } from "lucide-react";

export default function Landing() {
  const { data: status, isLoading } = useGetCurrentCohortStatus({ query: { retry: false } });

  return (
    <div className="relative flex-1 flex items-center justify-center overflow-hidden min-h-[calc(100vh-4rem)]">
      {/* Background Image */}
      <div className="absolute inset-0 z-0 opacity-30 mix-blend-screen pointer-events-none">
        <img 
          src={`${import.meta.env.BASE_URL}images/monolith-bg.png`}
          alt="Monolith" 
          className="w-full h-full object-cover object-center"
        />
      </div>

      <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background z-0"></div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.5, ease: "easeOut" }}
        className="relative z-10 max-w-3xl mx-auto px-6 text-center"
      >
        <Hexagon className="w-12 h-12 mx-auto text-primary mb-8 opacity-50" strokeWidth={1} />
        
        <h1 className="text-5xl md:text-7xl font-serif mb-6 tracking-[0.25em] text-foreground text-glow drop-shadow-md">
          Concealed <br />
          <span className="text-muted-foreground italic text-4xl md:text-6xl lowercase tracking-widest">Intake</span>
        </h1>
        
        <p className="text-muted-foreground text-sm md:text-base max-w-xl mx-auto leading-relaxed mb-12 uppercase tracking-widest border-l border-r border-border px-8 py-4">
          A restricted-access collective. Selection parameters are strictly classified. Submitting a dossier does not guarantee integration.
        </p>

        <div className="flex flex-col items-center gap-8">
          <Link 
            href="/register" 
            className="group relative px-8 py-4 bg-transparent border border-primary/50 text-primary uppercase tracking-[0.2em] text-sm hover:bg-primary/5 transition-all duration-500 overflow-hidden"
          >
            <span className="relative z-10">Commence Application</span>
            <div className="absolute inset-0 bg-primary/10 translate-y-full group-hover:translate-y-0 transition-transform duration-500 ease-out"></div>
          </Link>

          {!isLoading && status ? (
            <div className="flex flex-col gap-2 text-xs font-mono">
              <div className="flex items-center gap-2 justify-center text-muted-foreground">
                <span className="w-2 h-2 rounded-full bg-primary/50 animate-pulse"></span>
                <span>Cohort Cycle {status.cohortNumber} Open</span>
              </div>
              <p className="text-border">
                [ Capacity: {status.applicantCount} / 100 ]
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono animate-pulse">
              <ShieldAlert className="w-4 h-4" />
              Establishing secure connection...
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
