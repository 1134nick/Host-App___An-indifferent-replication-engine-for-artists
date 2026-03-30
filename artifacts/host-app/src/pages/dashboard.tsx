import { useGetMyRole, useGetMyRooms, useGetMyInstructions, useCreateChannel, useDeleteRoom } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { Lock, MessageSquare, Plus, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export default function Dashboard() {
  const { data: role, isLoading: roleLoading } = useGetMyRole({ query: { retry: false } });
  const { data: rooms, isLoading: roomsLoading } = useGetMyRooms();
  const { data: instructions } = useGetMyInstructions();
  const [, setLocation] = useLocation();
  const createChannel = useCreateChannel();
  const deleteRoom = useDeleteRoom();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

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

  const generalRoom = rooms?.find((r) => r.roomType === "general");
  const memberChannels = rooms?.filter((r) => r.roomType === "member_channel") ?? [];
  const systemRooms = rooms?.filter((r) => r.roomType !== "general" && r.roomType !== "member_channel") ?? [];

  const handleCreateChannel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelName.trim()) return;
    createChannel.mutate(
      { data: { name: channelName.trim() } },
      {
        onSuccess: () => {
          setChannelName("");
          setShowCreate(false);
          queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
        },
      },
    );
  };

  return (
    <div className="flex-1 p-6 max-w-6xl mx-auto w-full">
      <header className="mb-12">
        <h1 className="depth-heading tracking-[0.2em] uppercase mb-4">
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
            <div className="space-y-4">
              {generalRoom && (
                <Link href={`/rooms/${generalRoom.id}`}>
                  <div className="group bg-card border border-border p-6 hover:border-primary/50 transition-colors cursor-pointer weave-pattern">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-sm font-mono tracking-wider uppercase flex items-center gap-3">
                          <MessageSquare className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                          General
                        </h3>
                        <p className="text-xs text-muted-foreground font-mono mt-2 tracking-widest">
                          {generalRoom.memberCount} present
                        </p>
                      </div>
                      <span className="text-xs border border-border px-2 py-1 text-muted-foreground group-hover:text-foreground transition-colors font-mono">
                        ENTER
                      </span>
                    </div>
                  </div>
                </Link>
              )}

              {memberChannels.length > 0 && (
                <div className="space-y-2 pl-4 border-l border-border/50">
                  {memberChannels.map((room) => (
                    <div key={room.id} className="group bg-card border border-border p-4 hover:border-primary/50 transition-colors">
                      <div className="flex justify-between items-center">
                        <Link href={`/rooms/${room.id}`} className="flex items-center gap-3 flex-1 cursor-pointer">
                          <MessageSquare className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                          <span className="text-xs font-mono tracking-wider uppercase">
                            {room.displayName || `Channel ${room.channelNumber}`}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono tracking-widest">
                            {room.memberCount} present
                          </span>
                        </Link>
                        <div className="flex items-center gap-2">
                          {confirmDeleteId === room.id ? (
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-mono uppercase tracking-widest text-destructive">delete?</span>
                              <button
                                onClick={() => {
                                  deleteRoom.mutate(
                                    { roomId: room.id },
                                    {
                                      onSuccess: () => {
                                        queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
                                        setConfirmDeleteId(null);
                                      },
                                    },
                                  );
                                }}
                                disabled={deleteRoom.isPending}
                                className="text-[9px] font-mono uppercase tracking-widest text-destructive hover:text-foreground px-2 py-1 border border-destructive/50 disabled:opacity-30"
                              >
                                {deleteRoom.isPending ? "..." : "yes"}
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground px-2 py-1 border border-border"
                              >
                                no
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => setConfirmDeleteId(room.id)}
                                className="text-muted-foreground/40 hover:text-destructive transition-colors p-1"
                                title="Delete channel"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                              <Link href={`/rooms/${room.id}`}>
                                <span className="text-[10px] border border-border px-2 py-0.5 text-muted-foreground group-hover:text-foreground transition-colors font-mono cursor-pointer">
                                  ENTER
                                </span>
                              </Link>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {systemRooms.length > 0 && (
                <div className="space-y-2 pl-4 border-l border-border/50">
                  {systemRooms.map((room) => (
                    <Link key={room.id} href={`/rooms/${room.id}`}>
                      <div className="group bg-card border border-border p-4 hover:border-primary/50 transition-colors cursor-pointer">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <MessageSquare className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                            <span className="text-xs font-mono tracking-wider uppercase">
                              {room.displayName || room.roomType.replace(/_/g, ' ')}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono tracking-widest">
                              {room.memberCount} present
                            </span>
                          </div>
                          <span className="text-[10px] border border-border px-2 py-0.5 text-muted-foreground group-hover:text-foreground transition-colors font-mono">
                            ENTER
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {rooms && rooms.length > 0 && (
                <div className="pl-4 border-l border-border/50">
                  {showCreate ? (
                    <form onSubmit={handleCreateChannel} className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={channelName}
                        onChange={(e) => setChannelName(e.target.value)}
                        placeholder="channel name..."
                        className="flex-1 bg-background border-b border-border px-0 py-2 text-xs font-mono focus:outline-none focus:border-primary transition-colors"
                        autoFocus
                        maxLength={50}
                        disabled={createChannel.isPending}
                      />
                      <button
                        type="submit"
                        disabled={!channelName.trim() || createChannel.isPending}
                        className="text-xs border border-foreground px-3 py-1.5 font-mono uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors disabled:opacity-30"
                      >
                        {createChannel.isPending ? "..." : "Create"}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowCreate(false); setChannelName(""); }}
                        className="text-xs text-muted-foreground hover:text-foreground font-mono uppercase tracking-widest px-2 py-1.5"
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <button
                      onClick={() => setShowCreate(true)}
                      className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors py-2"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      New Channel
                    </button>
                  )}
                </div>
              )}
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
