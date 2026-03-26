import { useGetMyApplication, useGetMyRole } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { Activity, Clock, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect } from "react";

export default function Status() {
  const { data: application, isLoading: appLoading } = useGetMyApplication({ query: { retry: false } });
  const { data: role, isLoading: roleLoading } = useGetMyRole({ query: { retry: false } });
  const [, setLocation] = useLocation();

  // If no application exists, redirect to apply
  useEffect(() => {
    if (!appLoading && !application) {
      setLocation("/apply");
    }
  }, [application, appLoading, setLocation]);

  if (appLoading || roleLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Activity className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!application) return null;

  const isAssigned = application.status === "assigned" && role;

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-xl w-full"
      >
        <div className="border border-border bg-card p-8 md:p-12 relative overflow-hidden">
          {/* Decorative scanner line */}
          <div className="absolute top-0 left-0 w-full h-px bg-primary/30 animate-[pulse_4s_ease-in-out_infinite]"></div>
          
          <h2 className="font-serif text-2xl tracking-[0.2em] uppercase mb-8 border-b border-border pb-4">
            Subject Status
          </h2>

          <div className="space-y-6 font-mono text-sm">
            <div className="flex justify-between items-center py-2 border-b border-border/50">
              <span className="text-muted-foreground uppercase tracking-widest">Identification</span>
              <span className="text-foreground">SUBJ-{application.id.toString().padStart(4, '0')}</span>
            </div>
            
            <div className="flex justify-between items-center py-2 border-b border-border/50">
              <span className="text-muted-foreground uppercase tracking-widest">Submission Phase</span>
              <span className="text-foreground">{new Date(application.submittedAt).toLocaleDateString()}</span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-border/50">
              <span className="text-muted-foreground uppercase tracking-widest">System Status</span>
              <span className={`uppercase font-bold tracking-widest flex items-center gap-2 ${isAssigned ? 'text-primary' : 'text-foreground'}`}>
                {isAssigned ? <ShieldCheck className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                {application.status}
              </span>
            </div>

            {isAssigned && role && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="mt-8 p-6 border border-primary/30 bg-primary/5"
              >
                <p className="text-xs uppercase tracking-widest text-primary mb-2">Integration Rule Fired</p>
                <p className="text-lg text-foreground mb-6">Designation: {role.statusLabel}</p>
                
                <Link 
                  href="/dashboard"
                  className="inline-block w-full text-center bg-primary text-primary-foreground py-3 uppercase tracking-[0.2em] text-xs font-bold hover:bg-primary/80 transition-colors"
                >
                  Access Terminal
                </Link>
              </motion.div>
            )}

            {!isAssigned && (
              <div className="mt-8 p-6 border border-border bg-background">
                <p className="text-xs uppercase tracking-widest text-muted-foreground leading-relaxed">
                  Awaiting cohort finalization. Placement is dictated by internal architectural requirements. Further instructions pending.
                </p>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
