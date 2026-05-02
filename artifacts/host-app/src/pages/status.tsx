import { useGetMyApplication, useGetMyRole, getGetMyApplicationQueryKey, getGetMyRoleQueryKey } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useEffect } from "react";

export default function Status() {
  const { data: application, isLoading: appLoading } = useGetMyApplication({ query: { queryKey: getGetMyApplicationQueryKey(), retry: false } });
  const { data: role, isLoading: roleLoading } = useGetMyRole({ query: { queryKey: getGetMyRoleQueryKey(), retry: false } });
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!appLoading && !application) {
      setLocation("/apply");
    }
  }, [application, appLoading, setLocation]);

  if (appLoading || roleLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs tracking-widest">
        ...
      </div>
    );
  }

  if (!application) return null;

  const isAssigned = application.status === "assigned" && role;

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-xl w-full"
      >
        <div className="border border-border bg-card p-8 md:p-12 weave-pattern">
          <h2 className="depth-heading tracking-[0.2em] uppercase mb-8">
            Status
          </h2>

          <div className="weave-divider w-full mb-8" />

          <div className="space-y-6 font-mono text-sm">
            <div className="flex justify-between items-center py-2 border-b border-border/50">
              <span className="text-muted-foreground uppercase tracking-widest text-xs">ID</span>
              <span className="text-foreground">SUBJ-{application.id.toString().padStart(4, '0')}</span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-border/50">
              <span className="text-muted-foreground uppercase tracking-widest text-xs">Submitted</span>
              <span className="text-foreground">{new Date(application.submittedAt).toLocaleDateString()}</span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-border/50">
              <span className="text-muted-foreground uppercase tracking-widest text-xs">State</span>
              <span className="uppercase tracking-widest text-foreground">
                {application.status}
              </span>
            </div>

            {isAssigned && role && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="mt-8 p-6 border border-border diamond-pattern"
              >
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Designation</p>
                <p className="text-lg text-foreground mb-6">{role.statusLabel}</p>

                <Link
                  href="/dashboard"
                  className="inline-block w-full text-center border border-foreground text-foreground hover:bg-foreground hover:text-background py-3 uppercase tracking-[0.2em] text-xs font-medium transition-colors"
                >
                  Access
                </Link>
              </motion.div>
            )}

            {!isAssigned && (
              <div className="mt-8 p-6 border border-border bg-background">
                <p className="text-xs text-muted-foreground lowercase tracking-widest leading-relaxed">
                  dossier received. access is being initialized.
                </p>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
