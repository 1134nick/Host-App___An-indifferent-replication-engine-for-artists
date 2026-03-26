import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { LogOut, Hexagon } from "lucide-react";
import { motion } from "framer-motion";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isAuthenticated } = useAuth();
  const [location] = useLocation();

  const isLanding = location === "/";

  return (
    <div className="min-h-screen flex flex-col relative selection:bg-primary/30">
      <nav className="fixed top-0 w-full z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 text-foreground hover:text-primary transition-colors group">
            <Hexagon className="w-5 h-5 group-hover:rotate-90 transition-transform duration-700" />
            <span className="font-serif font-bold tracking-[0.2em] text-lg mt-1">HOST</span>
          </Link>

          <div className="flex items-center gap-6 text-xs uppercase tracking-widest text-muted-foreground">
            {isAuthenticated ? (
              <>
                <Link href="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link>
                <Link href="/status" className="hover:text-foreground transition-colors">Status</Link>
                {user?.isAdmin && (
                  <Link href="/admin" className="text-primary hover:text-primary/80 transition-colors">Root Access</Link>
                )}
                <div className="w-px h-4 bg-border"></div>
                <button 
                  onClick={() => logout.mutate()}
                  className="flex items-center gap-2 hover:text-foreground transition-colors"
                >
                  <LogOut className="w-3 h-3" />
                  Terminate
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="hover:text-foreground transition-colors">Authenticate</Link>
                <Link href="/register" className="px-4 py-2 border border-border hover:border-primary hover:text-primary transition-all duration-300">
                  Initialize
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="flex-1 pt-16 flex flex-col">
        {children}
      </main>

      {!isLanding && (
        <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground uppercase tracking-widest mt-auto">
          <p>The machine keeps its mask on.</p>
        </footer>
      )}
    </div>
  );
}
