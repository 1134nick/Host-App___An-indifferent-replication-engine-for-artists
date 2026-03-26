import { useGetMyRole, useGetMyRooms, useGetMyInstructions } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { Terminal, Lock, MessageSquare, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";

export default function Dashboard() {
  const { data: role, isLoading: roleLoading } = useGetMyRole({ query: { retry: false } });
  const { data: rooms, isLoading: roomsLoading } = useGetMyRooms();
  const { data: instructions } = useGetMyInstructions();
  const [, setLocation] = useLocation();

  if (roleLoading || roomsLoading) {
    return (
      <div className="flex-1 flex items-center justify-center font-mono text-sm text-muted-foreground animate-pulse">
        Initializing Workspace...
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
        <h1 className="font-serif text-3xl md:text-4xl tracking-[0.2em] uppercase border-b border-border pb-6 mb-4 flex items-center gap-4">
          <Terminal className="w-8 h-8 text-primary" />
          Operator Console
        </h1>
        <div className="flex flex-wrap gap-4 text-xs font-mono uppercase tracking-widest">
          <span className="bg-card px-3 py-1 border border-border">Designation: {role.statusLabel}</span>
          {role.teamName && <span className="bg-primary/10 text-primary px-3 py-1 border border-primary/30">Sector: {role.teamName}</span>}
          <span className="bg-card px-3 py-1 border border-border text-muted-foreground">Cohort: {role.cohortNumber}</span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Rooms */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="font-mono text-sm uppercase tracking-widest text-muted-foreground mb-4">Accessible Channels</h2>
          
          {rooms && rooms.length > 0 ? (
            <div className="grid gap-4">
              {rooms.map((room) => (
                <Link key={room.id} href={`/rooms/${room.id}`}>
                  <div className="group bg-card border border-border p-6 hover:border-primary/50 transition-colors cursor-pointer relative overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary scale-y-0 group-hover:scale-y-100 transition-transform origin-bottom"></div>
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-serif tracking-wider uppercase flex items-center gap-3">
                          <MessageSquare className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                          {room.roomType.replace('_', ' ')}
                        </h3>
                        <p className="text-xs text-muted-foreground font-mono mt-2 uppercase tracking-widest">
                          Members present: {room.memberCount}
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
            <div className="p-8 border border-dashed border-border bg-background/50 text-center">
              <Lock className="w-6 h-6 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-sm font-mono text-muted-foreground uppercase tracking-widest">No active channels assigned</p>
            </div>
          )}
        </div>

        {/* Right Column: Instructions */}
        <div className="space-y-6">
          <h2 className="font-mono text-sm uppercase tracking-widest text-primary mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Directives
          </h2>

          <div className="space-y-4">
            {instructions && instructions.length > 0 ? (
              instructions.map((inst) => (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={inst.id} 
                  className="bg-card border-l-2 border-l-primary border border-border p-5 text-sm font-mono"
                >
                  <p className="text-xs text-muted-foreground mb-3 pb-2 border-b border-border/50">
                    RECV: {new Date(inst.createdAt).toLocaleTimeString()}
                  </p>
                  <div className="text-foreground leading-relaxed">
                    {inst.content}
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="p-6 border border-border bg-card text-xs font-mono text-muted-foreground uppercase tracking-widest">
                {isPeripheral 
                  ? "Stand by. Your function is observational until prompted."
                  : "Awaiting architectural directives."}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
