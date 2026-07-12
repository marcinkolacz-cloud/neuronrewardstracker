/**
 * Add WTN position page — form to start tracking a WaterNeuron (WTN) position.
 *
 * WTN positions are fully separate from NNS neurons — no governance sync, no
 * hotkey, manual snapshot entry only. This form collects just a name and an
 * optional start date, then calls useCreateWtnPosition and navigates to the
 * new position's detail page on success.
 *
 * Layout mirrors add-neuron.tsx but with only the name + start date fields
 * (no neuron ID, no dissolve delay, no initial stake).
 */

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateWtnPosition } from "@/hooks/use-wtn";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Droplets, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";

interface FormState {
  name: string;
  startDate: string; // yyyy-mm-dd
}

interface FormErrors {
  name?: string;
  startDate?: string;
}

const EMPTY: FormState = {
  name: "",
  startDate: "",
};

export function AddWtnPage() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<FormErrors>({});
  const createPosition = useCreateWtnPosition();
  const navigate = useNavigate();

  const validate = (): FormErrors => {
    const e: FormErrors = {};
    if (!form.name.trim()) {
      e.name = "Name is required";
    }
    if (form.startDate && Number.isNaN(new Date(form.startDate).getTime())) {
      e.startDate = "Invalid date";
    }
    return e;
  };

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    const startDate = form.startDate
      ? BigInt(new Date(form.startDate).getTime()) * 1_000_000n
      : BigInt(Date.now()) * 1_000_000n;

    createPosition.mutate(
      { name: form.name.trim(), startDate },
      {
        onSuccess: (position) => {
          toast.success("WTN position created");
          navigate({
            to: "/wtn-detail/$positionId",
            params: { positionId: position.id.toString() },
          });
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const update = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const submitting = createPosition.isPending;

  return (
    <div className="bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-48 opacity-30"
        style={{
          background:
            "radial-gradient(50% 60% at 50% 0%, oklch(var(--accent) / 0.12) 0%, oklch(var(--background) / 0) 70%)",
        }}
      />
      <div className="relative mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: "/" })}
          className="text-muted-foreground mb-6"
          data-ocid="add_wtn.back"
        >
          <ArrowLeft className="size-4" />
          Back to dashboard
        </Button>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="mb-6 flex items-center gap-3">
            <span className="bg-accent/15 text-accent flex size-11 items-center justify-center rounded-xl shadow-md">
              <Droplets className="size-5" />
            </span>
            <div>
              <h1 className="text-foreground font-display text-2xl font-semibold tracking-tight">
                Add a WTN position
              </h1>
              <p className="text-muted-foreground text-sm">
                Start tracking a WaterNeuron position. Snapshots are entered
                manually — no governance sync or hotkey required.
              </p>
            </div>
          </div>

          <Card className="bg-card/60 border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Position details</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                <div className="space-y-2">
                  <Label htmlFor="name" data-ocid="add_wtn.name.label">
                    Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="name"
                    placeholder="e.g. Main WTN stake"
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    aria-invalid={!!errors.name}
                    aria-describedby={errors.name ? "name-error" : undefined}
                    data-ocid="add_wtn.name.input"
                  />
                  {errors.name && (
                    <p
                      id="name-error"
                      className="text-destructive text-xs"
                      data-ocid="add_wtn.name.field_error"
                    >
                      {errors.name}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="startDate"
                    data-ocid="add_wtn.start_date.label"
                  >
                    Start date{" "}
                    <span className="text-muted-foreground font-normal">
                      (optional)
                    </span>
                  </Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={form.startDate}
                    onChange={(e) => update("startDate", e.target.value)}
                    aria-invalid={!!errors.startDate}
                    aria-describedby={
                      errors.startDate ? "startDate-error" : undefined
                    }
                    data-ocid="add_wtn.start_date.input"
                    className="font-mono"
                  />
                  {errors.startDate && (
                    <p
                      id="startDate-error"
                      className="text-destructive text-xs"
                      data-ocid="add_wtn.start_date.field_error"
                    >
                      {errors.startDate}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => navigate({ to: "/" })}
                    disabled={submitting}
                    data-ocid="add_wtn.cancel_button"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={submitting}
                    data-ocid="add_wtn.submit_button"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Creating…
                      </>
                    ) : (
                      "Create position"
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

export default AddWtnPage;
