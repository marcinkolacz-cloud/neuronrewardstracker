/**
 * Add neuron page — form to start tracking an NNS neuron.
 *
 * Fields: neuron ID, name (optional), dissolve delay (months), start date,
 *   initial stake (ICP).
 * On submit: calls addNeuron(id, name, startDate, dissolveDelaySeconds,
 *   initialStakeE8s), then triggers an initial syncNeuron.
 * On success: redirects to the dashboard.
 */

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAddNeuron } from "@/hooks/use-neurons";
import { useSyncNeuron } from "@/hooks/use-sync";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, BrainCircuit, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";

interface FormState {
  neuronId: string;
  name: string;
  dissolveDelay: string; // months
  startDate: string; // yyyy-mm-dd
  initialStake: string; // ICP
}

interface FormErrors {
  neuronId?: string;
  dissolveDelay?: string;
  startDate?: string;
  initialStake?: string;
}

const EMPTY: FormState = {
  neuronId: "",
  name: "",
  dissolveDelay: "",
  startDate: "",
  initialStake: "",
};

const MONTH_SECONDS = 30 * 24 * 60 * 60; // ~30 days

function icpToE8s(icp: string): bigint | null {
  const n = Number(icp);
  if (!Number.isFinite(n) || n < 0) return null;
  return BigInt(Math.round(n * 1e8));
}

