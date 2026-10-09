"use client";

import { useEffect, useState } from "react";
import { AuthForm } from "@/components/AuthForm";
import { Workspace } from "@/components/Workspace";
import { api, type User } from "@/lib/api";

export const App = () => {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    api<User>("/api/me")
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  const handleLogout = async () => {
    await api("/api/logout", "POST").catch(() => undefined);
    setUser(null);
  };

  if (user === undefined) {
    return null;
  }

  if (user === null) {
    return <AuthForm onSignedIn={setUser} />;
  }

  return <Workspace user={user} onLogout={handleLogout} onSignedOut={() => setUser(null)} />;
};
