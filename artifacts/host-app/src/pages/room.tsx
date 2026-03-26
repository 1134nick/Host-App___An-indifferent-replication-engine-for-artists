import { useParams, Link } from "wouter";
import { useGetRoomMessages, useSendMessage, useGetMyRole } from "@workspace/api-client-react";
import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, TerminalSquare } from "lucide-react";

export default function Room() {
  const { id } = useParams();
  const roomId = parseInt(id || "0", 10);
  
  const { data: messages, isLoading } = useGetRoomMessages(roomId, { limit: 100 }, {
    query: {
      refetchInterval: 3000, // naive polling for real-time feel
    }
  });
  
  const { data: role } = useGetMyRole();
  const sendMessageMutation = useSendMessage();
  const queryClient = useQueryClient();
  
  const [content, setContent] = useState("");
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    
    sendMessageMutation.mutate(
      { roomId, data: { content } },
      {
        onSuccess: () => {
          setContent("");
          queryClient.invalidateQueries({ queryKey: [`/api/rooms/${roomId}/messages`] });
        }
      }
    );
  };

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center font-mono text-muted-foreground">Decrypting stream...</div>;
  }

  const isPeripheral = role?.roleType === "peripheral";

  return (
    <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full px-4 py-6 h-[calc(100vh-4rem)]">
      <header className="flex justify-between items-center mb-6 pb-4 border-b border-border shrink-0">
        <Link href="/dashboard" className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Retreat
        </Link>
        <div className="flex items-center gap-3">
          <TerminalSquare className="w-5 h-5 text-primary" />
          <span className="font-serif text-xl uppercase tracking-[0.2em]">Comm Channel {roomId}</span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto mb-6 pr-4 space-y-4 flex flex-col font-mono text-sm">
        {messages?.length === 0 && (
          <div className="text-center text-muted-foreground italic my-auto">
            Channel silent. Be the first to emit.
          </div>
        )}
        
        {messages?.map((msg) => {
          const isSystem = msg.isSystemMessage;
          return (
            <div 
              key={msg.id} 
              className={`p-4 border ${isSystem ? 'bg-primary/5 border-primary/30 text-primary' : 'bg-card border-border'}`}
            >
              <div className="flex justify-between items-start mb-2 text-xs opacity-70 border-b border-border/50 pb-2">
                <span className="font-bold tracking-wider">
                  {isSystem ? "SYSTEM_BROADCAST" : (msg.maskedSenderLabel || "Unknown Entity")}
                </span>
                <span>{new Date(msg.createdAt).toLocaleTimeString()}</span>
              </div>
              <p className="whitespace-pre-wrap text-foreground">{msg.content}</p>
            </div>
          );
        })}
        <div ref={endOfMessagesRef} />
      </div>

      <div className="shrink-0 bg-card border border-border p-2">
        {isPeripheral ? (
          <div className="p-4 text-center text-xs uppercase tracking-widest text-muted-foreground opacity-50">
            Write access restricted. Observation only.
          </div>
        ) : (
          <form onSubmit={handleSend} className="flex gap-2">
            <input
              type="text"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Transmit sequence..."
              className="flex-1 bg-background border-none px-4 py-3 focus:outline-none font-mono text-sm"
              disabled={sendMessageMutation.isPending}
            />
            <button
              type="submit"
              disabled={!content.trim() || sendMessageMutation.isPending}
              className="px-6 py-3 bg-foreground text-background font-bold tracking-widest text-xs uppercase hover:bg-primary transition-colors disabled:opacity-50"
            >
              Emit
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
