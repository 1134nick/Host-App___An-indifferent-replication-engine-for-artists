import { useGetMyRole, useGetMyRooms, useGetMyInstructions } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { Lock, MessageSquare } from "lucide-react";
import { motion } from "framer-motion";

export default function Dashboard() {
  const { data: role, isLoading: roleLoading } = useGetMyRole({ query: { retry: false } });
  const { data: rooms, isLoading: roomsLoading } = useGetMyRooms();
  const { data: instructions } = useGetMyInstructions();
  const [, setLocation] = useLocation();

  if (roleLoading || roomsLoading) {
    return (
      <div className="flex-1 flex items-center justify-center font-mono text-xs text-muted-foreground">
        ...
      </div>
    );
  }

  if (!role) {
    setLocation("/status");
    return null;
  }

  const isPeripheral = role.roleType === "peripheral";

  return (
    <div className="flex-1 p-6 max-w-6xl mx-auto w-full">
      <header className="mb-12">
        <h1 className="depth-text text-xl tracking-[0.2em] uppercase mb-4">
          Console
        </h1>
        <div className="weave-divider w-full mb-4" />
        <div className="flex flex-wrap gap-4 text-xs font-mono uppercase tracking-widest">
          <span className="bg-card px-3 py-1 border border-border">{role.statusLabel}</span>
          {role.teamName && <span className="bg-card px-3 py-1 border border-border">{role.teamName}</span>}
          <span className="bg-card px-3 py-1 border border-border text-muted-foreground">Cohort {role.cohortNumber}</span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-4">Channels</h2>

          {rooms && rooms.length > 0 ? (
            <div className="grid gap-4">
              {rooms.map((room) => (
                <Link key={room.id} href={`/rooms/${room.id}`}>
                  <div className="group bg-card border border-border p-6 hover:border-primary/50 transition-colors cursor-pointer weave-pattern">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-sm font-mono tracking-wider uppercase flex items-center gap-3">
                          <MessageSquare className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                          {room.roomType.replace('_', ' ')}
                        </h3>
                        <p className="text-xs text-muted-foreground font-mono mt-2 tracking-widest">
                          {room.memberCount} present
                        </p>
                      </div>
                      <span className="text-xs border border-border px-2 py-1 text-muted-foreground group-hover:text-foreground transition-colors font-mono">
                        ENTER
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-8 border border-dashed border-border text-center">
              <Lock className="w-5 h-5 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">No channels assigned</p>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-4">Directives</h2>

          <div className="space-y-4">
            {instructions && instructions.length > 0 ? (
              instructions.map((inst) => (
                <motion.div
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={inst.id}
                  className="bg-card border-l-2 border-l-primary border border-border p-5 text-sm font-mono"
                >
                  <p className="text-xs text-muted-foreground mb-3 pb-2 border-b border-border/50">
                    {new Date(inst.createdAt).toLocaleTimeString()}
                  </p>
                  <div className="text-foreground leading-relaxed">
                    {inst.content}
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="p-6 border border-border bg-card text-xs font-mono text-muted-foreground lowercase tracking-widest">
                {isPeripheral
                  ? "observation mode. stand by."
                  : "awaiting directives."}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
