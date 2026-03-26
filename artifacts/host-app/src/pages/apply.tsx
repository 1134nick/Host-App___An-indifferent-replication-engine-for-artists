import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { useSubmitApplication, useGetMyApplication } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { FileText, ChevronRight } from "lucide-react";
import { useEffect } from "react";

const applicationSchema = z.object({
  age: z.coerce.number().min(18, "Subject must be adult"),
  nationality: z.string().min(2, "Required field"),
  profession: z.string().min(2, "Required field"),
  educationalBackground: z.string().optional(),
  artistStatement: z.string().min(50, "Statement insufficient. Expand logic."),
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
    resolver: zodResolver(applicationSchema as any), // Type workaround for transform
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
      <div className="mb-12 border-b border-border pb-8">
        <FileText className="w-8 h-8 text-primary mb-6" strokeWidth={1} />
        <h1 className="text-3xl font-serif tracking-[0.2em] uppercase">Dossier Submission</h1>
        <p className="text-muted-foreground mt-4 text-sm tracking-widest uppercase border-l-2 border-primary pl-4">
          Data gathered here determines architectural placement. <br/>
          Be precise. Be devoid of pretense.
        </p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit as any)} className="space-y-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Chronological Age</label>
            <input 
              type="number"
              {...form.register("age")}
              className="w-full bg-background border-b border-border px-0 py-2 text-sm focus:outline-none focus:border-primary transition-colors font-mono"
            />
            {form.formState.errors.age && <p className="text-xs text-destructive mt-1">{form.formState.errors.age.message}</p>}
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Origin Node (Nationality)</label>
            <input 
              type="text"
              {...form.register("nationality")}
              className="w-full bg-background border-b border-border px-0 py-2 text-sm focus:outline-none focus:border-primary transition-colors font-mono"
              placeholder="e.g. DE, US, JP"
            />
            {form.formState.errors.nationality && <p className="text-xs text-destructive mt-1">{form.formState.errors.nationality.message}</p>}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-widest text-muted-foreground">Current Designation (Profession)</label>
          <input 
            type="text"
            {...form.register("profession")}
            className="w-full bg-background border-b border-border px-0 py-2 text-sm focus:outline-none focus:border-primary transition-colors font-mono"
            placeholder="e.g. Sculptor, Analyst, Architect"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-widest text-muted-foreground">Conditioning (Education - Optional)</label>
          <input 
            type="text"
            {...form.register("educationalBackground")}
            className="w-full bg-background border-b border-border px-0 py-2 text-sm focus:outline-none focus:border-primary transition-colors font-mono"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-widest text-muted-foreground">Capabilities (Comma separated)</label>
          <input 
            type="text"
            {...form.register("skillTags")}
            className="w-full bg-background border-b border-border px-0 py-2 text-sm focus:outline-none focus:border-primary transition-colors font-mono"
            placeholder="typography, sound design, logistics"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-widest text-muted-foreground flex items-center justify-between">
            <span>Primary Thesis (Artist Statement)</span>
            <span className="text-border">MIN 50 CHARS</span>
          </label>
          <textarea 
            {...form.register("artistStatement")}
            rows={6}
            className="w-full bg-card border border-border p-4 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all font-mono resize-none"
            placeholder="State your operational intent and theoretical framework..."
          />
          {form.formState.errors.artistStatement && <p className="text-xs text-destructive mt-1">{form.formState.errors.artistStatement.message}</p>}
        </div>

        <div className="pt-8 flex justify-end">
          <button 
            type="submit"
            disabled={submitApp.isPending}
            className="flex items-center gap-3 bg-foreground text-background hover:bg-primary px-8 py-4 text-xs tracking-[0.2em] uppercase transition-colors disabled:opacity-50 font-bold"
          >
            {submitApp.isPending ? "Transmitting..." : "Commit Dossier"}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
