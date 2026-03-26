import { useGetAdminStats, useGetAllApplications, useGetCohorts, useProcessCohort } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { useState } from "react";

export default function Admin() {
  const { data: stats } = useGetAdminStats();
  const { data: apps } = useGetAllApplications();
  const { data: cohorts } = useGetCohorts();
  const processCohortMutation = useProcessCohort();
  const queryClient = useQueryClient();

  const handleProcess = (cohortId: number) => {
    if(!confirm("Process this cohort?")) return;

    processCohortMutation.mutate({ cohortId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
        queryClient.invalidateQueries({ queryKey: ["/api/cohorts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/applications/all"] });
        alert("Processed.");
      }
    });
  };

  return (
    <div className="flex-1 p-6 max-w-7xl mx-auto w-full font-mono text-sm">
      <header className="mb-10 pb-6">
        <h1 className="depth-text text-xl tracking-[0.2em] uppercase mb-4">Root Access</h1>
        <div className="weave-divider w-full" />
      </header>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          <StatBox label="Users" value={stats.totalUsers} />
          <StatBox label="Applications" value={stats.totalApplications} />
          <StatBox label="Cohorts" value={stats.activeCohorts} />
          <StatBox label="Open Spots" value={stats.spotsToFill} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <section>
          <h2 className="text-xs font-mono tracking-widest uppercase mb-6 text-muted-foreground">Cohorts</h2>
          <div className="space-y-4">
            {cohorts?.map(c => (
              <div key={c.id} className="bg-card border border-border p-4 flex justify-between items-center weave-pattern">
                <div>
                  <div className="text-foreground uppercase tracking-widest mb-1 text-xs">Cycle {c.cohortNumber}</div>
                  <div className="text-muted-foreground text-xs">{c.status} | {c.applicantCount}/100</div>
                </div>
                {c.status === "open" && c.applicantCount === 100 && (
                  <button
                    onClick={() => handleProcess(c.id)}
                    disabled={processCohortMutation.isPending}
                    className="flex items-center gap-2 border border-foreground text-foreground px-4 py-2 text-xs hover:bg-foreground hover:text-background transition-colors"
                  >
                    <Play className="w-3 h-3" />
                    Process
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xs font-mono tracking-widest uppercase mb-6 text-muted-foreground">Dossiers</h2>
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
            {apps?.map(app => (
              <div key={app.id} className="bg-card border border-border p-4 text-xs">
                <div className="flex justify-between text-muted-foreground mb-2">
                  <span>SUBJ-{app.id}</span>
                  <span>{app.status}</span>
                </div>
                <div className="text-foreground">{app.userDisplayName} ({app.userEmail})</div>
                <div className="mt-2 pt-2 border-t border-border/50 text-muted-foreground">
                  {app.profession} / {app.nationality} / {app.age}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-6 border border-border bg-card">
      <div className="uppercase tracking-widest text-xs text-muted-foreground mb-3">{label}</div>
      <div className="text-2xl font-mono text-foreground">{value}</div>
    </div>
  );
}
