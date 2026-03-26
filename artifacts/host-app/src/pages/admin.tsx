import { useGetAdminStats, useGetAllApplications, useGetCohorts, useProcessCohort } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Activity, Users, Layers, Play } from "lucide-react";
import { useState } from "react";

export default function Admin() {
  const { data: stats } = useGetAdminStats();
  const { data: apps } = useGetAllApplications();
  const { data: cohorts } = useGetCohorts();
  const processCohortMutation = useProcessCohort();
  const queryClient = useQueryClient();

  const handleProcess = (cohortId: number) => {
    if(!confirm("Process this cohort? This assigns roles based on the prime sequence rule.")) return;
    
    processCohortMutation.mutate({ cohortId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
        queryClient.invalidateQueries({ queryKey: ["/api/cohorts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/applications/all"] });
        alert("Cohort processed successfully.");
      }
    });
  };

  return (
    <div className="flex-1 p-6 max-w-7xl mx-auto w-full font-mono text-sm">
      <header className="mb-10 border-b border-border pb-6 flex justify-between items-end">
        <div>
          <h1 className="font-serif text-3xl tracking-[0.2em] uppercase text-primary">Root Access</h1>
          <p className="text-muted-foreground uppercase tracking-widest mt-2">Overseer Console</p>
        </div>
      </header>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          <StatBox label="Total Users" value={stats.totalUsers} icon={<Users />} />
          <StatBox label="Total Apps" value={stats.totalApplications} icon={<Layers />} />
          <StatBox label="Active Cohorts" value={stats.activeCohorts} icon={<Activity />} />
          <StatBox label="Open Spots" value={stats.spotsToFill} highlight />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <section>
          <h2 className="text-lg font-serif tracking-widest uppercase mb-6 border-b border-border/50 pb-2">Cohorts Architecture</h2>
          <div className="space-y-4">
            {cohorts?.map(c => (
              <div key={c.id} className="bg-card border border-border p-4 flex justify-between items-center">
                <div>
                  <div className="text-primary uppercase tracking-widest mb-1">Cycle {c.cohortNumber}</div>
                  <div className="text-muted-foreground">Status: {c.status} | Apps: {c.applicantCount}/100</div>
                </div>
                {c.status === "open" && c.applicantCount === 100 && (
                  <button 
                    onClick={() => handleProcess(c.id)}
                    disabled={processCohortMutation.isPending}
                    className="flex items-center gap-2 bg-primary/20 text-primary border border-primary/50 px-4 py-2 hover:bg-primary hover:text-primary-foreground transition-colors"
                  >
                    <Play className="w-4 h-4" />
                    Process
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-serif tracking-widest uppercase mb-6 border-b border-border/50 pb-2">Recent Dossiers</h2>
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
            {apps?.map(app => (
              <div key={app.id} className="bg-card border border-border p-4 text-xs">
                <div className="flex justify-between text-muted-foreground mb-2">
                  <span>SUBJ-{app.id}</span>
                  <span>{app.status}</span>
                </div>
                <div className="text-foreground">{app.userDisplayName} ({app.userEmail})</div>
                <div className="mt-2 pt-2 border-t border-border/50 opacity-70">
                  {app.profession} / {app.nationality} / Age: {app.age}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatBox({ label, value, icon, highlight }: any) {
  return (
    <div className={`p-6 border ${highlight ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}>
      <div className={`flex items-center gap-3 mb-4 ${highlight ? 'text-primary' : 'text-muted-foreground'}`}>
        {icon && <div className="w-5 h-5">{icon}</div>}
        <div className="uppercase tracking-widest text-xs">{label}</div>
      </div>
      <div className="text-3xl font-serif">{value}</div>
    </div>
  );
}
