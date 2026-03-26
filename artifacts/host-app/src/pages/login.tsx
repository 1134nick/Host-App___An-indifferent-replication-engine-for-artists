import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { KeyRound, AlertCircle } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Invalid credential format"),
  password: z.string().min(8, "Security phrase must be at least 8 characters"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
  const { login } = useAuth();
  
  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" }
  });

  const onSubmit = (data: LoginForm) => {
    login.mutate({ data });
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-card border border-border p-8 md:p-12 relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent"></div>
        
        <div className="flex flex-col items-center mb-10 text-center">
          <KeyRound className="w-8 h-8 text-primary mb-4 opacity-70" strokeWidth={1.5} />
          <h2 className="font-serif text-2xl tracking-[0.2em] uppercase">Authenticate</h2>
          <p className="text-xs text-muted-foreground mt-2 tracking-widest uppercase">Provide clearance credentials</p>
        </div>

        {login.error && (
          <div className="mb-6 p-4 border border-destructive/30 bg-destructive/5 text-destructive text-xs flex items-start gap-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="uppercase tracking-wider">Access Denied. Credentials invalid or revoked.</span>
          </div>
        )}

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Identifier (Email)</label>
            <input 
              type="email"
              {...form.register("email")}
              className="w-full bg-background border border-border px-4 py-3 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all font-mono"
              placeholder="operator@domain.ext"
            />
            {form.formState.errors.email && (
              <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Security Phrase</label>
            <input 
              type="password"
              {...form.register("password")}
              className="w-full bg-background border border-border px-4 py-3 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all font-mono tracking-widest"
              placeholder="••••••••"
            />
          </div>

          <button 
            type="submit"
            disabled={login.isPending}
            className="w-full bg-foreground text-background hover:bg-primary py-4 text-xs tracking-[0.2em] uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-8 font-bold"
          >
            {login.isPending ? "Verifying..." : "Establish Connection"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
