import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";

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
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-card border border-border p-8 md:p-12 relative weave-pattern"
      >
        <div className="weave-divider w-full mb-10" />

        <div className="flex flex-col items-center mb-10 text-center">
          <h2 className="depth-heading tracking-[0.2em] uppercase">Authenticate</h2>
          <p className="text-xs text-muted-foreground mt-3 tracking-widest lowercase">provide credentials</p>
        </div>

        {login.error && (
          <div className="mb-6 p-4 border border-destructive/30 bg-destructive/5 text-destructive text-xs flex items-start gap-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="uppercase tracking-wider">Access denied.</span>
          </div>
        )}

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Email</label>
            <input
              type="email"
              {...form.register("email")}
              className="w-full bg-background border border-border px-4 py-3 text-sm focus:outline-none focus:border-primary transition-all font-mono"
            />
            {form.formState.errors.email && (
              <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Password</label>
            <input
              type="password"
              {...form.register("password")}
              className="w-full bg-background border border-border px-4 py-3 text-sm focus:outline-none focus:border-primary transition-all font-mono tracking-widest"
            />
          </div>

          <button
            type="submit"
            disabled={login.isPending}
            className="w-full border border-foreground text-foreground hover:bg-foreground hover:text-background py-4 text-xs tracking-[0.2em] uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-8 font-medium"
          >
            {login.isPending ? "..." : "Sign in"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
