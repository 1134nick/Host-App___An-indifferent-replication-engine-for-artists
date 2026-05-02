import { useGetMyRole, useGetMyRooms, useCreateChannel, getGetMyRoleQueryKey } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { Plus, Radio, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export default function Stations() {
  const { data: role, isLoading: roleLoading } = useGetMyRole({ query: { queryKey: getGetMyRoleQueryKey(), retry: false } });
  const { data: rooms, isLoading: roomsLoading } = useGetMyRooms();
  const [, setLocation] = useLocation();
  const createChannel = useCreateChannel();
  const queryClient = useQueryClient();
  const [createError, setCreateError] = useState<string | null>(null);

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

  const memberChannels = rooms?.filter((r) => r.roomType === "member_channel") ?? [];

  const nextNumber = memberChannels.length > 0
    ? Math.max(...memberChannels.map((r) => r.channelNumber ?? 0)) + 1
    : 1;

  const handleCreateStation = () => {
    setCreateError(null);
    const name = `channel_${String(nextNumber).padStart(2, "0")}`;
    createChannel.mutate(
      { data: { name } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
        },
        onError: () => {
          setCreateError("Failed to create station. Please try again.");
        },
      },
    );
  };

  return (
    <div className="flex-1 p-6 max-w-6xl mx-auto w-full">
      <header className="mb-12">
        <h1 className="depth-heading tracking-[0.2em] uppercase mb-4">
          Stations
        </h1>
        <div className="weave-divider w-full mb-4" />
        <div className="flex flex-wrap gap-4 text-xs font-mono uppercase tracking-widest">
          <span className="bg-card px-3 py-1 border border-border text-muted-foreground">
            Cohort {role.cohortNumber}
          </span>
          <span className="bg-card px-3 py-1 border border-border text-muted-foreground">
            {memberChannels.length} station{memberChannels.length !== 1 ? "s" : ""}
          </span>
        </div>
      </header>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Member Channels
          </h2>
          <button
            onClick={handleCreateStation}
            disabled={createChannel.isPending}
            className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
          >
            <Plus className="w-3.5 h-3.5" />
            {createChannel.isPending ? "Creating..." : "New Station"}
          </button>
        </div>

        {createError && (
          <div className="flex items-center gap-2 p-3 border border-destructive/50 bg-destructive/10 text-xs font-mono text-destructive">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {createError}
          </div>
        )}

        {memberChannels.length > 0 ? (
          <div className="space-y-3">
            {memberChannels.map((room, index) => (
              <motion.div
                key={room.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Link href={`/rooms/${room.id}`}>
                  <div className="group bg-card border border-border p-5 hover:border-primary/50 transition-colors cursor-pointer weave-pattern">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-4">
                        <Radio className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                        <div>
                          <span className="text-sm font-mono tracking-wider uppercase block">
                            channel_{String(room.channelNumber).padStart(2, "0")}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono tracking-widest">
                            {room.memberCount} present
                          </span>
                        </div>
                      </div>
                      <span className="text-xs border border-border px-3 py-1 text-muted-foreground group-hover:text-foreground transition-colors font-mono uppercase tracking-widest">
                        Enter
                      </span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="p-12 border border-dashed border-border text-center">
            <Radio className="w-5 h-5 text-muted-foreground mx-auto mb-4 opacity-40" />
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">
              No stations yet
            </p>
            <p className="text-[10px] font-mono text-muted-foreground/60 tracking-wider">
              Create one to open a new channel for your cohort
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
