import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { LogOut } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isAuthenticated } = useAuth();
  const [location] = useLocation();

  const isLanding = location === "/";

  return (
    <div className="min-h-screen flex flex-col relative">
      <nav className="fixed top-0 w-full z-50 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="depth-text text-sm tracking-[0.25em] uppercase">
            Host
          </Link>

          <div className="flex items-center gap-6 text-xs uppercase tracking-widest text-muted-foreground">
            {isAuthenticated ? (
              <>
                <Link href="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link>
                <Link href="/stations" className="hover:text-foreground transition-colors">Stations</Link>
                <Link href="/status" className="hover:text-foreground transition-colors">Status</Link>
                {user?.isAdmin && (
                  <Link href="/admin" className="text-primary hover:text-primary/80 transition-colors">Root</Link>
                )}
                <div className="w-px h-3 bg-border" />
                <button
                  onClick={() => logout.mutate()}
                  className="flex items-center gap-2 hover:text-foreground transition-colors"
                >
                  <LogOut className="w-3 h-3" />
                  Exit
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="hover:text-foreground transition-colors">Sign in</Link>
                <Link href="/register" className="px-4 py-1.5 border border-border hover:border-primary hover:text-primary transition-all duration-300">
                  Enter
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="flex-1 pt-14 flex flex-col">
        {children}
      </main>

      {!isLanding && (
        <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground/40 uppercase tracking-widest mt-auto">
          <p>nothing is built on stone</p>
        </footer>
      )}
    </div>
  );
}
