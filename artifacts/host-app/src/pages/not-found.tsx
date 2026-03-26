import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="text-center space-y-6">
        <h1 className="depth-text-lg uppercase tracking-[0.3em]">404</h1>
        <p className="text-xs text-muted-foreground lowercase tracking-widest">nothing here</p>
        <Link
          href="/"
          className="inline-block px-6 py-2 border border-border text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
        >
          Return
        </Link>
      </div>
    </div>
  );
}