export function AddNeuronPage() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<FormErrors>({});
  const addNeuron = useAddNeuron();
  const syncNeuron = useSyncNeuron();
  const navigate = useNavigate();

  const validate = (): FormErrors => {
    const e: FormErrors = {};
    if (!form.neuronId.trim()) {
      e.neuronId = "Neuron ID is required";
    } else if (!/^\d+$/.test(form.neuronId.trim())) {
      e.neuronId = "Neuron ID must be a positive integer";
    }
    if (
      form.dissolveDelay &&
      (Number.isNaN(Number(form.dissolveDelay)) ||
        Number(form.dissolveDelay) < 0)
    ) {
      e.dissolveDelay = "Dissolve delay must be a non-negative number (months)";
    }
    if (form.startDate && Number.isNaN(new Date(form.startDate).getTime())) {
      e.startDate = "Invalid date";
    }
    if (form.initialStake && icpToE8s(form.initialStake) == null) {
      e.initialStake = "Initial stake must be a non-negative ICP amount";
    }
    return e;
  };

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    const neuronId = BigInt(form.neuronId.trim());
    const dissolveDelaySeconds = BigInt(
      Math.round(Number(form.dissolveDelay || "0") * MONTH_SECONDS),
    );
    const startDate = form.startDate
      ? BigInt(new Date(form.startDate).getTime()) * 1_000_000n
      : BigInt(Date.now()) * 1_000_000n;
    const initialStakeE8s = icpToE8s(form.initialStake || "0") ?? 0n;

    addNeuron.mutate(
      {
        id: neuronId,
        name: form.name.trim(),
        startDate,
        dissolveDelaySeconds,
        initialStakeE8s,
      },
      {
        onSuccess: () => {
          toast.success("Neuron added — syncing with governance…");
          // Trigger initial sync, then redirect regardless of sync outcome.
          syncNeuron.mutate(neuronId, {
            onSettled: () => {
              navigate({ to: "/" });
            },
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

  const submitting = addNeuron.isPending || syncNeuron.isPending;

  return (
    <div className="bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-48 opacity-30"
        style={{
          background:
            "radial-gradient(50% 60% at 50% 0%, oklch(var(--primary) / 0.10) 0%, oklch(var(--background) / 0) 70%)",
        }}
      />
      <div className="relative mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: "/" })}
          className="text-muted-foreground mb-6"
          data-ocid="add_neuron.back"
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
            <span className="bg-gradient-primary flex size-11 items-center justify-center rounded-xl shadow-md">
              <BrainCircuit className="size-5 text-primary-foreground" />
            </span>
            <div>
              <h1 className="text-foreground font-display text-2xl font-semibold tracking-tight">
                Add a neuron
              </h1>
              <p className="text-muted-foreground text-sm">
                Start tracking an NNS neuron by its ID. We'll sync maturity and
                rewards from governance.
              </p>
            </div>
          </div>

          <Card className="bg-card/60 border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Neuron details</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                <div className="space-y-2">
                  <Label
                    htmlFor="neuronId"
                    data-ocid="add_neuron.neuron_id.label"
                  >
                    Neuron ID <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="neuronId"
                    inputMode="numeric"
                    placeholder="e.g. 1234567890"
                    value={form.neuronId}
                    onChange={(e) => update("neuronId", e.target.value)}
                    aria-invalid={!!errors.neuronId}
                    aria-describedby={
                      errors.neuronId ? "neuronId-error" : undefined
                    }
                    data-ocid="add_neuron.neuron_id.input"
                    className="font-mono"
                  />
                  {errors.neuronId && (
                    <p
                      id="neuronId-error"
                      className="text-destructive text-xs"
                      data-ocid="add_neuron.neuron_id.field_error"
                    >
                      {errors.neuronId}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name" data-ocid="add_neuron.name.label">
                    Name{" "}
                    <span className="text-muted-foreground font-normal">
                      (optional)
                    </span>
                  </Label>
                  <Input
                    id="name"
                    placeholder="e.g. Long-term stake"
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    data-ocid="add_neuron.name.input"
                  />
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label
                      htmlFor="dissolveDelay"
                      data-ocid="add_neuron.dissolve_delay.label"
                    >
                      Dissolve delay{" "}
                      <span className="text-muted-foreground font-normal">
                        (months)
                      </span>
                    </Label>
                    <Input
                      id="dissolveDelay"
                      inputMode="numeric"
                      placeholder="e.g. 6"
                      value={form.dissolveDelay}
                      onChange={(e) => update("dissolveDelay", e.target.value)}
                      aria-invalid={!!errors.dissolveDelay}
                      aria-describedby={
                        errors.dissolveDelay ? "dissolveDelay-error" : undefined
                      }
                      data-ocid="add_neuron.dissolve_delay.input"
                      className="font-mono"
                    />
                    {errors.dissolveDelay && (
                      <p
                        id="dissolveDelay-error"
                        className="text-destructive text-xs"
                        data-ocid="add_neuron.dissolve_delay.field_error"
                      >
                        {errors.dissolveDelay}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="startDate"
                      data-ocid="add_neuron.start_date.label"
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
                      data-ocid="add_neuron.start_date.input"
                      className="font-mono"
                    />
                    {errors.startDate && (
                      <p
                        id="startDate-error"
                        className="text-destructive text-xs"
                        data-ocid="add_neuron.start_date.field_error"
                      >
                        {errors.startDate}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="initialStake"
                    data-ocid="add_neuron.initial_stake.label"
                  >
                    Initial stake{" "}
                    <span className="text-muted-foreground font-normal">
                      (ICP)
                    </span>
                  </Label>
                  <Input
                    id="initialStake"
                    inputMode="decimal"
                    placeholder="e.g. 100.0000"
                    value={form.initialStake}
                    onChange={(e) => update("initialStake", e.target.value)}
                    aria-invalid={!!errors.initialStake}
                    aria-describedby={
                      errors.initialStake ? "initialStake-error" : undefined
                    }
                    data-ocid="add_neuron.initial_stake.input"
                    className="font-mono"
                  />
                  {errors.initialStake && (
                    <p
                      id="initialStake-error"
                      className="text-destructive text-xs"
                      data-ocid="add_neuron.initial_stake.field_error"
                    >
                      {errors.initialStake}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => navigate({ to: "/" })}
                    disabled={submitting}
                    data-ocid="add_neuron.cancel_button"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={submitting}
                    data-ocid="add_neuron.submit_button"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Adding…
                      </>
                    ) : (
                      "Add neuron"
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
