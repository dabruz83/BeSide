import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const ResetPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (password.length < 10) {
      toast.error("La password deve contenere almeno 10 caratteri");
      return;
    }
    if (password !== confirmation) {
      toast.error("Le password non coincidono");
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API}/auth/reset-password`, { token, password });
      setCompleted(true);
      toast.success("Password aggiornata");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Link non valido o scaduto");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Link to="/" className="text-3xl font-bold text-primary">BESIDE</Link>
          <h1 className="text-2xl font-semibold mt-6">Nuova password</h1>
        </div>
        {!token ? (
          <p className="rounded-lg border border-destructive/30 p-4 text-sm">Il link non contiene un token valido.</p>
        ) : completed ? (
          <p className="rounded-lg border bg-muted/30 p-4 text-sm">Password aggiornata. Ora puoi accedere.</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="password">Nuova password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={10}
                maxLength={128}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmation">Conferma password</Label>
              <Input
                id="confirmation"
                type="password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                minLength={10}
                maxLength={128}
                autoComplete="new-password"
                required
              />
            </div>
            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? "Aggiornamento..." : "Aggiorna password"}
            </Button>
          </form>
        )}
        <p className="text-center text-sm">
          <Link to="/login" className="text-primary hover:underline">Vai al login</Link>
        </p>
      </div>
    </div>
  );
};
