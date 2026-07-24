import { useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const ForgotPasswordPage = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await axios.post(`${API}/auth/forgot-password`, { email });
      setSent(true);
      toast.success(response.data.message);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Impossibile completare la richiesta");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Link to="/" className="text-3xl font-bold text-primary">BESIDE</Link>
          <h1 className="text-2xl font-semibold mt-6">Password dimenticata</h1>
          <p className="text-muted-foreground mt-2">
            Inserisci la tua email. Se è registrata, riceverai un link monouso.
          </p>
        </div>
        {!sent ? (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? "Invio in corso..." : "Invia link di recupero"}
            </Button>
          </form>
        ) : (
          <p className="rounded-lg border bg-muted/30 p-4 text-sm">
            Richiesta completata. Controlla anche la cartella spam.
          </p>
        )}
        <p className="text-center text-sm">
          <Link to="/login" className="text-primary hover:underline">Torna al login</Link>
        </p>
      </div>
    </div>
  );
};
