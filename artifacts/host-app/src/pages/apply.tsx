import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { useSubmitApplication, useGetMyApplication } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useEffect } from "react";

const applicationSchema = z.object({
  age: z.coerce.number().min(18, "Must be 18+"),
  nationality: z.string().min(2, "Required"),
  profession: z.string().min(2, "Required"),
  educationalBackground: z.string().optional(),
  artistStatement: z.string().min(50, "Minimum 50 characters."),
  skillTags: z.string().transform(str => str.split(",").map(s => s.trim()).filter(Boolean))
});

type ApplicationForm = z.infer<typeof applicationSchema>;

export default function Apply() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { data: existingApp, isLoading: appLoading } = useGetMyApplication({ query: { retry: false } });
  const submitApp = useSubmitApplication();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) setLocation("/login");
    if (existingApp) setLocation("/status");
  }, [isAuthenticated, authLoading, existingApp, setLocation]);

  const form = useForm<ApplicationForm>({
    resolver: zodResolver(applicationSchema as any),
    defaultValues: {
      age: 18,
      nationality: "",
      profession: "",
      educationalBackground: "",
      artistStatement: "",
      skillTags: [] as any
    }
  });

  const onSubmit = (data: ApplicationForm) => {
    submitApp.mutate({ data }, {
      onSuccess: () => {
        setLocation("/status");
      }
    });
  };

  if (authLoading || appLoading) return null;
  if (existingApp) return null;

  return (
    <div className="flex-1 max-w-3xl mx-auto w-full px-6 py-12">
      <div className="mb-12 pb-8">
        <h1 className="depth-text text-xl tracking-[0.2em] uppercase mb-4">Dossier</h1>
        <div className="weave-divider w-full mb-4" />
        <p className="text-muted-foreground text-xs tracking-widest lowercase">
          be precise. be devoid of pretense.
        </p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit as any)} className="space-y-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Age</label>
            <input
              type="number"
              {...form.register("age")}
              className="w-full bg-background border-b border-border px-0 py-2 text-sm focus:outline-none focus:border-primary transition-colors font-mono"
            />
            {form.formState.errors.age && <p className="text-xs text-destructive mt-1">{form.formState.errors.age.message}</p>}
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Nationality</label>
            <input
              type="text"
              {...form.register("nationality")}
              className="w-full bg-background border-b border-border px-0 py-2 text-sm focus:outline-none focus:border-primary transition-colors font-mono"
            />
            {form.formState.errors.nationality && <p className="text-xs text-destructive mt-1">{form.formState.errors.nationality.message}</p>}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-widest text-muted-foreground">Profession</label>
          <input
            type="text"
            {...form.register("profession")}
            className="w-full bg-background border-b border-border px-0 py-2 text-sm focus:outline-none focus:border-primary transition-colors font-mono"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-widest text-muted-foreground">Education (optional)</label>
          <input
            type="text"
            {...form.register("educationalBackground")}
            className="w-full bg-background border-b border-border px-0 py-2 text-sm focus:outline-none focus:border-primary transition-colors font-mono"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-widest text-muted-foreground">Skills (comma separated)</label>
          <input
            type="text"
            {...form.register("skillTags")}
            className="w-full bg-background border-b border-border px-0 py-2 text-sm focus:outline-none focus:border-primary transition-colors font-mono"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-widest text-muted-foreground flex items-center justify-between">
            <span>Artist statement</span>
            <span className="text-border text-[10px]">MIN 50 CHARS</span>
          </label>
          <textarea
            {...form.register("artistStatement")}
            rows={6}
            className="w-full bg-card border border-border p-4 text-sm focus:outline-none focus:border-primary transition-all font-mono resize-none"
          />
          {form.formState.errors.artistStatement && <p className="text-xs text-destructive mt-1">{form.formState.errors.artistStatement.message}</p>}
        </div>

        <div className="pt-6 flex justify-end">
          <button
            type="submit"
            disabled={submitApp.isPending}
            className="border border-foreground text-foreground hover:bg-foreground hover:text-background px-8 py-3 text-xs tracking-[0.2em] uppercase transition-colors disabled:opacity-50 font-medium"
          >
            {submitApp.isPending ? "..." : "Submit"}
          </button>
        </div>
      </form>
    </div>
  );
}
