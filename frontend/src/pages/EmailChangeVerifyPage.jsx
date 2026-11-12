import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const EmailChangeVerifyPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState("loading");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const token = params.get("token");
    if (!token) { setState("error"); setMessage("Link non valido o scaduto."); return; }
    axios.post(`${API}/auth/email-change/verify`, { token })
      .then(({ data }) => { setState("success"); setMessage(data.message || "Indirizzo email aggiornato."); })
      .catch(error => { setState("error"); setMessage(error.response?.data?.detail || "Link non valido, già usato o scaduto."); });
  }, [params]);
  return <div className="mx-auto flex min-h-[70vh] max-w-md items-center p-4"><Card className="w-full"><CardHeader><CardTitle>{state === "success" ? "Email aggiornata" : state === "loading" ? "Verifica in corso" : "Verifica non riuscita"}</CardTitle></CardHeader><CardContent className="space-y-4 text-sm"><p>{message || "Attendi…"}</p>{state !== "loading" && <Button className="w-full" onClick={() => navigate("/login")}>Vai al login</Button>}</CardContent></Card></div>;
};
