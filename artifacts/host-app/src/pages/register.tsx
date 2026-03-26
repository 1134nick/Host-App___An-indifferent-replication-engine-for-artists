import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";

const registerSchema = z.object({
  email: z.string().email("Invalid identifier format"),
  password: z.string().min(8, "Security phrase must be 8+ chars"),
  displayName: z.string().min(2, "Designation required"),
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function Register() {
  const { register } = useAuth();

  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", displayName: "" }
  });

  const onSubmit = (data: RegisterForm) => {
    register.mutate({ data });
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
          <h2 className="depth-heading tracking-[0.2em] uppercase">Initialize</h2>
          <p className="text-xs text-muted-foreground mt-3 tracking-widest lowercase">begin intake</p>
        </div>

        {register.error && (
          <div className="mb-6 p-4 border border-destructive/30 bg-destructive/5 text-destructive text-xs flex items-start gap-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="uppercase tracking-wider">Initialization failed.</span>
          </div>
        )}

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Public Designation</label>
            <input
              type="text"
              {...form.register("displayName")}
              className="w-full bg-background border border-border px-4 py-3 text-sm focus:outline-none focus:border-primary transition-all font-mono"
              placeholder="alias or name"
            />
            {form.formState.errors.displayName && (
              <p className="text-xs text-destructive">{form.formState.errors.displayName.message}</p>
            )}
          </div>

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
            {form.formState.errors.password && (
              <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={register.isPending}
            className="w-full border border-foreground text-foreground hover:bg-foreground hover:text-background py-4 text-xs tracking-[0.2em] uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-8 font-medium"
          >
            {register.isPending ? "..." : "Create profile"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
